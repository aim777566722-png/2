import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Medicine, Supplier } from '../types';
import { mapTableDataToMedicineItems } from '../utils/documentParser';
import { validateAndSanitizeInvoiceItemList } from '../utils/helpers';

const DEFAULT_API_BASE_URL = 'https://document-ai-api.aim777566722.workers.dev';
const API_BASE_URL = ((import.meta as any).env?.VITE_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/$/, '');
const REQUEST_TIMEOUT_MS = 90000;
const MAX_IMAGE_DIMENSION = 1600;
const IMAGE_JPEG_QUALITY = 0.82;

export type ProgressCallback = (progress: number, stepText: string, stageIndex?: number) => void;
type ImagePayload = { name?: string; base64: string; mimeType?: string };

function startProgressPacer(onProgress?: ProgressCallback) {
  if (!onProgress) return { stop: () => {} };
  let progress = 35;
  const timer = setInterval(() => {
    if (progress >= 85) return;
    progress = Math.min(85, progress + Math.floor(Math.random() * 4) + 3);
    const message = progress < 50
      ? `تحليل بنية المستند وفحص الصور والجداول (${progress}%)...`
      : progress < 68
        ? `استخراج أسماء الأدوية والتراكيز والكميات (${progress}%)...`
        : progress < 80
          ? `تدقيق الأسعار وتواريخ الانتهاء والبونص (${progress}%)...`
          : `تجميع النتائج والتدقيق الصيدلاني النهائي (${progress}%)...`;
    onProgress(progress, message, progress < 68 ? 2 : 3);
  }, 500);
  return { stop: () => clearInterval(timer) };
}

function stripDataUrl(value: string): string {
  return value.replace(/^data:[^;]+;base64,/i, '').replace(/\s/g, '');
}

function compressImageDataUrl(image: ImagePayload): Promise<ImagePayload> {
  return new Promise(resolve => {
    const raw = typeof image.base64 === 'string' ? image.base64.trim() : '';
    if (!raw || typeof window === 'undefined') {
      resolve({ ...image, base64: stripDataUrl(raw), mimeType: image.mimeType || 'image/jpeg' });
      return;
    }
    const src = /^data:/i.test(raw) ? raw : `data:${image.mimeType || 'image/jpeg'};base64,${stripDataUrl(raw)}`;
    const img = new Image();
    let settled = false;
    const finish = (value: ImagePayload) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    img.onload = () => {
      try {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;
        if (!width || !height) {
          finish({ ...image, base64: stripDataUrl(raw), mimeType: 'image/jpeg' });
          return;
        }
        if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
          if (width >= height) {
            height = Math.round(height * MAX_IMAGE_DIMENSION / width);
            width = MAX_IMAGE_DIMENSION;
          } else {
            width = Math.round(width * MAX_IMAGE_DIMENSION / height);
            height = MAX_IMAGE_DIMENSION;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          finish({ ...image, base64: stripDataUrl(raw), mimeType: 'image/jpeg' });
          return;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', IMAGE_JPEG_QUALITY);
        finish({ ...image, base64: stripDataUrl(compressed), mimeType: 'image/jpeg' });
      } catch {
        finish({ ...image, base64: stripDataUrl(raw), mimeType: 'image/jpeg' });
      }
    };
    img.onerror = () => finish({ ...image, base64: stripDataUrl(raw), mimeType: image.mimeType || 'image/jpeg' });
    img.src = src;
  });
}

async function normalizeImages(images: ImagePayload[]): Promise<ImagePayload[]> {
  const valid = (images || []).filter(img => typeof img?.base64 === 'string' && img.base64.trim());
  return Promise.all(valid.map(compressImageDataUrl));
}

function parseNativeResponseData(data: any): any {
  if (typeof data !== 'string') return data;
  try { return data ? JSON.parse(data) : null; } catch { return null; }
}

async function postJson(path: string, payload: any, hasImages: boolean): Promise<any> {
  const url = `${API_BASE_URL}${path}`;
  const timeout = setTimeout(() => {}, REQUEST_TIMEOUT_MS);
  try {
    let status: number;
    let json: any;

    if (Capacitor.isNativePlatform()) {
      const response = await CapacitorHttp.post({
        url,
        headers: { 'Content-Type': 'application/json' },
        data: payload,
        connectTimeout: REQUEST_TIMEOUT_MS,
        readTimeout: REQUEST_TIMEOUT_MS
      });
      status = Number(response.status || 0);
      json = parseNativeResponseData(response.data);
    } else {
      const controller = new AbortController();
      const abortTimer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        const raw = await response.text();
        status = response.status;
        try { json = raw ? JSON.parse(raw) : null; } catch { json = null; }
      } finally {
        clearTimeout(abortTimer);
      }
    }

    if (status < 200 || status >= 300) {
      const serverError = json?.error || `الخادم أعاد HTTP ${status || 'غير معروف'}`;
      throw new Error(hasImages ? `فشل تحليل الصورة: ${serverError}` : serverError);
    }
    if (!json?.success || !json?.data) throw new Error('استجابة خادم الذكاء الاصطناعي غير صالحة');
    return json;
  } catch (error: any) {
    if (error?.name === 'AbortError' || error?.code === 'ETIMEDOUT') {
      throw new Error(hasImages ? 'انتهت مهلة تحليل الصورة. تحقق من الاتصال ثم أعد المحاولة.' : 'انتهت مهلة الاتصال بخادم الذكاء الاصطناعي.');
    }
    throw error instanceof Error ? error : new Error(String(error || 'فشل الاتصال بخادم الذكاء الاصطناعي'));
  } finally {
    clearTimeout(timeout);
  }
}

function localDocumentFallback(fileText: string, tableData: any[], fileName: string, knownMedicines: string[], knownSuppliers: string[]) {
  const items = mapTableDataToMedicineItems(tableData || [], fileText || '', fileName, knownMedicines, knownSuppliers);
  return {
    detectedType: fileName.toLowerCase().includes('فاتورة') || fileText.includes('سعر') ? 'invoice' : 'order',
    documentTitle: fileName ? `مستند: ${fileName}` : 'مستند مشتريات',
    partyName: knownSuppliers[0] || '',
    documentNumber: `DOC-${Date.now().toString().slice(-6)}`,
    documentDate: new Date().toISOString().split('T')[0],
    totalAmount: items.reduce((sum: number, it: any) => sum + (it.totalPrice || 0), 0),
    items,
    summary: `تم استخراج ${items.length} صنف محلياً.`
  };
}

export async function parseDocumentClientSide(params: {
  documentType?: 'order' | 'invoice' | 'price_list';
  extractionMode?: 'standard' | 'handwritten' | 'table' | 'pure_text';
  fileName?: string;
  fileText?: string;
  tableData?: any[];
  images?: ImagePayload[];
  knownMedicines?: string[];
  knownSuppliers?: string[];
  onProgress?: ProgressCallback;
}) {
  const { documentType = 'order', extractionMode = 'standard', fileName = '', fileText = '', tableData = [], images = [], knownMedicines = [], knownSuppliers = [], onProgress } = params;
  onProgress?.(25, 'تجهيز مصفوفة الرؤية البصرية والقاموس الصيدلاني المرجعي...', 1);
  const cleanImages = await normalizeImages(images);
  const pacer = startProgressPacer(onProgress);
  try {
    const payload = { documentType, extractionMode, fileName, fileText: fileText || undefined, tableData: tableData?.length ? tableData : undefined, images: cleanImages.length ? cleanImages : undefined, knownMedicines, knownSuppliers };
    const json = await postJson('/api/parse-document', payload, cleanImages.length > 0);
    if (Array.isArray(json.data.items)) json.data.items = validateAndSanitizeInvoiceItemList(json.data.items);
    onProgress?.(92, 'مطابقة الأصناف مع القاموس الصيدلاني وتدقيق النتائج...', 3);
    return { success: true, data: json.data, fallbackUsed: !!json.fallbackUsed };
  } catch (error: any) {
    if (cleanImages.length > 0) {
      console.error('Remote image document analysis failed:', error);
      throw error;
    }
    console.warn('Remote text document analysis failed, using local parser:', error?.message || error);
    onProgress?.(88, 'تعذر الاتصال بالخادم، سيتم استخدام المعالجة المحلية للنص...', 3);
    return { success: true, data: localDocumentFallback(fileText, tableData, fileName, knownMedicines, knownSuppliers), fallbackUsed: true };
  } finally {
    pacer.stop();
  }
}

export async function parsePharmacyOrderClientSide(params: {
  text?: string;
  images?: ImagePayload[];
  knownMedicines?: Medicine[];
  onProgress?: ProgressCallback;
}) {
  const { text = '', images = [], knownMedicines = [], onProgress } = params;
  onProgress?.(25, 'تجهيز قائمة الأصناف والصور المرفقة للطلب...', 1);
  const cleanImages = await normalizeImages(images);
  const pacer = startProgressPacer(onProgress);
  try {
    const json = await postJson('/api/parse-order', { text, images: cleanImages.length ? cleanImages : undefined, knownMedicines: knownMedicines.map(m => m.name) }, cleanImages.length > 0);
    onProgress?.(92, 'مطابقة الأصناف مع المخزون والأسعار المرجعية...', 3);
    return { success: true, data: json.data, fallbackUsed: !!json.fallbackUsed };
  } catch (error: any) {
    if (cleanImages.length > 0) throw error;
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    return { success: true, data: { items: lines.map(l => ({ rawText: l, matchedName: l, quantity: 1, unit: 'علبة', isUncertain: false, notes: '' })), summary: `تم استخراج ${lines.length} صنف عبر المعالجة المباشرة` }, fallbackUsed: true };
  } finally {
    pacer.stop();
  }
}

export async function parsePurchaseInvoiceClientSide(params: {
  text?: string;
  images?: ImagePayload[];
  knownSuppliers?: Supplier[];
  knownMedicines?: Medicine[];
  onProgress?: ProgressCallback;
}) {
  const { text = '', images = [], knownSuppliers = [], knownMedicines = [], onProgress } = params;
  onProgress?.(25, 'تجهيز مستند الفاتورة وبيانات الموردين...', 1);
  const cleanImages = await normalizeImages(images);
  const pacer = startProgressPacer(onProgress);
  try {
    const json = await postJson('/api/parse-invoice', { text, images: cleanImages.length ? cleanImages : undefined, knownSuppliers: knownSuppliers.map(s => s.name), knownMedicines: knownMedicines.map(m => m.name) }, cleanImages.length > 0);
    if (Array.isArray(json.data.items)) json.data.items = validateAndSanitizeInvoiceItemList(json.data.items);
    onProgress?.(92, 'تدقيق الحسابات والأسعار وتواريخ الانتهاء والبونص...', 3);
    return { success: true, data: json.data, fallbackUsed: !!json.fallbackUsed };
  } catch (error: any) {
    if (cleanImages.length > 0) throw error;
    return { success: true, data: { supplierName: knownSuppliers[0]?.name || '', invoiceDate: new Date().toISOString().split('T')[0], invoiceNumber: `INV-${Date.now().toString().slice(-4)}`, items: [], totalAmount: 0 }, fallbackUsed: true };
  } finally {
    pacer.stop();
  }
}

export async function refineMedicineTextClientSide(params: { rawText: string; targetType?: string; knownMedicines?: Medicine[]; onProgress?: ProgressCallback }) {
  const { rawText = '', targetType = 'order', knownMedicines = [], onProgress } = params;
  onProgress?.(35, 'جاري التدقيق الصيدلاني اللغوي للنص...', 2);
  const json = await postJson('/api/refine-text', { rawText, targetType, knownMedicines: knownMedicines.map(m => m.name) }, false);
  if (Array.isArray(json.data.items)) json.data.items = validateAndSanitizeInvoiceItemList(json.data.items);
  onProgress?.(95, 'اكتمل التدقيق الصيدلاني...', 3);
  return { success: true, data: json.data };
}

export async function matchOrderWithInvoiceClientSide(params: { orderItems: any[]; invoiceItems: any[]; marketPrices?: any[]; onProgress?: ProgressCallback }) {
  const { orderItems, invoiceItems, marketPrices = [], onProgress } = params;
  onProgress?.(40, 'جاري مقارنة الأصناف والأسعار بالذكاء الاصطناعي...', 2);
  const json = await postJson('/api/match-order-invoice', { orderItems, invoiceItems, marketPrices }, false);
  onProgress?.(95, 'اكتمال تحليل الفروقات والتوصيات...', 3);
  return { success: true, data: json.data };
}

export async function extractDocumentTextClientSide(params: {
  fileName?: string;
  fileText?: string;
  images?: ImagePayload[];
  documentType?: 'order' | 'invoice' | 'price_list';
  knownMedicines?: string[];
  knownSuppliers?: string[];
  onProgress?: ProgressCallback;
}) {
  const { fileName = '', fileText = '', images = [], documentType = 'order', knownMedicines = [], knownSuppliers = [], onProgress } = params;
  onProgress?.(20, 'جاري إرسال الوثيقة إلى خادم الذكاء الاصطناعي...', 1);
  try {
    const cleanImages = await normalizeImages(images);
    const json = await postJson('/api/parse-document', { fileName, fileText: fileText || undefined, images: cleanImages.length ? cleanImages : undefined, documentType, knownMedicines, knownSuppliers }, cleanImages.length > 0);
    onProgress?.(95, 'اكتمل استخراج الوثيقة.', 3);
    return { success: true, data: json.data, fallbackUsed: !!json.fallbackUsed };
  } catch (error: any) {
    console.error('Document extraction failed:', error);
    return { success: false, error: error?.message || 'فشل استخراج الوثيقة' };
  }
}
