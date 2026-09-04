import { mapTableDataToMedicineItems } from '../utils/documentParser';
import { validateAndSanitizeInvoiceItemList } from '../utils/helpers';

export type LocalAnalysisFile = {
  name: string;
  type?: string;
  mimeType?: string;
  base64?: string;
  pageImages?: string[];
  extractedText?: string;
  tableData?: Array<Record<string, any>>;
};

function normalizeText(value: string): string {
  return String(value || '')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/\u200f|\u200e/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

async function preprocessImage(dataUrl: string): Promise<string> {
  if (!dataUrl || typeof window === 'undefined') return dataUrl;
  return new Promise(resolve => {
    const img = new Image();
    let done = false;
    const finish = (value: string) => {
      if (done) return;
      done = true;
      resolve(value);
    };
    img.onload = () => {
      try {
        const max = 2600;
        const scale = Math.min(2, max / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
        const width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
        const height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return finish(dataUrl);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const image = ctx.getImageData(0, 0, width, height);
        for (let i = 0; i < image.data.length; i += 4) {
          const r = image.data[i];
          const g = image.data[i + 1];
          const b = image.data[i + 2];
          const gray = Math.max(0, Math.min(255, Math.round((0.299 * r + 0.587 * g + 0.114 * b - 128) * 1.28 + 128)));
          image.data[i] = gray;
          image.data[i + 1] = gray;
          image.data[i + 2] = gray;
        }
        ctx.putImageData(image, 0, 0);
        finish(canvas.toDataURL('image/png'));
      } catch {
        finish(dataUrl);
      }
    };
    img.onerror = () => finish(dataUrl);
    img.src = dataUrl.startsWith('data:') ? dataUrl : `data:image/jpeg;base64,${dataUrl}`;
  });
}

function asDataUrl(base64: string, mimeType = 'image/jpeg'): string {
  if (/^data:/i.test(base64)) return base64;
  return `data:${mimeType};base64,${base64}`;
}

export async function analyzeDocumentLocally(params: {
  files: LocalAnalysisFile[];
  targetType: 'order' | 'invoice' | 'price_list';
  knownMedicines?: string[];
  knownSuppliers?: string[];
  onProgress?: (progress: number, message: string, stage?: number) => void;
}) {
  const { files, targetType, knownMedicines = [], knownSuppliers = [], onProgress } = params;
  if (!files.length) throw new Error('لا توجد ملفات للتحليل المحلي');

  let text = '';
  const tables: Array<Record<string, any>> = [];
  const ocrChunks: string[] = [];
  let imageCount = 0;
  let processedImages = 0;

  for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
    const file = files[fileIndex];
    const directText = normalizeText(file.extractedText || '');
    if (directText) text += `\n--- ${file.name} ---\n${directText}\n`;
    if (file.tableData?.length) tables.push(...file.tableData);

    const pages = file.pageImages?.length ? file.pageImages : (file.base64 && /image\//i.test(file.mimeType || '') ? [file.base64] : []);
    imageCount += pages.length;
    const shouldOcr = pages.length > 0 && (file.type === 'image' || /image\//i.test(file.mimeType || '') || directText.length < 240 || file.type === 'pdf');

    if (shouldOcr) {
      const { ocrImageDataUrl } = await import('./localOcr');
      for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
        const raw = pages[pageIndex];
        const dataUrl = asDataUrl(raw, file.mimeType || 'image/jpeg');
        const prepared = await preprocessImage(dataUrl);
        const ocrText = normalizeText(await ocrImageDataUrl(prepared, progress => {
          const current = processedImages + Math.max(0, Math.min(100, progress)) / 100;
          const percent = Math.min(88, 18 + Math.round((current / Math.max(1, imageCount)) * 70));
          onProgress?.(percent, `تحليل الصفحة ${pageIndex + 1} من ${pages.length} محلياً (${file.name})...`, 2);
        }));
        processedImages++;
        if (ocrText) ocrChunks.push(`--- OCR محلي: ${file.name} / الصفحة ${pageIndex + 1} ---\n${ocrText}`);
      }
    }

    onProgress?.(Math.min(88, 18 + Math.round(((fileIndex + 1) / files.length) * 18)), `تمت معالجة الملف ${fileIndex + 1} من ${files.length} محلياً`, 1);
  }

  const combinedText = [text.trim(), ...ocrChunks].filter(Boolean).join('\n\n').trim();
  const mapped = mapTableDataToMedicineItems(
    tables.length ? tables : undefined,
    combinedText,
    files.map(f => f.name).join(' + '),
    knownMedicines,
    knownSuppliers,
  );
  const items = validateAndSanitizeInvoiceItemList(mapped);
  const detectedType = targetType;
  const totalAmount = items.reduce((sum: number, item: any) => sum + (Number(item.totalPrice) || 0), 0);

  onProgress?.(94, `اكتمل التحليل المحلي واكتشاف ${items.length} صنفاً`, 3);

  return {
    detectedType,
    documentTitle: files.length === 1 ? files[0].name : `مجموعة من ${files.length} ملفات`,
    partyName: knownSuppliers[0] || '',
    documentNumber: `LOCAL-${Date.now().toString().slice(-6)}`,
    documentDate: new Date().toISOString().split('T')[0],
    totalAmount,
    items,
    summary: `تحليل محلي هجين: تم فحص النص والجداول والصور واستخراج ${items.length} صنفاً دون إرسال الملف إلى Gemini.`,
    rawText: combinedText,
  };
}
