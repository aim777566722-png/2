import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { Medicine, Supplier, MarketPriceRecord, OrderItem, PharmacyOrder, PurchaseInvoice } from '../types';
import { Storage } from '../data/storage';
import {
  cleanAndFormatMedicineName,
  parseMedicineOrderLine,
  computeMedicinePriceSummary,
  playNotificationChime,
  validateAndSanitizeInvoiceItemList
} from '../utils/helpers';
import { findSimilarMedicine } from '../utils/similarity';
import {
  parseDocumentClientSide,
  parsePharmacyOrderClientSide,
  parsePurchaseInvoiceClientSide
} from '../services/geminiClient';
import { mapTableDataToMedicineItems } from '../utils/documentParser';
import { analyzeDocumentLocally } from '../services/localAnalysis';

export type TaskType = 'document' | 'order' | 'invoice';
export type TaskStatus = 'processing' | 'completed' | 'error';
export type AnalysisMode = 'ai' | 'local';

export interface TaskStage {
  id: number;
  label: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface TaskLogItem {
  id: string;
  timestamp: string;
  message: string;
  percent: number;
  type?: 'info' | 'success' | 'warn';
}

export interface BackgroundTask {
  id: string;
  type: TaskType;
  title: string;
  subtitle: string;
  filesCount: number;
  status: TaskStatus;
  progress: number;
  currentStep: string;
  currentStageIndex: number;
  stages: TaskStage[];
  logs: TaskLogItem[];
  startedAt: number;
  completedAt?: number;
  resultSummary?: string;
  itemsCount?: number;
  error?: string;
  targetTab: 'document-upload' | 'orders' | 'order-intake' | 'invoice-intake';
  payload: {
    uploadedFiles?: any[];
    targetType?: string;
    partyName?: string;
    extractionMode?: string;
    analysisMode?: AnalysisMode;
    extractedData?: any;
    autoSavedNotice?: string | null;
    uploadedImages?: any[];
    orderText?: string;
    parsedItems?: OrderItem[];
    pharmacyName?: string;
    orderNumber?: string;
    invoiceRawText?: string;
    invoiceSupplierId?: string;
    invoiceSupplierName?: string;
    invoiceNumber?: string;
    invoiceDate?: string;
    invoiceItems?: any[];
    invoiceTotal?: number;
  };
}

interface BackgroundAnalysisContextType {
  activeTask: BackgroundTask | null;
  tasksHistory: BackgroundTask[];
  isBannerVisible: boolean;
  setIsBannerVisible: (visible: boolean) => void;
  startDocumentTask: (params: {
    files: any[];
    targetType: 'order' | 'invoice' | 'price_list';
    partyName?: string;
    extractionMode?: 'standard' | 'handwritten' | 'table' | 'pure_text';
    analysisMode?: AnalysisMode;
    knownMedicines: Medicine[];
    knownSuppliers: Supplier[];
  }) => Promise<string>;
  startOrderTask: (params: {
    orderText?: string;
    uploadedImages?: any[];
    inputMode: 'text' | 'camera' | 'file';
    pharmacyName: string;
    orderNumber: string;
    knownMedicines: Medicine[];
    marketPrices: MarketPriceRecord[];
  }) => Promise<string>;
  startInvoiceTask: (params: {
    rawText?: string;
    uploadedImages?: any[];
    knownSuppliers: Supplier[];
    knownMedicines: Medicine[];
    activeTabMode: 'image' | 'text';
  }) => Promise<string>;
  dismissBanner: () => void;
  clearTask: (taskId?: string) => void;
  clearActiveTask: () => void;
}

const BackgroundAnalysisContext = createContext<BackgroundAnalysisContextType | null>(null);

const DEFAULT_STAGES: TaskStage[] = [
  { id: 1, label: 'تجهيز وضغط المرفقات', description: 'قراءة الملفات والصور ومعالجة الدقة', status: 'pending' },
  { id: 2, label: 'تحليل المستند', description: 'تحليل النصوص والصور والجداول', status: 'pending' },
  { id: 3, label: 'التنقيح والمطابقة الصيدلانية', description: 'تدقيق الأشكال والتراكيز والأسعار', status: 'pending' },
  { id: 4, label: 'اعتماد وهيكلة النتائج', description: 'تجهيز البيانات للمعاينة والتثبيت', status: 'pending' },
];

function updateStagesStatus(currentStageIndex: number, isComplete = false): TaskStage[] {
  return DEFAULT_STAGES.map(stage => {
    if (isComplete) return { ...stage, status: 'completed' };
    if (stage.id < currentStageIndex) return { ...stage, status: 'completed' };
    if (stage.id === currentStageIndex) return { ...stage, status: 'in_progress' };
    return { ...stage, status: 'pending' };
  });
}

function getLogTime(): string {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}

export const BackgroundAnalysisProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [activeTask, setActiveTask] = useState<BackgroundTask | null>(null);
  const [tasksHistory, setTasksHistory] = useState<BackgroundTask[]>([]);
  const [isBannerVisible, setIsBannerVisible] = useState(false);
  const [analysisModePromptVisible, setAnalysisModePromptVisible] = useState(false);
  const analysisModeResolverRef = useRef<((mode: AnalysisMode) => void) | null>(null);

  const requestAnalysisMode = (): Promise<AnalysisMode> => new Promise(resolve => {
    analysisModeResolverRef.current = resolve;
    setAnalysisModePromptVisible(true);
  });

  const chooseAnalysisMode = (mode: AnalysisMode) => {
    const resolve = analysisModeResolverRef.current;
    analysisModeResolverRef.current = null;
    setAnalysisModePromptVisible(false);
    resolve?.(mode);
  };

  useEffect(() => {
    return () => {
      analysisModeResolverRef.current = null;
    };
  }, []);

  useEffect(() => {
    try {
      const savedTask = Storage.getActiveTask();
      if (savedTask) {
        if (savedTask.status === 'processing') {
          const recoveredTask: BackgroundTask = {
            ...savedTask,
            status: 'error',
            error: 'تمت مقاطعة مهمة التحليل بسبب إغلاق التطبيق. يرجى إعادة رفع المستند.',
            currentStep: 'تنبيه: مهمة سابقة لم تكتمل بسبب إغلاق التطبيق'
          };
          setActiveTask(recoveredTask);
          setIsBannerVisible(true);
          Storage.saveActiveTask(recoveredTask);
        } else if (savedTask.status === 'completed') {
          setActiveTask(savedTask);
          setIsBannerVisible(true);
        }
      }
    } catch (e) {
      console.warn('Error recovering saved active task:', e);
    }
  }, []);

  useEffect(() => {
    Storage.saveActiveTask(activeTask);
  }, [activeTask]);

  const startDocumentTask = async ({
    files,
    targetType,
    partyName,
    extractionMode = 'standard',
    analysisMode: requestedAnalysisMode,
    knownMedicines,
    knownSuppliers
  }: {
    files: any[];
    targetType: 'order' | 'invoice' | 'price_list';
    partyName?: string;
    extractionMode?: 'standard' | 'handwritten' | 'table' | 'pure_text';
    analysisMode?: AnalysisMode;
    knownMedicines: Medicine[];
    knownSuppliers: Supplier[];
  }): Promise<string> => {
    const analysisMode = requestedAnalysisMode || await requestAnalysisMode();
    const taskId = `task-doc-${Date.now()}`;
    const targetLabel = targetType === 'order' ? 'طلب صيدلية' : targetType === 'invoice' ? 'فاتورة شراء' : 'عروض أسعار';
    const modeLabel = analysisMode === 'local' ? 'تحليل محلي' : 'تحليل بالذكاء الاصطناعي';

    const initialLog: TaskLogItem = {
      id: `log-${Date.now()}-0`,
      timestamp: getLogTime(),
      message: `بدء ${modeLabel} لمستند ${targetLabel} (${files.length} مرفقات)`,
      percent: 10,
      type: 'info'
    };

    const newTask: BackgroundTask = {
      id: taskId,
      type: 'document',
      title: `${modeLabel} — ${targetLabel}`,
      subtitle: `${files.length} ${files.length === 1 ? 'ملف مرفوع' : 'ملفات مرفوعة'}${partyName ? ` • ${partyName}` : ''}`,
      filesCount: files.length,
      status: 'processing',
      progress: 10,
      currentStep: analysisMode === 'local' ? 'جاري تجهيز محرك التحليل المحلي...' : 'جاري فحص وتجهيز الملفات والمصفوفات البصرية...',
      currentStageIndex: 1,
      stages: updateStagesStatus(1),
      logs: [initialLog],
      startedAt: Date.now(),
      targetTab: 'document-upload',
      payload: { uploadedFiles: files, targetType, partyName, extractionMode, analysisMode }
    };

    setActiveTask(newTask);
    setIsBannerVisible(true);

    setTimeout(async () => {
      try {
        let aggregatedText = '';
        const aggregatedTable: Array<Record<string, any>> = [];
        const imagesPayload: Array<{ name: string; base64: string; mimeType: string }> = [];

        const updateTaskProgress = (progress: number, stepText: string, stageIndex = 2, logType: 'info' | 'success' | 'warn' = 'info') => {
          setActiveTask(prev => {
            if (!prev || prev.id !== taskId) return prev;
            const newLogs = [
              {
                id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                timestamp: getLogTime(),
                message: stepText,
                percent: progress,
                type: logType
              },
              ...prev.logs.slice(0, 15)
            ];
            return {
              ...prev,
              progress: Math.min(progress, 99),
              currentStep: stepText,
              currentStageIndex: stageIndex,
              stages: updateStagesStatus(stageIndex),
              logs: newLogs
            };
          });
        };

        files.forEach((fileItem, idx) => {
          const perFileProgress = Math.round(10 + ((idx + 1) / files.length) * 15);
          updateTaskProgress(perFileProgress, `جاري فحص وتجهيز الملف ${idx + 1} من ${files.length} (${fileItem.name})...`, 1);

          if (fileItem.extractedText) {
            aggregatedText += `\n--- [الملف/الصفحة ${idx + 1}: ${fileItem.name}] ---\n${fileItem.extractedText}\n`;
          }
          if (fileItem.tableData && fileItem.tableData.length > 0) aggregatedTable.push(...fileItem.tableData);
          if (fileItem.pageImages && fileItem.pageImages.length > 0) {
            fileItem.pageImages.forEach((pImg: string, pIdx: number) => {
              imagesPayload.push({ name: `${fileItem.name} (صفحة ${pIdx + 1})`, base64: pImg, mimeType: 'image/jpeg' });
            });
          } else if (fileItem.base64) {
            imagesPayload.push({ name: fileItem.name, base64: fileItem.base64, mimeType: fileItem.mimeType || 'image/jpeg' });
          }
        });

        const rawTableRows = (aggregatedTable.length > 0 || (!imagesPayload.length && aggregatedText.trim()))
          ? mapTableDataToMedicineItems(aggregatedTable.length > 0 ? aggregatedTable : undefined, aggregatedText.trim())
          : [];
        const fullExtractedTableRows = validateAndSanitizeInvoiceItemList(rawTableRows);

        let extracted: any;

        if (analysisMode === 'local') {
          updateTaskProgress(28, 'تم تجهيز المرفقات. بدء التحليل المحلي الهجين دون إرسال البيانات إلى Gemini...', 2, 'success');
          extracted = await analyzeDocumentLocally({
            files,
            targetType,
            knownMedicines: knownMedicines.map(m => m.name),
            knownSuppliers: knownSuppliers.map(s => s.name),
            onProgress: (p, msg, stage) => updateTaskProgress(p, msg, stage || 2)
          });
        } else {
          if (fullExtractedTableRows.length > 0) {
            updateTaskProgress(30, `تم التعرف على جدول بيانات يحتوي على ${fullExtractedTableRows.length} صنفاً. جاري الفحص الذكي...`, 2, 'success');
          } else {
            updateTaskProgress(28, `تم تجهيز ${files.length} مرفقات بنجاح. جاري استدعاء محرك الذكاء الاصطناعي...`, 2, 'success');
          }

          let resJson: any = null;
          try {
            resJson = await parseDocumentClientSide({
              documentType: targetType,
              extractionMode,
              fileName: files.map(f => f.name).join(' + '),
              fileText: aggregatedText.trim() || undefined,
              tableData: aggregatedTable.length > 0 ? aggregatedTable : undefined,
              images: imagesPayload.length > 0 ? imagesPayload : undefined,
              knownMedicines: knownMedicines.map(m => m.name),
              knownSuppliers: knownSuppliers.map(s => s.name),
              onProgress: (p, msg, stage) => updateTaskProgress(p, msg, stage || 2)
            });
          } catch (fetchErr: any) {
            const message = fetchErr?.message || 'تعذر الاتصال بخادم تحليل الصور';
            updateTaskProgress(94, `فشل تحليل المستند: ${message}`, 2, 'warn');
            throw fetchErr instanceof Error ? fetchErr : new Error(message);
          }

          if (!resJson || !resJson.success || !resJson.data) {
            throw new Error('خادم الذكاء الاصطناعي لم يُرجع نتيجة صالحة للمستند.');
          }
          extracted = resJson.data;
        }

        updateTaskProgress(92, analysisMode === 'local' ? 'جاري تنقية النصوص ومطابقة الأصناف محلياً...' : 'جاري تنقية أسماء الأدوية وحساب المجاميع وتواريخ الانتهاء والبونص...', 3);

        const validatedExtractedItems = Array.isArray(extracted.items)
          ? validateAndSanitizeInvoiceItemList(extracted.items)
          : [];

        const hasLargeExcelDataset = files.some(f => f.type === 'excel' || String(f.name || '').toLowerCase().endsWith('.xlsx') || String(f.name || '').toLowerCase().endsWith('.csv')) && fullExtractedTableRows.length > 10;

        if (analysisMode === 'local') {
          extracted.items = validatedExtractedItems;
          if (validatedExtractedItems.length === 0) {
            extracted.summary = 'لم يتم العثور على صفوف دوائية موثوقة في التحليل المحلي؛ لم يتم استبدال النتيجة ببيانات OCR غير موثوقة.';
          }
        } else if (hasLargeExcelDataset && fullExtractedTableRows.length > validatedExtractedItems.length) {
          extracted.items = fullExtractedTableRows;
          extracted.summary = `تم استخراج كافة الـ ${fullExtractedTableRows.length} صنفاً من الجدول المحلي.`;
        } else {
          extracted.items = validatedExtractedItems.length > 0 ? validatedExtractedItems : fullExtractedTableRows;
        }

        if (partyName && (!extracted.partyName || String(extracted.partyName).trim() === '')) extracted.partyName = partyName;

        const itemsCount = extracted?.items?.length || 0;

        setActiveTask(prev => {
          if (!prev || prev.id !== taskId) return prev;
          const completedTask: BackgroundTask = {
            ...prev,
            status: 'completed',
            progress: 100,
            currentStep: `اكتمل ${analysisMode === 'local' ? 'التحليل المحلي' : 'التحليل بالذكاء الاصطناعي'} بنجاح! تم استخراج ${itemsCount} صنفاً`,
            currentStageIndex: 4,
            stages: updateStagesStatus(4, true),
            completedAt: Date.now(),
            itemsCount,
            resultSummary: `${analysisMode === 'local' ? 'تحليل محلي' : 'تحليل بالذكاء الاصطناعي'}: تم استخراج ${itemsCount} صنفاً وجاهزة للمراجعة والتثبيت`,
            logs: [
              {
                id: `log-${Date.now()}-done`,
                timestamp: getLogTime(),
                message: `تم الانتهاء بنجاح واستخراج ${itemsCount} صنفاً صيدلانياً`,
                percent: 100,
                type: 'success'
              },
              ...prev.logs
            ],
            payload: { ...prev.payload, extractedData: extracted, analysisMode }
          };
          setTasksHistory(hist => [completedTask, ...hist.slice(0, 9)]);
          return completedTask;
        });
        playNotificationChime();
      } catch (err: any) {
        console.error('Background document analysis error:', err);
        setActiveTask(prev => {
          if (!prev || prev.id !== taskId) return prev;
          return {
            ...prev,
            status: 'error',
            progress: 100,
            currentStep: 'فشل تحليل المستند',
            error: err?.message || 'تعذر استخراج البيانات من الملف'
          };
        });
      }
    }, 150);

    return taskId;
  };

  const startOrderTask = async ({ orderText, uploadedImages, inputMode, pharmacyName, orderNumber, knownMedicines, marketPrices }: {
    orderText?: string;
    uploadedImages?: any[];
    inputMode: 'text' | 'camera' | 'file';
    pharmacyName: string;
    orderNumber: string;
    knownMedicines: Medicine[];
    marketPrices: MarketPriceRecord[];
  }): Promise<string> => {
    const taskId = `task-ord-${Date.now()}`;
    const filesCount = uploadedImages && uploadedImages.length > 0 ? uploadedImages.length : 1;
    const newTask: BackgroundTask = {
      id: taskId, type: 'order', title: `تحليل وتفكيك طلب صيدلية (${pharmacyName || 'طلب جديد'})`,
      subtitle: `${filesCount} ${uploadedImages && uploadedImages.length > 0 ? 'صور مرفوعة' : 'نص الطلب'}`,
      filesCount, status: 'processing', progress: 15,
      currentStep: 'جاري فحص أصناف الطلب ومطابقة الأسماء الدوائية...', currentStageIndex: 1,
      stages: updateStagesStatus(1),
      logs: [{ id: `log-${Date.now()}-ord`, timestamp: getLogTime(), message: 'بدء تفكيك وتحليل الطلب الصيدلاني', percent: 15, type: 'info' }],
      startedAt: Date.now(), targetTab: 'order-intake', payload: { orderText, uploadedImages, pharmacyName, orderNumber }
    };
    setActiveTask(newTask); setIsBannerVisible(true);

    setTimeout(async () => {
      try {
        const rawLines = (orderText || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const localParsedItems = rawLines.map(rawLine => {
          const parsed = parseMedicineOrderLine(rawLine);
          return { rawText: parsed.rawText || rawLine, matchedMedicineName: parsed.name || rawLine, quantity: parsed.quantity, unit: parsed.unit, isUncertain: parsed.isUncertain };
        });
        const updateOrderProgress = (progress: number, stepText: string, stageIndex = 2, logType: 'info' | 'success' | 'warn' = 'info') => {
          setActiveTask(prev => {
            if (!prev || prev.id !== taskId) return prev;
            return { ...prev, progress: Math.min(progress, 99), currentStep: stepText, currentStageIndex: stageIndex, stages: updateStagesStatus(stageIndex), logs: [{ id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, timestamp: getLogTime(), message: stepText, percent: progress, type: logType }, ...prev.logs.slice(0, 15)] };
          });
        };
        updateOrderProgress(30, 'استدعاء نموذج الذكاء الاصطناعي لفهم الخط اليدوي والأصناف...', 2);
        let extractedRawList: any[] = [];
        try {
          const imagesPayload = ((inputMode === 'camera' || inputMode === 'file') && uploadedImages && uploadedImages.length > 0)
            ? uploadedImages.map(img => ({ base64: img.base64, mimeType: img.mimeType, name: img.name })) : undefined;
          const json = await parsePharmacyOrderClientSide({ text: orderText, images: imagesPayload, knownMedicines, onProgress: (p, msg, st) => updateOrderProgress(p, msg, st || 2) });
          if (json && json.success) {
            if (Array.isArray(json.data)) extractedRawList = json.data;
            else if (json.data && Array.isArray(json.data.items)) extractedRawList = json.data.items;
            else if (Array.isArray((json as any).items)) extractedRawList = (json as any).items;
          }
        } catch (networkErr) {
          if (uploadedImages && uploadedImages.length > 0) throw networkErr;
          console.warn('API error in background order parsing:', networkErr);
        }
        if (rawLines.length > 0) {
          if (extractedRawList.length === 0) extractedRawList = localParsedItems;
          else if (extractedRawList.length < rawLines.length) {
            const aiRawTexts = new Set(extractedRawList.map(it => (it.rawText || '').trim().toLowerCase()));
            localParsedItems.forEach(localItem => {
              const cleanRaw = (localItem.rawText || '').trim().toLowerCase();
              if (!aiRawTexts.has(cleanRaw)) extractedRawList.push(localItem);
            });
          }
        }
        updateOrderProgress(88, 'جاري مطابقة أسعار السوق وأفضل عروض الموردين في اليمن...', 3);
        const parsedItems: OrderItem[] = extractedRawList.map((it: any, idx: number) => {
          let rawName = (it.matchedMedicineName || it.matchedName || it.medicineName || it.rawText || `صنف ${idx + 1}`).trim();
          let medName = cleanAndFormatMedicineName(rawName);
          let medId = it.matchedMedicineId || '';
          const sim = findSimilarMedicine(medName, knownMedicines);
          if (sim && (sim.isExact || sim.similarityScore >= 0.70)) { medName = sim.existingMedicine.name; medId = sim.existingMedicine.id; }
          const summary = computeMedicinePriceSummary(medId, medName, marketPrices, knownMedicines);
          return {
            id: `item-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`, rawText: cleanAndFormatMedicineName(it.rawText || rawName), matchedMedicineName: medName, matchedMedicineId: medId || (summary?.medicineId || undefined), quantity: Number(it.quantity) > 0 ? Number(it.quantity) : 1, unit: it.unit || 'علبة',
            isUncertain: it.isUncertain || false, uncertaintyReason: it.uncertaintyReason || undefined, notes: it.notes || '', referencePrice: summary?.lowestPrice || (Number(it.unitPrice) > 0 ? Number(it.unitPrice) : undefined), bestSupplierId: summary?.bestSupplierId, bestSupplierName: summary?.bestSupplierName, bestMarketPrice: summary?.lowestPrice || 0
          };
        });
        const itemsCount = parsedItems.length;
        setActiveTask(prev => {
          if (!prev || prev.id !== taskId) return prev;
          const completedTask: BackgroundTask = {
            ...prev, status: 'completed', progress: 100, currentStep: `تم الانتهاء بنجاح! تم استخراج وتنسيق ${itemsCount} صنفاً`, currentStageIndex: 4,
            stages: updateStagesStatus(4, true), completedAt: Date.now(), itemsCount, resultSummary: `تم استخراج ${itemsCount} صنفاً ومطابقة أسعارها بالسوق`,
            logs: [{ id: `log-${Date.now()}-done`, timestamp: getLogTime(), message: `تم تفكيك ${itemsCount} صنفاً ومطابقة أسعارها فورياً`, percent: 100, type: 'success' }, ...prev.logs],
            payload: { ...prev.payload, parsedItems }
          };
          setTasksHistory(hist => [completedTask, ...hist.slice(0, 9)]); return completedTask;
        });
        playNotificationChime();
      } catch (err: any) {
        console.error('Background order analysis error:', err);
        setActiveTask(prev => prev && prev.id === taskId ? { ...prev, status: 'error', progress: 100, currentStep: 'حدث خطأ أثناء المعالجة', error: err?.message || 'تعذر تفكيك واستخراج بيانات الطلب' } : prev);
      }
    }, 150);
    return taskId;
  };

  const startInvoiceTask = async ({ rawText, uploadedImages, knownSuppliers, knownMedicines, activeTabMode }: {
    rawText?: string; uploadedImages?: any[]; knownSuppliers: Supplier[]; knownMedicines: Medicine[]; activeTabMode: 'image' | 'text';
  }): Promise<string> => {
    const taskId = `task-inv-${Date.now()}`;
    const filesCount = uploadedImages && uploadedImages.length > 0 ? uploadedImages.length : 1;
    const newTask: BackgroundTask = {
      id: taskId, type: 'invoice', title: 'تحليل واستخراج فاتورة شراء', subtitle: `${filesCount} ${uploadedImages && uploadedImages.length > 0 ? 'صور فاتورة' : 'نص الفاتورة'}`,
      filesCount, status: 'processing', progress: 15, currentStep: 'جاري استخراج بيانات المورد ورقم الفاتورة والأصناف المشتراة...', currentStageIndex: 1,
      stages: updateStagesStatus(1), logs: [{ id: `log-${Date.now()}-inv`, timestamp: getLogTime(), message: 'بدء قراءة وتدقيق فاتورة الشراء', percent: 15, type: 'info' }],
      startedAt: Date.now(), targetTab: 'invoice-intake', payload: { invoiceRawText: rawText, uploadedImages }
    };
    setActiveTask(newTask); setIsBannerVisible(true);

    setTimeout(async () => {
      try {
        const updateInvoiceProgress = (progress: number, stepText: string, stageIndex = 2, logType: 'info' | 'success' | 'warn' = 'info') => {
          setActiveTask(prev => {
            if (!prev || prev.id !== taskId) return prev;
            return { ...prev, progress: Math.min(progress, 99), currentStep: stepText, currentStageIndex: stageIndex, stages: updateStagesStatus(stageIndex), logs: [{ id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, timestamp: getLogTime(), message: stepText, percent: progress, type: logType }, ...prev.logs.slice(0, 15)] };
          });
        };
        updateInvoiceProgress(30, 'جاري التعرف على الأسعار والكميات والبونص...', 2);
        let json: any = null;
        try {
          const imagesPayload = (activeTabMode === 'image' && uploadedImages && uploadedImages.length > 0) ? uploadedImages.map(img => ({ base64: img.base64, mimeType: img.mimeType, name: img.name })) : undefined;
          json = await parsePurchaseInvoiceClientSide({ text: rawText, images: imagesPayload, knownSuppliers, knownMedicines, onProgress: (p, msg, st) => updateInvoiceProgress(p, msg, st || 2) });
        } catch (fetchErr) {
          if (activeTabMode === 'image' && uploadedImages && uploadedImages.length > 0) throw fetchErr;
          console.warn('Error in client-side invoice parsing:', fetchErr);
        }
        updateInvoiceProgress(90, 'مطابقة أسماء الأدوية والموردين والتحقق من الإجماليات...', 3);
        let extractedItems: any[] = [], supplierName = '', supplierId = '', invoiceNumber = '', invoiceDate = new Date().toISOString().split('T')[0], totalAmount = 0;
        if (json && json.success && json.data) {
          const d = json.data;
          supplierName = d.supplierName || '';
          const matchedSup = knownSuppliers.find(s => s.name.toLowerCase().includes(supplierName.toLowerCase()) || supplierName.toLowerCase().includes(s.name.toLowerCase()));
          if (matchedSup) { supplierId = matchedSup.id; supplierName = matchedSup.name; }
          invoiceNumber = d.invoiceNumber || `INV-${Math.floor(1000 + Math.random() * 9000)}`;
          invoiceDate = d.invoiceDate || new Date().toISOString().split('T')[0];
          totalAmount = Number(d.totalAmount) || 0;
          if (Array.isArray(d.items)) extractedItems = d.items.map((it: any, idx: number) => ({ id: `inv-item-${Date.now()}-${idx}`, itemName: cleanAndFormatMedicineName(it.itemName || it.name || `صنف ${idx + 1}`), quantity: Number(it.quantity) || 1, unitPrice: Number(it.unitPrice) || 0, bonusScheme: it.bonusScheme || '', discountPercent: Number(it.discountPercent) || 0, totalPrice: Number(it.totalPrice) || ((Number(it.quantity) || 1) * (Number(it.unitPrice) || 0)) }));
        }
        const itemsCount = extractedItems.length;
        setActiveTask(prev => {
          if (!prev || prev.id !== taskId) return prev;
          const completedTask: BackgroundTask = {
            ...prev, status: 'completed', progress: 100, currentStep: `تم استخراج الفاتورة بنجاح! تم التعرف على ${itemsCount} صنفاً`, currentStageIndex: 4,
            stages: updateStagesStatus(4, true), completedAt: Date.now(), itemsCount, resultSummary: `فاتورة ${supplierName || 'المورد'} - ${itemsCount} صنف بإجمالي ${totalAmount.toLocaleString()} ر.ي`,
            logs: [{ id: `log-${Date.now()}-done`, timestamp: getLogTime(), message: `تم الانتهاء بنجاح واستخراج ${itemsCount} صنفاً من الفاتورة`, percent: 100, type: 'success' }, ...prev.logs],
            payload: { ...prev.payload, invoiceSupplierId: supplierId, invoiceSupplierName: supplierName, invoiceNumber, invoiceDate, invoiceItems: extractedItems, invoiceTotal: totalAmount }
          };
          setTasksHistory(hist => [completedTask, ...hist.slice(0, 9)]); return completedTask;
        });
        playNotificationChime();
      } catch (err: any) {
        console.error('Background invoice analysis error:', err);
        setActiveTask(prev => prev && prev.id === taskId ? { ...prev, status: 'error', progress: 100, currentStep: 'حدث خطأ أثناء معالجة الفاتورة', error: err?.message || 'تعذر استخراج بيانات الفاتورة' } : prev);
      }
    }, 150);
    return taskId;
  };

  const dismissBanner = () => setIsBannerVisible(false);
  const clearActiveTask = () => { setActiveTask(null); setIsBannerVisible(false); Storage.clearActiveTask(); };
  const clearTask = (taskId?: string) => {
    if (!taskId || (activeTask && activeTask.id === taskId)) { setActiveTask(null); setIsBannerVisible(false); Storage.clearActiveTask(); }
    if (taskId) setTasksHistory(prev => prev.filter(t => t.id !== taskId));
  };

  return (
    <BackgroundAnalysisContext.Provider value={{ activeTask, tasksHistory, isBannerVisible, setIsBannerVisible, startDocumentTask, startOrderTask, startInvoiceTask, dismissBanner, clearTask, clearActiveTask }}>
      {children}
      {analysisModePromptVisible && (
        <div dir="rtl" role="dialog" aria-modal="true" aria-labelledby="analysis-mode-title" style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'rgba(2, 8, 23, 0.72)', backdropFilter: 'blur(6px)' }}>
          <div style={{ width: 'min(560px, 100%)', borderRadius: 24, padding: 24, background: '#ffffff', boxShadow: '0 24px 80px rgba(0,0,0,.35)' }}>
            <div style={{ textAlign: 'center', marginBottom: 22 }}>
              <div style={{ fontSize: 30, marginBottom: 8 }}>اختر طريقة التحليل</div>
              <div id="analysis-mode-title" style={{ fontSize: 15, color: '#475569', lineHeight: 1.7 }}>سيتم تحليل الملف أو الصورة بالطريقة التي تختارها الآن.</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <button type="button" onClick={() => chooseAnalysisMode('ai')} style={{ cursor: 'pointer', border: '1px solid #cbd5e1', borderRadius: 18, padding: 20, background: '#f8fafc', textAlign: 'right' }}>
                <div style={{ fontSize: 19, fontWeight: 800, color: '#0f172a', marginBottom: 7 }}>تحليل بالذكاء الاصطناعي</div>
                <div style={{ fontSize: 13, lineHeight: 1.7, color: '#64748b' }}>تحليل بصري متقدم عبر Gemini، مناسب للمستندات المعقدة والخط اليدوي.</div>
                <div style={{ marginTop: 12, fontSize: 12, fontWeight: 700, color: '#2563eb' }}>Gemini 3.6 Flash</div>
              </button>
              <button type="button" onClick={() => chooseAnalysisMode('local')} style={{ cursor: 'pointer', border: '1px solid #cbd5e1', borderRadius: 18, padding: 20, background: '#f8fafc', textAlign: 'right' }}>
                <div style={{ fontSize: 19, fontWeight: 800, color: '#0f172a', marginBottom: 7 }}>تحليل محلي</div>
                <div style={{ fontSize: 13, lineHeight: 1.7, color: '#64748b' }}>تحليل داخل الجهاز للنصوص والجداول والصور وPDF باستخدام المحرك المحلي، دون Gemini.</div>
                <div style={{ marginTop: 12, fontSize: 12, fontWeight: 700, color: '#059669' }}>بدون استهلاك حصة Gemini</div>
              </button>
            </div>
          </div>
        </div>
      )}
    </BackgroundAnalysisContext.Provider>
  );
};

export const useBackgroundAnalysis = () => {
  const context = useContext(BackgroundAnalysisContext);
  if (!context) throw new Error('useBackgroundAnalysis must be used within BackgroundAnalysisProvider');
  return context;
};
