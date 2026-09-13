import React, { useState, useRef, useEffect } from 'react';
import { 
  FileSpreadsheet, 
  FileText, 
  Camera, 
  Upload, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  ChevronLeft, 
  ArrowRight, 
  RefreshCw, 
  FileUp, 
  Eye, 
  X, 
  Table, 
  Layers, 
  Building2, 
  ShoppingCart,
  Receipt,
  FileCheck,
  Plus,
  Trash2,
  Image as ImageIcon,
  AlertTriangle,
  HelpCircle,
  Clock,
  ArrowUpRight,
  Wand2,
  Check,
  Loader2,
  Search,
  Copy,
  SlidersHorizontal,
  ShieldCheck,
  PenTool,
  FileCode,
  Zap,
  Activity,
  Terminal
} from 'lucide-react';
import { Medicine, Supplier, PharmacyOrder, PurchaseInvoice, MarketPriceRecord } from '../types';
import { parseUploadedFile, ParsedDocumentResult } from '../utils/documentParser';
import { findSimilarMedicine, SimilarityConflict } from '../utils/similarity';
import { cleanAndFormatMedicineName } from '../utils/helpers';
import { SimilarityResolutionModal } from './SimilarityResolutionModal';
import { DocumentSplitPreview, ExtractedDocumentData, UploadedFileSummary } from './DocumentSplitPreview';
import { useBackgroundAnalysis } from '../context/BackgroundAnalysisContext';

interface DocumentUploadViewProps {
  knownMedicines: Medicine[];
  knownSuppliers: Supplier[];
  onOrderCreated?: (order: PharmacyOrder) => void;
  onInvoiceCreated?: (invoice: PurchaseInvoice) => void;
  onMarketPricesImported?: (records: MarketPriceRecord[]) => void;
  onAddMedicine?: (medicine: Medicine) => void;
  onAddSupplier?: (supplier: Supplier) => void;
  onNavigate: (tab: string, id?: string) => void;
  onBack?: () => void;
}

interface UploadedFileItem {
  id: string;
  name: string;
  type: string;
  size?: number;
  mimeType: string;
  base64?: string;
  pageImages?: string[];
  extractedText?: string;
  tableData?: Array<Record<string, any>>;
}

export const DocumentUploadView: React.FC<DocumentUploadViewProps> = ({
  knownMedicines,
  knownSuppliers,
  onOrderCreated,
  onInvoiceCreated,
  onMarketPricesImported,
  onAddMedicine,
  onAddSupplier,
  onNavigate,
  onBack
}) => {
  // Workflow Step State: 'select_type' | 'intake' | 'preview'
  const [currentStep, setCurrentStep] = useState<'select_type' | 'intake' | 'preview'>('select_type');
  
  // Selected Document Target Type
  const [selectedDocType, setSelectedDocType] = useState<'order' | 'invoice' | 'price_list'>('order');
  
  // Pharmacy Name Modal for 'New Order'
  const [showPharmacyModal, setShowPharmacyModal] = useState(false);
  const [pharmacyNameInput, setPharmacyNameInput] = useState('صيدلية النخبة المركزية');

  // Supplier Name Input for 'Invoice' & 'Price Quotations'
  const [supplierNameInput, setSupplierNameInput] = useState('');

  // 3 Intake Input Methods
  const [activeIntakeTab, setActiveIntakeTab] = useState<'paste' | 'files' | 'camera'>('paste');
  const [pastedListText, setPastedListText] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileItem[]>([]);
  const [extractionMode, setExtractionMode] = useState<'standard' | 'handwritten' | 'table' | 'pure_text'>('standard');

  // Processing & Extracted State
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedDocumentData | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [autoSavedNotice, setAutoSavedNotice] = useState<string | null>(null);

  // Similarity Resolution Modal State
  const [similarityConflicts, setSimilarityConflicts] = useState<SimilarityConflict[]>([]);
  const [showSimilarityModal, setShowSimilarityModal] = useState(false);
  const [pendingSaveAction, setPendingSaveAction] = useState<(() => void) | null>(null);

  // Missing Supplier Alert Modal State
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [selectedSupplierName, setSelectedSupplierName] = useState('');
  const [customSupplierName, setCustomSupplierName] = useState('');
  const [pendingItemsToSave, setPendingItemsToSave] = useState<any[]>([]);

  // File Inputs Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const consumedTaskIdRef = useRef<string | null>(null);

  // Background Analysis Hook
  const { startDocumentTask, activeTask, clearActiveTask, clearTask } = useBackgroundAnalysis();

  // Listen to background task completion
  useEffect(() => {
    if (activeTask && activeTask.type === 'document' && activeTask.status === 'completed') {
      if (consumedTaskIdRef.current === activeTask.id) {
        return;
      }
      if (activeTask.payload && activeTask.payload.extractedData) {
        setExtractedData(activeTask.payload.extractedData);
        if (activeTask.payload.uploadedFiles) {
          setUploadedFiles(activeTask.payload.uploadedFiles);
        }
        if (activeTask.payload.targetType) {
          setSelectedDocType(activeTask.payload.targetType as 'order' | 'invoice' | 'price_list');
        }
        if (activeTask.payload.partyName) {
          if (activeTask.payload.targetType === 'order') {
            setPharmacyNameInput(activeTask.payload.partyName);
          } else {
            setSupplierNameInput(activeTask.payload.partyName);
          }
        }
        setIsProcessing(false);
        setCurrentStep('preview');
      }
    } else if (activeTask && activeTask.type === 'document' && activeTask.status === 'processing') {
      setIsProcessing(true);
    }
  }, [activeTask]);

  // Handle Choice 1: New Order
  const handleSelectNewOrder = () => {
    setSelectedDocType('order');
    setShowPharmacyModal(true);
  };

  // Confirm Pharmacy Name
  const handleConfirmPharmacyName = () => {
    setShowPharmacyModal(false);
    setCurrentStep('intake');
    setActiveIntakeTab('paste');
  };

  // Handle Choice 2: Purchase Invoice
  const handleSelectInvoice = () => {
    setSelectedDocType('invoice');
    setCurrentStep('intake');
    setActiveIntakeTab('files');
  };

  // Handle Choice 3: Price Offers
  const handleSelectPriceOffers = () => {
    setSelectedDocType('price_list');
    setCurrentStep('intake');
    setActiveIntakeTab('files');
  };

  // Add Files / Images
  const handleAddFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setProcessingError(null);

    const newItems: UploadedFileItem[] = [];
    const parseErrors: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const parsed = await parseUploadedFile(file);
        newItems.push({
          id: `file-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 5)}`,
          name: file.name,
          type: parsed.fileType,
          size: file.size,
          mimeType: parsed.mimeType,
          base64: parsed.base64,
          pageImages: parsed.pageImages,
          extractedText: parsed.extractedText,
          tableData: parsed.tableData
        });
      } catch (err) {
        console.error('Error reading file:', file.name, err);
        parseErrors.push(file.name);
      }
    }

    setUploadedFiles(prev => [...prev, ...newItems]);
    if (parseErrors.length > 0) {
      const names = parseErrors.slice(0, 3).join('، ');
      const suffix = parseErrors.length > 3 ? ` و${parseErrors.length - 3} ملفات أخرى` : '';
      setProcessingError(`تعذر قراءة ${names}${suffix}. تحقق من نوع الملف ثم حاول مرة أخرى.`);
    }
  };

  const handleRemoveFile = (id: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== id));
  };

  // Run AI Extraction on all inputs (Pasted text or Files/Images)
  const handleStartAnalysis = async () => {
    setProcessingError(null);
    setSuccessMessage(null);

    // Prepare files array
    const filesToProcess: UploadedFileItem[] = [...uploadedFiles];

    if (pastedListText.trim()) {
      filesToProcess.unshift({
        id: `pasted-text-${Date.now()}`,
        name: selectedDocType === 'order' ? 'قائمة طلب ملصوقة' : 'نص ملصوق',
        type: 'text',
        mimeType: 'text/plain',
        extractedText: pastedListText.trim()
      });
    }

    if (filesToProcess.length === 0) {
      setProcessingError('يرجى لصق قائمة نصية أو رفع ملف/صورة واحدة على الأقل');
      return;
    }

    setIsProcessing(true);

    try {
      const partyName = selectedDocType === 'order' ? pharmacyNameInput : supplierNameInput;
      
      await startDocumentTask({
        files: filesToProcess,
        targetType: selectedDocType,
        partyName: partyName.trim() || undefined,
        extractionMode,
        knownMedicines,
        knownSuppliers
      });
    } catch (err: any) {
      console.error('Extraction error:', err);
      setProcessingError(err.message || 'حدث خطأ أثناء معالجة المستند');
      setIsProcessing(false);
    }
  };

  // Extracted Item Update Handler in Split Screen
  const handleUpdateExtractedItem = (index: number, field: string, value: any) => {
    if (!extractedData || !extractedData.items) return;
    const updated = [...extractedData.items];
    updated[index] = { ...updated[index], [field]: value };
    setExtractedData({ ...extractedData, items: updated });
  };

  const handleDeleteExtractedItem = (index: number) => {
    if (!extractedData || !extractedData.items) return;
    const updated = extractedData.items.filter((_, idx) => idx !== index);
    setExtractedData({ ...extractedData, items: updated });
  };

  const handleAddExtractedItem = () => {
    if (!extractedData) return;
    const newItem = {
      id: `item-${Date.now()}`,
      itemName: '',
      quantity: 1,
      unit: 'علبة',
      unitPrice: 0,
      totalPrice: 0,
      bonusScheme: '',
      expiryDate: '',
      notes: ''
    };
    setExtractedData({
      ...extractedData,
      items: [newItem, ...(extractedData.items || [])]
    });
  };

  // Confirm Order Action
  const handleConfirmOrder = (partyName: string, items: any[]) => {
    const validItems = items.filter(it => it.itemName && it.itemName.trim().length > 0);
    if (validItems.length === 0) {
      setProcessingError('يرجى التأكد من وجود أصناف صيدلانية صالحة في القائمة');
      return;
    }

    // Check for similarity conflicts with medicines database
    const conflicts: SimilarityConflict[] = [];
    validItems.forEach((it, idx) => {
      const match = findSimilarMedicine(it.itemName, knownMedicines);
      if (match && match.isNearMatch && match.existingMedicine.name !== it.itemName) {
        conflicts.push({
          id: `order-conflict-${idx}`,
          candidateName: it.itemName,
          existingMedicine: match.existingMedicine as Medicine,
          similarityScore: match.similarityScore,
          unitPrice: Number(it.unitPrice) || 0,
          quantity: Number(it.quantity) || 1,
          supplierName: partyName,
          bonusScheme: it.bonusScheme,
          originalIndex: idx
        });
      }
    });

    if (conflicts.length > 0) {
      setSimilarityConflicts(conflicts);
      setShowSimilarityModal(true);
      return;
    }

    proceedSaveOrder(partyName, validItems);
  };

  const proceedSaveOrder = (partyName: string, items: any[]) => {
    try {
      setProcessingError(null);
      const safeItems = items
        .filter(i => i && (i.itemName || i.matchedMedicineName || i.rawText))
        .map((i: any, idx: number) => {
          const rawName = String(i.itemName || i.matchedMedicineName || i.rawText || '').trim();
          const q = typeof i.quantity === 'number' && !isNaN(i.quantity) ? i.quantity : (parseInt(String(i.quantity || '1').replace(/[^\d]/g, ''), 10) || 1);
          return {
            id: `item-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
            rawText: rawName,
            matchedMedicineName: rawName,
            matchedMedicineId: i.matchedMedicineId,
            quantity: q > 0 ? q : 1,
            unit: String(i.unit || 'علبة').trim(),
            isUncertain: !!i.isUncertain,
            uncertaintyReason: i.uncertaintyReason,
            notes: i.notes || ''
          };
        });

      if (safeItems.length === 0) {
        setProcessingError('لم يتم العثور على أصناف صالحة للحفظ. يرجى مراجعة القائمة.');
        return;
      }

      const cleanParty = String(partyName || pharmacyNameInput || 'صيدلية النخبة المركزية').trim();
      const newOrder: PharmacyOrder = {
        id: `order-${Date.now()}`,
        orderNumber: extractedData?.documentNumber || `ORD-${Date.now().toString().slice(-4)}`,
        pharmacyName: cleanParty,
        orderDate: extractedData?.documentDate || new Date().toISOString().split('T')[0],
        status: 'reviewed',
        rawInputText: pastedListText || `مستخرج من ${uploadedFiles.length} ملفات/صور`,
        items: safeItems,
        createdTimestamp: Date.now()
      };

      if (onOrderCreated) {
        onOrderCreated(newOrder);
      }

      // Mark task as consumed and clear background task completely
      if (activeTask?.id) {
        consumedTaskIdRef.current = activeTask.id;
      }
      clearActiveTask();
      clearTask();

      // Clear analysis list and files completely after saving
      setExtractedData(null);
      setUploadedFiles([]);
      setPastedListText('');
      setPharmacyNameInput('');
      setSupplierNameInput('');
      setCurrentStep('select_type');
      setProcessingError(null);
      setSuccessMessage(null);

      onNavigate('price-comparison', newOrder.id);
    } catch (err: any) {
      console.error('Failed to save order from document:', err);
      setProcessingError(`حدث خطأ أثناء حفظ الطلب: ${err?.message || 'يرجى المحاولة مرة أخرى'}`);
    }
  };

  // Confirm Invoice Action
  const handleConfirmInvoice = (supplierName: string, items: any[], docNumber?: string, date?: string) => {
    try {
      setProcessingError(null);
      const cleanSup = String(supplierName || supplierNameInput || 'مورد الفاتورة').trim();
      const docDate = date || extractedData?.documentDate || new Date().toISOString().split('T')[0];
      const matchedSupplier = knownSuppliers.find(s => (s.name || '').trim().toLowerCase() === cleanSup.toLowerCase());
      const supplierId = matchedSupplier?.id || `sup-${cleanSup.replace(/\s+/g, '-').toLowerCase()}`;

      if (!matchedSupplier && onAddSupplier && cleanSup) {
        try {
          onAddSupplier({
            id: supplierId,
            name: cleanSup,
            rating: 4.5,
            notes: 'تمت إضافته تلقائياً من الفاتورة',
            createdDate: docDate
          });
        } catch (e) {
          console.warn('Could not auto-add supplier:', e);
        }
      }

      const validItems = (items || [])
        .filter(it => it && (it.itemName || it.medicineName))
        .map((i, idx) => {
          const name = String(i.itemName || i.medicineName || '').trim();
          const p = typeof i.unitPrice === 'number' && !isNaN(i.unitPrice) ? i.unitPrice : (parseFloat(String(i.unitPrice || '0').replace(/[,،\s]/g, '')) || 0);
          const q = typeof i.quantity === 'number' && !isNaN(i.quantity) ? i.quantity : (parseInt(String(i.quantity || '1').replace(/[^\d]/g, ''), 10) || 1);
          const disc = typeof i.discountPercent === 'number' && !isNaN(i.discountPercent) ? i.discountPercent : (parseFloat(String(i.discountPercent || '0')) || 0);
          return {
            id: `inv-item-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
            itemName: name,
            matchedMedicineId: i.matchedMedicineId,
            quantity: q > 0 ? q : 1,
            unitPrice: p >= 0 ? p : 0,
            bonusScheme: String(i.bonusScheme || '').trim(),
            discountPercent: disc >= 0 ? disc : 0,
            totalPrice: (p >= 0 ? p : 0) * (q > 0 ? q : 1)
          };
        });

      if (validItems.length === 0) {
        setProcessingError('يرجى إضافة أو تحديد صنف واحد على الأقل في الفاتورة قبل الحفظ.');
        return;
      }

      const newInvoice: PurchaseInvoice = {
        id: `inv-${Date.now()}`,
        invoiceNumber: docNumber || extractedData?.documentNumber || `INV-${Date.now().toString().slice(-4)}`,
        supplierId,
        supplierName: cleanSup,
        invoiceDate: docDate,
        totalAmount: validItems.reduce((acc, it) => acc + it.totalPrice, 0),
        items: validItems,
        createdTimestamp: Date.now()
      };

      if (onInvoiceCreated) {
        onInvoiceCreated(newInvoice);
      }

      // Mark task as consumed and clear background task completely
      if (activeTask?.id) {
        consumedTaskIdRef.current = activeTask.id;
      }
      clearActiveTask();
      clearTask();

      // Clear analysis list and files completely after saving
      setExtractedData(null);
      setUploadedFiles([]);
      setPastedListText('');
      setPharmacyNameInput('');
      setSupplierNameInput('');
      setCurrentStep('select_type');
      setProcessingError(null);
      setSuccessMessage(null);

      onNavigate('reconciliation');
    } catch (err: any) {
      console.error('Failed to save invoice:', err);
      setProcessingError(`حدث خطأ أثناء حفظ الفاتورة: ${err?.message || 'يرجى المحاولة مرة أخرى'}`);
    }
  };

  // Confirm Price List Action
  const handleConfirmPriceList = (supplierName: string, items: any[], date?: string) => {
    try {
      setProcessingError(null);
      const cleanSup = String(supplierName || supplierNameInput || 'مورد السوق').trim();
      const supplierId = `sup-${cleanSup.replace(/\s+/g, '-').toLowerCase()}`;
      const dateStr = date || extractedData?.documentDate || new Date().toISOString().split('T')[0];

      const matchedSup = knownSuppliers.find(s => (s.name || '').trim().toLowerCase() === cleanSup.toLowerCase());
      if (!matchedSup && onAddSupplier && cleanSup) {
        try {
          onAddSupplier({
            id: supplierId,
            name: cleanSup,
            rating: 4.5,
            notes: 'تمت إضافته من قائمة الأسعار',
            createdDate: dateStr
          });
        } catch (e) {
          console.warn('Could not auto-add supplier:', e);
        }
      }

      const validItems = (items || []).filter(it => it && (it.itemName || it.medicineName));
      if (validItems.length === 0) {
        setProcessingError('يرجى التأكد من وجود أصناف وأسعار صالحة في القائمة قبل الحفظ.');
        return;
      }

      const priceRecords: MarketPriceRecord[] = validItems.map((item, idx) => {
        const name = String(item.itemName || item.medicineName || '').trim();
        const matchMed = knownMedicines.find(m => (m.name || '').trim().toLowerCase() === name.toLowerCase());
        const medId = matchMed?.id || `med-${name.replace(/\s+/g, '-').toLowerCase()}`;
        const p = typeof item.unitPrice === 'number' && !isNaN(item.unitPrice) ? item.unitPrice : (parseFloat(String(item.unitPrice || '0').replace(/[,،\s]/g, '')) || 0);

        if (!matchMed && onAddMedicine) {
          try {
            onAddMedicine({
              id: medId,
              name,
              category: 'أدوية عامة',
              createdDate: dateStr
            });
          } catch (e) {
            console.warn('Could not auto-add medicine:', e);
          }
        }

        return {
          id: `mp-doc-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
          medicineId: medId,
          medicineName: name,
          supplierId,
          supplierName: cleanSup,
          unitPrice: p >= 0 ? p : 0,
          invoiceDate: dateStr,
          bonusScheme: item.bonusScheme || '',
          discountPercent: item.discountPercent ? Number(item.discountPercent) : undefined,
          notes: item.notes || 'استخراج من عروض الأسعار',
          createdTimestamp: Date.now()
        };
      });

      if (onMarketPricesImported && priceRecords.length > 0) {
        onMarketPricesImported(priceRecords);
      }

      // Mark task as consumed and clear background task completely
      if (activeTask?.id) {
        consumedTaskIdRef.current = activeTask.id;
      }
      clearActiveTask();
      clearTask();

      // Clear analysis list and files completely after saving
      setExtractedData(null);
      setUploadedFiles([]);
      setPastedListText('');
      setPharmacyNameInput('');
      setSupplierNameInput('');
      setCurrentStep('select_type');
      setProcessingError(null);
      setSuccessMessage(null);

      // Navigate directly to market prices view
      onNavigate('market-prices');
    } catch (err: any) {
      console.error('Failed to save price list:', err);
      setProcessingError(`حدث خطأ أثناء حفظ قائمة الأسعار: ${err?.message || 'يرجى المحاولة مرة أخرى'}`);
    }
  };

  // Reset entire state
  const handleResetAll = () => {
    if (activeTask?.id) {
      consumedTaskIdRef.current = activeTask.id;
    }
    clearActiveTask();
    clearTask();
    setCurrentStep('select_type');
    setUploadedFiles([]);
    setPastedListText('');
    setPharmacyNameInput('');
    setSupplierNameInput('');
    setExtractedData(null);
    setProcessingError(null);
    setSuccessMessage(null);
  };

  // Similarity Resolutions
  const handleApplyResolutions = (resolutions: Map<string, { action: 'merge_existing' | 'create_new' | 'custom_name'; chosenName: string; medicineId?: string }>) => {
    if (!extractedData || !extractedData.items) return;

    const updatedItems = (extractedData.items || []).map((it, idx) => {
      const conflictId = `order-conflict-${idx}`;
      const res = resolutions.get(conflictId);
      if (res) {
        return {
          ...it,
          itemName: res.chosenName,
          matchedMedicineId: res.medicineId || it.matchedMedicineId
        };
      }
      return it;
    });

    setExtractedData({ ...extractedData, items: updatedItems });
    setShowSimilarityModal(false);

    const partyName = extractedData.partyName || pharmacyNameInput || 'صيدلية النخبة المركزية';
    proceedSaveOrder(partyName, updatedItems);
  };

  // ========================================================
  // 🌟 STEP 3: SPLIT-SCREEN PREVIEW VIEW
  // ========================================================
  if (currentStep === 'preview' && extractedData) {
    return (
      <div className="space-y-4 max-w-6xl mx-auto" dir="rtl">
        {processingError && (
          <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center justify-between gap-2 animate-in fade-in">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{processingError}</span>
            </div>
            <button
              type="button"
              onClick={() => setProcessingError(null)}
              className="p-1 text-rose-400 hover:text-rose-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {successMessage && (
          <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 text-xs font-bold flex flex-wrap items-center justify-between gap-3 shadow-lg shadow-emerald-500/10 animate-in fade-in">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-300 shrink-0">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div>
                <p className="text-emerald-100 font-black text-sm">{successMessage}</p>
                <p className="text-emerald-300/80 text-[11px] font-medium mt-0.5">
                  قائمة تحليل ومطابقة المستند ما زالت متاحة لمتابعة التدقيق أو التعديل
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onNavigate('market-prices')}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center gap-1.5 transition-all shadow cursor-pointer active:scale-95"
              >
                <span>عرض جدول أسعار السوق</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setSuccessMessage(null)}
                className="px-3 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 text-xs font-bold border border-slate-700 transition-all cursor-pointer"
              >
                متابعة التحليل
              </button>
            </div>
          </div>
        )}

        <DocumentSplitPreview
          documentType={selectedDocType}
          pharmacyName={pharmacyNameInput}
          supplierName={supplierNameInput}
          uploadedFiles={uploadedFiles}
          pastedText={pastedListText}
          extractedData={extractedData}
          knownMedicines={knownMedicines}
          knownSuppliers={knownSuppliers}
          onUpdateItem={handleUpdateExtractedItem}
          onDeleteItem={handleDeleteExtractedItem}
          onAddItem={handleAddExtractedItem}
          onConfirmOrder={handleConfirmOrder}
          onConfirmInvoice={handleConfirmInvoice}
          onConfirmPriceList={handleConfirmPriceList}
          onBackToUpload={() => setCurrentStep('intake')}
          onResetAll={handleResetAll}
        />

        {/* Similarity Conflict Modal */}
        {showSimilarityModal && (
          <SimilarityResolutionModal
            isOpen={showSimilarityModal}
            conflicts={similarityConflicts}
            knownMedicines={knownMedicines}
            onResolve={handleApplyResolutions}
            onCancel={() => setShowSimilarityModal(false)}
          />
        )}
      </div>
    );
  }

  // ========================================================
  // 🌟 LIVE EXTRACTION PROGRESS DASHBOARD
  // ========================================================
  if (isProcessing && activeTask && activeTask.type === 'document' && activeTask.status === 'processing') {
    return (
      <div className="space-y-6 pb-24 max-w-3xl mx-auto" dir="rtl">
        {/* Top Header */}
        <div className="flex items-center justify-between bg-slate-900/80 backdrop-blur-md p-4 rounded-3xl border border-slate-800 shadow-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-teal-500/20 text-teal-300 border border-teal-500/40 font-mono">
                  {activeTask.progress}%
                </span>
                <h2 className="text-sm sm:text-base font-black text-white">
                  جاري استخراج وتحليل الوثائق بالذكاء الاصطناعي
                </h2>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {activeTask.title} • {activeTask.subtitle}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('dashboard')}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
          >
            <span>التصفح في الخلفية</span>
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        {/* Live Progress Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 relative overflow-hidden">
          {/* Ambient Glow */}
          <div className="absolute -top-24 -right-24 w-60 h-60 bg-teal-500/10 rounded-full blur-3xl pointer-events-none"></div>
          <div className="absolute -bottom-24 -left-24 w-60 h-60 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>

          {/* Large Gauge Counter & Step Status */}
          <div className="text-center space-y-3 py-2">
            <div className="inline-flex flex-col items-center justify-center relative">
              {/* Outer Glowing Ring */}
              <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full border-4 border-slate-800 flex items-center justify-center bg-slate-950/80 shadow-2xl relative">
                <div 
                  className="absolute inset-0 rounded-full border-4 border-transparent border-t-teal-400 border-r-emerald-400 animate-spin"
                  style={{ animationDuration: '3s' }}
                ></div>
                <div className="text-center">
                  <span className="text-3xl sm:text-4xl font-black font-mono tracking-tight bg-gradient-to-r from-teal-400 to-emerald-300 bg-clip-text text-transparent">
                    {activeTask.progress}%
                  </span>
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                    مكتمل
                  </span>
                </div>
              </div>
            </div>

            <div className="max-w-md mx-auto space-y-1">
              <h3 className="text-sm sm:text-base font-black text-white flex items-center justify-center gap-2">
                <Activity className="w-4 h-4 text-teal-400 animate-pulse" />
                <span>{activeTask.currentStep}</span>
              </h3>
              <p className="text-xs text-slate-400">
                يعمل الذكاء الاصطناعي على قراءة النصوص العربية والإنجليزية، فك خط اليد، واستخراج الأصناف والأسعار.
              </p>
            </div>

            {/* Smooth Progress Bar */}
            <div className="w-full max-w-md mx-auto h-3 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-800 shadow-inner">
              <div 
                className="h-full bg-gradient-to-r from-teal-500 via-cyan-400 to-emerald-400 rounded-full transition-all duration-300 relative overflow-hidden"
                style={{ width: `${activeTask.progress}%` }}
              >
                <div className="absolute inset-0 bg-white/20 animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent"></div>
              </div>
            </div>
          </div>

          {/* 4-Stage Stepper Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            {(activeTask.stages || [
              { id: 1, label: 'تجهيز وضغط المرفقات', description: 'قراءة الملفات ومعالجة الدقة البصرية', status: 'completed' },
              { id: 2, label: 'الرؤية البصرية بالذكاء الاصطناعي', description: 'تحليل الخط اليدوي والجداول والنصوص', status: 'in_progress' },
              { id: 3, label: 'التنقيح والمطابقة الصيدلانية', description: 'تدقيق الأشكال والتراكيز والأسعار', status: 'pending' },
              { id: 4, label: 'اعتماد وهيكلة النتائج', description: 'تجهيز البيانات للمعاينة والتثبيت', status: 'pending' },
            ]).map(stg => {
              const isStgDone = stg.status === 'completed';
              const isStgActive = stg.status === 'in_progress';
              return (
                <div
                  key={stg.id}
                  className={`p-3.5 rounded-2xl border transition-all flex items-start gap-3 ${
                    isStgDone
                      ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                      : isStgActive
                      ? 'bg-teal-950/30 border-teal-500/50 shadow-lg shadow-teal-500/10 text-white ring-1 ring-teal-500/30'
                      : 'bg-slate-950/40 border-slate-800/60 text-slate-500'
                  }`}
                >
                  <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                    isStgDone
                      ? 'bg-emerald-500 text-slate-950'
                      : isStgActive
                      ? 'bg-teal-500 text-slate-950 animate-pulse'
                      : 'bg-slate-800 text-slate-500'
                  }`}>
                    {isStgDone ? (
                      <Check className="w-4 h-4 stroke-[3]" />
                    ) : isStgActive ? (
                      <Loader2 className="w-4 h-4 animate-spin stroke-[2.5]" />
                    ) : (
                      <span className="text-xs font-mono font-bold">{stg.id}</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h4 className={`text-xs font-black truncate ${
                      isStgActive ? 'text-teal-200' : isStgDone ? 'text-emerald-300' : 'text-slate-400'
                    }`}>
                      {stg.label}
                    </h4>
                    <p className="text-[11px] text-slate-400 leading-tight mt-0.5">
                      {stg.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Live Stream Terminal Logs */}
          {activeTask.logs && activeTask.logs.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="flex items-center justify-between text-xs font-bold text-slate-400">
                <span className="flex items-center gap-1.5 text-slate-300">
                  <Terminal className="w-4 h-4 text-teal-400" />
                  سجل الاستخراج المباشر (Live Progress Log)
                </span>
                <span className="font-mono text-[10px] text-teal-400">
                  {activeTask.logs.length} أحداث مسجلة
                </span>
              </div>

              <div className="max-h-36 overflow-y-auto space-y-1.5 p-3 bg-slate-950 rounded-2xl border border-slate-800 font-mono text-[11px] leading-relaxed shadow-inner">
                {activeTask.logs.map(log => (
                  <div key={log.id} className="flex items-start gap-2">
                    <span className="text-slate-500 shrink-0">{log.timestamp}</span>
                    <span className={`shrink-0 font-bold ${
                      log.percent === 100 ? 'text-emerald-400' : 'text-teal-400'
                    }`}>
                      [{log.percent}%]
                    </span>
                    <span className={log.type === 'success' ? 'text-emerald-300 font-bold' : log.type === 'warn' ? 'text-amber-300' : 'text-slate-300'}>
                      {log.message}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Files Summary Pill */}
          {uploadedFiles.length > 0 && (
            <div className="p-3 bg-slate-950/60 rounded-2xl border border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-teal-400" />
                <span>المستندات قيد المعالجة ({uploadedFiles.length} ملفات)</span>
              </span>
              <span className="font-mono text-[11px] text-slate-500">
                {uploadedFiles.map(f => f.name).join(' • ').slice(0, 45)}...
              </span>
            </div>
          )}

        </div>
      </div>
    );
  }

  // ========================================================
  // 🌟 STEP 2: INTAKE VIEW (3 INPUT OPTIONS + FOCUS SUMMARY)
  // ========================================================
  if (currentStep === 'intake') {
    return (
      <div className="space-y-6 pb-24 max-w-4xl mx-auto" dir="rtl">
        {/* Header with Back Button */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/80 backdrop-blur-md p-4 rounded-3xl border border-slate-800 shadow-xl">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setCurrentStep('select_type')}
              className="p-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold"
              title="تغيير نوع الوثيقة"
            >
              <ArrowRight className="w-4 h-4 text-teal-400" />
              <span>رجوع للخيارات</span>
            </button>

            <div>
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                  selectedDocType === 'order'
                    ? 'bg-teal-500/20 text-teal-300 border-teal-500/40'
                    : selectedDocType === 'invoice'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                }`}>
                  {selectedDocType === 'order' ? '1. طلب صيدلية جديد' : selectedDocType === 'invoice' ? '2. فاتورة شراء' : '3. عروض سعر'}
                </span>
                {selectedDocType === 'order' && (
                  <span className="text-xs font-bold text-white">
                    الصيدلية: {pharmacyNameInput}
                  </span>
                )}
              </div>
              <h1 className="text-lg font-black text-white mt-0.5">
                {selectedDocType === 'order'
                  ? 'إدخال وتجهيز قائمة الطلب للصيدلية'
                  : selectedDocType === 'invoice'
                  ? 'رفع وتدقيق فاتورة الشراء'
                  : 'رفع واستخراج عروض وقوائم الأسعار'}
              </h1>
            </div>
          </div>

          {/* Supplier Name Input for Invoices & Price Lists */}
          {(selectedDocType === 'invoice' || selectedDocType === 'price_list') && (
            <div className="w-full sm:w-64">
              <label className="text-[11px] font-bold text-slate-400 block mb-1">
                اسم المورد أو المستودع (اختياري)
              </label>
              <input
                type="text"
                value={supplierNameInput}
                onChange={(e) => setSupplierNameInput(e.target.value)}
                placeholder="اتركه فارغاً للاستخراج التلقائي..."
                className="w-full bg-slate-950 border border-slate-700 focus:border-teal-500 rounded-xl px-3 py-1.5 text-xs text-white outline-none"
              />
            </div>
          )}
        </div>

        {/* Focus Rules Banner */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-black text-teal-300 block">
                تركيز الاستخراج بالذكاء الاصطناعي:
              </span>
              <p className="text-xs text-slate-300">
                {selectedDocType === 'order' && 'يركز على استخراج: [اسم الصنف الصيدلاني الواضح] • [الكمية المطلوبة] • [الملاحظات]'}
                {selectedDocType === 'invoice' && 'يركز على استخراج: [الصنف] • [الكمية] • [السعر] • [تاريخ الانتهاء] • [اسم المورد]'}
                {selectedDocType === 'price_list' && 'يركز على استخراج: [الصنف] • [السعر] • [اسم المورد] • [البونص/الخصم]'}
              </p>
            </div>
          </div>

          {/* Extraction Mode Toggle */}
          <div className="hidden sm:flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-[11px]">
            <button
              type="button"
              onClick={() => setExtractionMode('standard')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                extractionMode === 'standard' ? 'bg-teal-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              طباعة / قياسي
            </button>
            <button
              type="button"
              onClick={() => setExtractionMode('handwritten')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                extractionMode === 'handwritten' ? 'bg-teal-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              خط يد / روشتة
            </button>
          </div>
        </div>

        {/* 🌟 3 INTAKE TABS */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl space-y-5">
          <div className="grid grid-cols-3 gap-2 p-1.5 bg-slate-950 rounded-2xl border border-slate-800">
            {/* 1. Paste List */}
            <button
              type="button"
              onClick={() => setActiveIntakeTab('paste')}
              className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                activeIntakeTab === 'paste'
                  ? 'bg-teal-500 text-slate-950 shadow-md shadow-teal-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>1. لصق قائمة نصية</span>
            </button>

            {/* 2. Upload Files / Images */}
            <button
              type="button"
              onClick={() => setActiveIntakeTab('files')}
              className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                activeIntakeTab === 'files'
                  ? 'bg-teal-500 text-slate-950 shadow-md shadow-teal-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Upload className="w-4 h-4" />
              <span>2. اختيار ملف أو صور</span>
              {uploadedFiles.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-slate-900 text-teal-300 text-[10px] font-mono">
                  {uploadedFiles.length}
                </span>
              )}
            </button>

            {/* 3. Camera Capture */}
            <button
              type="button"
              onClick={() => {
                setActiveIntakeTab('camera');
                cameraInputRef.current?.click();
              }}
              className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                activeIntakeTab === 'camera'
                  ? 'bg-teal-500 text-slate-950 shadow-md shadow-teal-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Camera className="w-4 h-4" />
              <span>3. تصوير بالكاميرا</span>
            </button>
          </div>

          {/* Hidden File Inputs */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.xlsx,.xls,.docx,.csv"
            onChange={(e) => handleAddFiles(e.target.files)}
            className="hidden"
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => handleAddFiles(e.target.files)}
            className="hidden"
          />

          {/* TAB 1: PASTE LIST */}
          {activeIntakeTab === 'paste' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-teal-400" />
                  <span>الصق قائمة الأصناف والكميات هنا:</span>
                </label>
                {pastedListText && (
                  <button
                    type="button"
                    onClick={() => setPastedListText('')}
                    className="text-xs text-slate-500 hover:text-red-400 cursor-pointer"
                  >
                    مسح النص
                  </button>
                )}
              </div>

              <textarea
                value={pastedListText}
                onChange={(e) => setPastedListText(e.target.value)}
                rows={8}
                placeholder={`مثال:\n10 بندول اكسترا 500 ملجم\n5 اوجمنتين 1 جم اقراص\n20 زواجرا 50 ملجم\n3 بروفين 400 ملجم`}
                className="w-full bg-slate-950 border border-slate-800 focus:border-teal-500 rounded-2xl p-4 text-xs sm:text-sm text-white placeholder-slate-600 outline-none font-mono leading-relaxed resize-none shadow-inner"
              />

              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>
                  {pastedListText.split('\n').filter(l => l.trim()).length} سطر مكتوب
                </span>
                <span>يمكنك لصق نصوص واتساب، طلبات رسائل، أو كشوفات كتابية مباشرة</span>
              </div>
            </div>
          )}

          {/* TAB 2 & 3: FILES & CAMERA */}
          {(activeIntakeTab === 'files' || activeIntakeTab === 'camera') && (
            <div className="space-y-4">
              {/* Dropzone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-700 hover:border-teal-500/60 rounded-3xl p-8 text-center cursor-pointer transition-all bg-slate-950/40 hover:bg-slate-950/80 group"
              >
                <div className="w-14 h-14 rounded-2xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400 mx-auto mb-3 group-hover:scale-110 transition-transform">
                  <Upload className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-white">
                  اضغط هنا لاختيار الملفات أو الصور من جهازك
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  يدعم صور متعددة (JPG, PNG)، مستندات PDF، ملفات Excel، وكشوفات Word
                </p>

                <div className="mt-4 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold"
                  >
                    تصفح الملفات
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      cameraInputRef.current?.click();
                    }}
                    className="px-4 py-2 rounded-xl bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/40 text-xs font-bold flex items-center gap-1.5"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>التقاط صورة</span>
                  </button>
                </div>
              </div>

              {/* Uploaded Files Grid */}
              {uploadedFiles.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-bold text-white">الملفات والصور المحددة ({uploadedFiles.length}):</span>
                    <button
                      type="button"
                      onClick={() => setUploadedFiles([])}
                      className="text-red-400 hover:underline"
                    >
                      حذف الكل
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {uploadedFiles.map((file, idx) => (
                      <div
                        key={file.id}
                        className="bg-slate-950 p-2.5 rounded-2xl border border-slate-800 flex flex-col justify-between gap-2 relative group"
                      >
                        {file.base64 && file.mimeType.startsWith('image/') ? (
                          <div className="h-24 rounded-xl overflow-hidden bg-slate-900 border border-slate-800 flex items-center justify-center">
                            <img
                              src={file.base64}
                              alt={file.name}
                              className="h-full w-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="h-24 rounded-xl bg-slate-900 border border-slate-800 flex flex-col items-center justify-center text-slate-400">
                            <FileText className="w-8 h-8 text-teal-400 mb-1" />
                            <span className="text-[10px] font-mono uppercase">{file.type}</span>
                          </div>
                        )}

                        <div className="text-[11px] text-slate-300 font-bold truncate">
                          {file.name}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveFile(file.id)}
                          className="absolute top-1.5 left-1.5 p-1 rounded-lg bg-red-500/80 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                          title="حذف الملف"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error Notice */}
          {processingError && (
            <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{processingError}</span>
            </div>
          )}

          {/* ======================================================== */}
          {/* 🌟 ACTION BUTTON: START AI EXTRACTION                    */}
          {/* ======================================================== */}
          <div className="pt-2">
            <button
              type="button"
              disabled={isProcessing || (uploadedFiles.length === 0 && !pastedListText.trim())}
              onClick={handleStartAnalysis}
              className={`w-full py-3.5 px-6 rounded-2xl font-black text-sm sm:text-base flex items-center justify-center gap-2.5 shadow-xl transition-all cursor-pointer active:scale-98 ${
                isProcessing || (uploadedFiles.length === 0 && !pastedListText.trim())
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-teal-500 via-emerald-500 to-cyan-500 hover:from-teal-400 hover:via-emerald-400 hover:to-cyan-400 text-slate-950 shadow-teal-500/20'
              }`}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>جاري استخراج وتحليل النصوص بالذكاء الاصطناعي...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  <span>
                    تحليل واستخراج النصوص بالذكاء الاصطناعي
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ========================================================
  // 🌟 STEP 1: INITIAL 3 MAIN CARDS ONLY
  // ========================================================
  return (
    <div className="space-y-6 pb-24 max-w-4xl mx-auto" dir="rtl">
      {/* Top Banner */}
      <div className="text-center space-y-2 py-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 text-teal-400 text-xs font-bold border border-teal-500/20">
          <Sparkles className="w-3.5 h-3.5" />
          <span>نظام الذكاء الاصطناعي الصيدلاني المتقدم</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-white">
          رفع ومعالجة الوثائق الصيدلانية
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 max-w-xl mx-auto">
          اختر نوع العملية التي تريد تنفيذها لاستخراج البيانات ومقارنتها بدقة متناهية:
        </p>
      </div>

      {/* 🌟 ONLY 3 CHOICES DISPLAYED */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Choice 1: طلب جديد (New Order) */}
        <button
          type="button"
          onClick={handleSelectNewOrder}
          className="bg-gradient-to-b from-slate-900 to-slate-950 hover:from-slate-850 hover:to-slate-900 border-2 border-teal-500/30 hover:border-teal-400 rounded-3xl p-6 text-right transition-all duration-200 hover:shadow-2xl hover:shadow-teal-500/10 hover:-translate-y-1 cursor-pointer flex flex-col justify-between group h-full"
        >
          <div>
            <div className="w-14 h-14 rounded-2xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400 mb-4 group-hover:scale-110 transition-transform">
              <ShoppingCart className="w-7 h-7" />
            </div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-6 h-6 rounded-full bg-teal-500 text-slate-950 text-xs font-black flex items-center justify-center">1</span>
              <h2 className="text-lg font-black text-white">طلب جديد</h2>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed mt-2">
              إنشاء طلب صيدلية جديد عبر لصق قائمة أو رفع ملفات أو تصوير روشتات وكشوفات ورقية.
            </p>
          </div>

          <div className="mt-5 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-teal-400 font-bold">
            <span>تركيز: الصنف والكمية والملاحظة</span>
            <ArrowRight className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          </div>
        </button>

        {/* Choice 2: فاتورة شراء (Purchase Invoice) */}
        <button
          type="button"
          onClick={handleSelectInvoice}
          className="bg-gradient-to-b from-slate-900 to-slate-950 hover:from-slate-850 hover:to-slate-900 border-2 border-emerald-500/30 hover:border-emerald-400 rounded-3xl p-6 text-right transition-all duration-200 hover:shadow-2xl hover:shadow-emerald-500/10 hover:-translate-y-1 cursor-pointer flex flex-col justify-between group h-full"
        >
          <div>
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-4 group-hover:scale-110 transition-transform">
              <Receipt className="w-7 h-7" />
            </div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-6 h-6 rounded-full bg-emerald-500 text-slate-950 text-xs font-black flex items-center justify-center">2</span>
              <h2 className="text-lg font-black text-white">فاتورة شراء</h2>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed mt-2">
              تحليل وتدقيق فواتير الشراء الموردة مع الكميات والأسعار وتواريخ الانتهاء.
            </p>
          </div>

          <div className="mt-5 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-emerald-400 font-bold">
            <span>تركيز: الصنف، الكمية، السعر، الانتهاء</span>
            <ArrowRight className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          </div>
        </button>

        {/* Choice 3: عروض سعر (Price Quotations) */}
        <button
          type="button"
          onClick={handleSelectPriceOffers}
          className="bg-gradient-to-b from-slate-900 to-slate-950 hover:from-slate-850 hover:to-slate-900 border-2 border-amber-500/30 hover:border-amber-400 rounded-3xl p-6 text-right transition-all duration-200 hover:shadow-2xl hover:shadow-amber-500/10 hover:-translate-y-1 cursor-pointer flex flex-col justify-between group h-full"
        >
          <div>
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4 group-hover:scale-110 transition-transform">
              <Layers className="w-7 h-7" />
            </div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 text-xs font-black flex items-center justify-center">3</span>
              <h2 className="text-lg font-black text-white">عروض سعر</h2>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed mt-2">
              استخراج وتحديث قوائم وعروض أسعار الموردين لتغذية مقارنة الأسعار في السوق.
            </p>
          </div>

          <div className="mt-5 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-amber-400 font-bold">
            <span>تركيز: الصنف، السعر، اسم المورد</span>
            <ArrowRight className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          </div>
        </button>
      </div>

      {/* 🌟 PHARMACY NAME MODAL FOR NEW ORDER */}
      {showPharmacyModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-teal-500/40 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">تحديد اسم الصيدلية</h3>
                  <p className="text-[11px] text-slate-400">الخطوة 1: أدخل اسم الصيدلية لإنشاء الطلب</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPharmacyModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300">
                اسم الصيدلية:
              </label>
              <input
                type="text"
                value={pharmacyNameInput}
                onChange={(e) => setPharmacyNameInput(e.target.value)}
                placeholder="مثال: صيدلية النخبة المركزية"
                autoFocus
                className="w-full bg-slate-950 border border-slate-700 focus:border-teal-500 rounded-xl px-4 py-2.5 text-sm text-white font-bold outline-none"
              />
            </div>

            {/* Quick suggestions */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-slate-500">اقتراحات:</span>
              {['صيدلية النخبة المركزية', 'صيدلية الأمل الحديثة', 'صيدلية الشفاء'].map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setPharmacyNameInput(name)}
                  className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold"
                >
                  {name}
                </button>
              ))}
            </div>

            <div className="pt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPharmacyModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmPharmacyName}
                className="px-5 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-black flex items-center gap-1.5 shadow-lg shadow-teal-500/20 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>تأكيد ومتابعة</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
