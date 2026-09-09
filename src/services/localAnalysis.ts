import { validateAndSanitizeInvoiceItemList } from '../utils/helpers';
import { mapTableDataToMedicineItems } from '../utils/documentParser';

type LocalFile = {
  name: string;
  mimeType?: string;
  base64?: string;
  pageImages?: string[];
  extractedText?: string;
  tableData?: any[];
};

const AR = '٠١٢٣٤٥٦٧٨٩';
const FA = '۰۱۲۳۴۵۶۷۸۹';

function normalizeDigits(value: any): string {
  return String(value ?? '')
    .replace(/[٠-٩]/g, d => String(AR.indexOf(d)))
    .replace(/[۰-۹]/g, d => String(FA.indexOf(d)));
}

function normalizeText(value: any): string {
  return normalizeDigits(value)
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isExtractionNoise(value: any): boolean {
  const s = normalizeText(value);
  if (!s) return true;
  if (/^\d{1,2}\s*\/\s*\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm|ص|م)?$/i.test(s)) return true;
  if (/^(?:https?:\/\/|www\.|(?:www\s*[.]\s*)?\w+[.]\w{2,})(?:[/?#].*)?$/i.test(s)) return true;
  if (/^(?:www|http|https|ftp|com|net|org|mg|ml)$/i.test(s)) return true;
  if (/^\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm|ص|م)?$/i.test(s)) return true;
  return false;
}

function dataUrl(value: string, mime = 'image/jpeg'): string {
  if (!value) return '';
  if (value.startsWith('data:')) return value;
  return `data:${mime};base64,${value}`;
}

async function prepareImage(value: string): Promise<string> {
  if (typeof window === 'undefined' || !value) return value;
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      try {
        const max = 2800;
        const scale = Math.min(2, max / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
        const width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
        const height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(value);
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(value);
      }
    };
    img.onerror = () => resolve(value);
    img.src = value;
  });
}

function filterItems(items: any[]): any[] {
  const sanitized = validateAndSanitizeInvoiceItemList(Array.isArray(items) ? items : []);
  return sanitized.filter(item => {
    const name = normalizeText(item?.itemName);
    if (isExtractionNoise(name)) return false;
    if (name.length < 2) return false;
    if (!/[A-Za-z\u0600-\u06FF]/.test(name)) return false;
    return true;
  });
}

export async function analyzeDocumentLocally(params: {
  files: LocalFile[];
  targetType: 'order' | 'invoice' | 'price_list';
  knownMedicines?: string[];
  knownSuppliers?: string[];
  onProgress?: (p: number, message: string, stage?: number) => void;
}) {
  const { files, targetType, onProgress } = params;
  if (!files.length) throw new Error('لا توجد ملفات للتحليل المحلي');

  let text = '';
  const rawRows: any[] = [];
  const images: { value: string; mimeType: string }[] = [];

  for (const file of files) {
    if (file.extractedText) text += `\n${file.extractedText}`;
    if (Array.isArray(file.tableData)) rawRows.push(...file.tableData);
    for (const image of file.pageImages || []) images.push({ value: image, mimeType: 'image/jpeg' });
    if (file.base64 && !file.pageImages?.length && /image\//i.test(file.mimeType || '')) {
      images.push({ value: file.base64, mimeType: file.mimeType || 'image/jpeg' });
    }
  }

  let items = filterItems(mapTableDataToMedicineItems(rawRows.length ? rawRows : undefined, text.trim()));
  let ocrPages = 0;

  if (images.length) {
    const { ocrImageDataUrlWithLayout } = await import('./localOcrFixed');
    for (let i = 0; i < images.length; i++) {
      onProgress?.(20 + Math.round((i / images.length) * 65), `استخراج البيانات محلياً من الصفحة ${i + 1} من ${images.length}...`, 2);
      try {
        const ocr = await ocrImageDataUrlWithLayout(
          await prepareImage(dataUrl(images[i].value, images[i].mimeType)),
          progress => onProgress?.(20 + Math.round(((i + progress / 100) / images.length) * 65), 'تشغيل OCR المحلي...', 2)
        );
        if (ocr.text) text += `\n${ocr.text}`;
        const layoutSource = ocr.layoutText || ocr.text || '';
        if (layoutSource) {
          const ocrItems = filterItems(mapTableDataToMedicineItems(undefined, layoutSource));
          items = filterItems([...items, ...ocrItems]);
        }
        ocrPages++;
      } catch (error) {
        console.warn('Local OCR page failed:', error);
      }
    }
  }

  const unique = new Map<string, any>();
  for (const item of items) {
    const key = `${normalizeText(item.itemName).toLowerCase()}|${item.quantity}|${item.unitPrice}`;
    if (!unique.has(key)) unique.set(key, item);
  }
  items = Array.from(unique.values());

  const totalAmount = items.reduce((sum, item) => sum + (Number(item.totalPrice) || 0), 0);
  onProgress?.(94, `اكتمل التحليل المحلي: ${items.length} صنفاً موثوقاً${ocrPages ? ` من ${ocrPages} صفحة` : ''}`, 3);

  return {
    detectedType: targetType,
    documentTitle: files.map(f => f.name).join(' + '),
    partyName: '',
    documentNumber: '',
    documentDate: '',
    currency: 'ريال',
    totalAmount,
    items,
    confidence: items.length ? 90 : 35,
    summary: items.length
      ? `تحليل محلي: تم اعتماد ${items.length} صنفاً بعد استبعاد التواريخ والأوقات والروابط وقطع OCR غير الصيدلانية.`
      : 'تحليل محلي: لم يتم العثور على صفوف دوائية موثوقة؛ لم يتم اختراع بيانات بديلة.',
    rawText: text.trim()
  };
}
