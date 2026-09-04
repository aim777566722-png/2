import { mapTableDataToMedicineItems } from '../utils/documentParser';
import { validateAndSanitizeInvoiceItemList } from '../utils/helpers';

type LocalAnalysisFile = {
  name: string;
  type?: string;
  mimeType?: string;
  base64?: string;
  pageImages?: string[];
  extractedText?: string;
  tableData?: Array<Record<string, any>> | Array<any[]>;
};

type LocalMetadata = {
  documentNumber: string;
  documentDate: string;
  partyName: string;
  currency: string;
  title: string;
};

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

function normalizeDigits(value: string): string {
  return String(value || '')
    .replace(/[٠-٩]/g, d => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/[۰-۹]/g, d => String(PERSIAN_DIGITS.indexOf(d)));
}

function normalizeText(value: string): string {
  return normalizeDigits(String(value || ''))
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .replace(/[\u00A0\t]+/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\r/g, '')
    .trim();
}

function compact(value: string): string {
  return normalizeText(value).toLowerCase().replace(/[\s:：._-]+/g, '');
}

function parseNumber(value: any): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const normalized = normalizeDigits(String(value ?? ''))
    .replace(/[٬،]/g, ',')
    .replace(/\s/g, '')
    .replace(/[^0-9.,-]/g, '');
  if (!normalized) return 0;
  const lastComma = normalized.lastIndexOf(',');
  const lastDot = normalized.lastIndexOf('.');
  const cleaned = lastComma > lastDot
    ? normalized.replace(/\./g, '').replace(',', '.')
    : normalized.replace(/,/g, '');
  const result = Number(cleaned);
  return Number.isFinite(result) ? result : 0;
}

function isNumericToken(value: string): boolean {
  const normalized = normalizeDigits(value).trim().replace(/[٬،]/g, ',');
  return /^-?(?:\d{1,3}(?:[,.]\d{3})+|\d+)(?:[.]\d+)?$/.test(normalized) && /\d/.test(normalized);
}

function looksLikeDate(value: string): boolean {
  const s = normalizeDigits(value).trim();
  if (!s) return false;
  return /^(?:20\d{2}[-/.](?:0?[1-9]|1[0-2])(?:[-/.](?:0?[1-9]|[12]\d|3[01]))?|(?:0?[1-9]|[12]\d|3[01])[-/.](?:0?[1-9]|1[0-2])[-/.](?:20)?\d{2}|(?:0?[1-9]|1[0-2])[-/.](?:20)?\d{2})$/.test(s);
}

function normalizeDate(value: string): string {
  const s = normalizeDigits(value).trim();
  if (!looksLikeDate(s)) return '';
  const parts = s.split(/[\/.\-]/).map(Number);
  if (parts.length === 3) {
    let [a, b, c] = parts;
    if (a < 100) a += 2000;
    if (a >= 1900) return `${a.toString().padStart(4, '0')}-${b.toString().padStart(2, '0')}-${c.toString().padStart(2, '0')}`;
    if (c < 100) c += 2000;
    return `${c.toString().padStart(4, '0')}-${b.toString().padStart(2, '0')}-${a.toString().padStart(2, '0')}`;
  }
  if (parts.length === 2) {
    let [month, year] = parts;
    if (year < 100) year += 2000;
    return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}`;
  }
  return '';
}

function extractFirst(text: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return normalizeText(match[1]);
  }
  return '';
}

function inferTitle(text: string, fileNames: string[]): string {
  const hints: Array<[RegExp, string]> = [
    [/sales\s*return|return\s*invoice|مرتجع|مرتجعات|إرجاع/i, 'مرتجع'],
    [/purchase\s*order|أمر\s*شراء|طلب\s*شراء/i, 'أمر شراء'],
    [/price\s*list|قائمة\s*أسعار|اسعار/i, 'قائمة أسعار'],
    [/invoice|فاتورة/i, 'فاتورة'],
  ];
  for (const [pattern, title] of hints) if (pattern.test(text)) return title;
  return fileNames.length === 1 ? fileNames[0] : fileNames.join(' + ');
}

function extractMetadata(text: string, fileNames: string[], knownSuppliers: string[]): LocalMetadata {
  const joined = text.split('\n').map(normalizeText).filter(Boolean).join('\n');
  const documentNumber = extractFirst(joined, [
    /(?:invoice|inv|فاتورة|الفاتورة|رقم\s*الفاتورة|رقم\s*المستند|document\s*(?:no|number)|document\s*#|order\s*(?:no|number)|order\s*#|أمر\s*شراء|طلب\s*شراء|no\.?\s*#?)\s*[:#№-]?\s*([A-Z0-9][A-Z0-9\/_-]{1,30})/i,
  ]);
  let documentDate = extractFirst(joined, [
    /(?:date|dated|تاريخ|التاريخ|تاريخ\s*الفاتورة|تاريخ\s*الطلب)\s*[:：-]?\s*([0-9]{1,4}[\/.\-][0-9]{1,2}(?:[\/.\-][0-9]{2,4})?)/i,
    /\b(20[0-3]\d[\/.\-](?:0?[1-9]|1[0-2])[\/.\-](?:0?[1-9]|[12]\d|3[01]))\b/,
    /\b((?:0?[1-9]|[12]\d|3[01])[\/.\-](?:0?[1-9]|1[0-2])[\/.\-](?:20)?\d{2})\b/,
  ]);
  documentDate = normalizeDate(documentDate);

  const currency = extractFirst(joined, [
    /(?:currency|العملة|عملة)\s*[:：-]?\s*([^\n]+)/i,
    /\b(YER|SAR|USD|EUR|AED|OMR|KWD|QAR|BHD|JOD|ريال\s*يمني|ريال|دولار|يورو|درهم|دينار)\b/i,
  ]);

  let partyName = '';
  for (const supplier of knownSuppliers) {
    const candidate = normalizeText(supplier);
    if (candidate && joined.toLowerCase().includes(candidate.toLowerCase())) {
      partyName = candidate;
      break;
    }
  }
  if (!partyName) {
    partyName = extractFirst(joined, [
      /(?:supplier|vendor|company|customer|client|party|المورد|المورّد|الشركة|العميل|الزبون|الجهة)\s*[:：-]\s*([^\n]+)/i,
    ]);
  }

  return {
    documentNumber,
    documentDate,
    partyName,
    currency,
    title: extractFirst(joined, [
      /(?:document\s*title|title|نوع\s*المستند|نوع\s*الوثيقة)\s*[:：-]\s*([^\n]+)/i,
    ]) || inferTitle(joined, fileNames),
  };
}

function rowCells(value: any): string[] {
  if (Array.isArray(value)) return value.map(v => normalizeText(String(v ?? ''))).filter(Boolean);
  if (value && typeof value === 'object') return Object.values(value).map(v => normalizeText(String(v ?? ''))).filter(Boolean);
  const raw = String(value ?? '').replace(/\r/g, '').trim();
  if (!raw) return [];
  const tabCells = raw.split(/\t+/).map(normalizeText).filter(Boolean);
  if (tabCells.length > 1) return tabCells;
  return raw.split(/\s{3,}|\|+/).map(normalizeText).filter(Boolean);
}

function isNoiseLine(line: string): boolean {
  const s = compact(line);
  if (!s || s.length < 3) return true;
  return /^(page|صفحة|total|subtotal|grandtotal|المجموع|الإجمالي|اجمالي|date|التاريخ|invoice|فاتورة|supplier|المورد|المورّد|customer|العميل|currency|العملة|no|رقم|item|الصنف|الصنف\/الدواء|description|الوصف)/i.test(s);
}

function parseNumericTail(line: string): string[] | null {
  const normalized = normalizeDigits(line).replace(/[\u00A0]/g, ' ').trim();
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return null;

  let end = tokens.length;
  let numericStart = end;
  while (numericStart > 0 && isNumericToken(tokens[numericStart - 1])) numericStart--;
  const numericCount = end - numericStart;
  if (numericCount < 1 || numericStart < 1) return null;

  const name = tokens.slice(0, numericStart).join(' ').trim();
  if (name.length < 2 || !/[A-Za-z\u0600-\u06FF]/.test(name)) return null;
  if (looksLikeDate(tokens[numericStart - 1]) && numericCount === 1) return null;

  return [name, ...tokens.slice(numericStart)];
}

function detectItemRows(text: string): Array<string[]> {
  const rows: Array<string[]> = [];
  for (const rawLine of text.split('\n')) {
    const line = normalizeText(rawLine);
    if (!line || isNoiseLine(line)) continue;

    const cells = rowCells(rawLine);
    if (cells.length >= 2) {
      const numericCount = cells.filter(c => isNumericToken(c) || parseNumber(c) !== 0 || /^0+$/.test(c)).length;
      const hasText = cells.some(c => /[A-Za-z\u0600-\u06FF]/.test(c));
      if (numericCount >= 1 && hasText) rows.push(cells);
    }

    const numericTail = parseNumericTail(line);
    if (numericTail && !rows.some(row => row.map(compact).join('|') === numericTail.map(compact).join('|'))) {
      rows.push(numericTail);
    }
  }
  return rows;
}

function dedupeRows(rows: Array<string[]>): Array<string[]> {
  const seen = new Set<string>();
  const result: Array<string[]> = [];
  for (const row of rows) {
    const cleaned = row.map(normalizeText).filter(Boolean);
    const key = cleaned.map(compact).join('|');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }
  return result;
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
        const max = 2800;
        const scale = Math.min(2.2, max / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
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
          const gray = Math.max(0, Math.min(255, Math.round((0.299 * r + 0.587 * g + 0.114 * b - 128) * 1.32 + 128)));
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
  const { files, targetType, knownSuppliers = [], onProgress } = params;
  if (!files.length) throw new Error('لا توجد ملفات للتحليل المحلي');

  let text = '';
  const tables: any[] = [];
  const ocrChunks: string[] = [];
  let totalPages = 0;
  let processedPages = 0;

  for (const file of files) totalPages += file.pageImages?.length || (file.base64 && /image\//i.test(file.mimeType || '') ? 1 : 0);
  totalPages = Math.max(totalPages, 1);

  for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
    const file = files[fileIndex];
    const directText = normalizeText(file.extractedText || '');
    if (directText) text += `\n--- ${file.name} ---\n${directText}\n`;
    if (file.tableData?.length) tables.push(...file.tableData);

    const pages = file.pageImages?.length ? file.pageImages : (file.base64 && /image\//i.test(file.mimeType || '') ? [file.base64] : []);
    const shouldOcr = pages.length > 0 && (file.type === 'image' || /image\//i.test(file.mimeType || '') || directText.length < 240 || file.type === 'pdf');

    if (shouldOcr) {
      const { ocrImageDataUrl } = await import('./localOcr');
      for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
        const prepared = await preprocessImage(asDataUrl(pages[pageIndex], file.mimeType || 'image/jpeg'));
        const ocrText = normalizeText(await ocrImageDataUrl(prepared, progress => {
          const pageProgress = Math.max(0, Math.min(100, progress)) / 100;
          const overall = (processedPages + pageProgress) / totalPages;
          onProgress?.(Math.min(88, 18 + Math.round(overall * 70)), `تحليل الصفحة ${pageIndex + 1} من ${pages.length} محلياً (${file.name})...`, 2);
        }));
        processedPages++;
        if (ocrText) ocrChunks.push(`--- OCR محلي: ${file.name} / الصفحة ${pageIndex + 1} ---\n${ocrText}`);
      }
    }

    onProgress?.(Math.min(88, 18 + Math.round(((fileIndex + 1) / files.length) * 18)), `تمت معالجة الملف ${fileIndex + 1} من ${files.length} محلياً`, 1);
  }

  const combinedText = [text.trim(), ...ocrChunks].filter(Boolean).join('\n\n').trim();
  const heuristicRows = detectItemRows(combinedText);
  const allTableRows = tables.map(rowCells).filter(row => row.length > 0);
  const candidateRows = dedupeRows([...allTableRows, ...heuristicRows]);

  const mapped = mapTableDataToMedicineItems(
    candidateRows.length ? candidateRows : undefined,
    combinedText,
  );
  const items = validateAndSanitizeInvoiceItemList(mapped);
  const metadata = extractMetadata(combinedText, files.map(f => f.name), knownSuppliers);
  const totalAmount = items.reduce((sum: number, item: any) => sum + (Number(item.totalPrice) || 0), 0);
  const confidenceSignals = [combinedText.length > 80, candidateRows.length > 0, items.length > 0, Boolean(metadata.documentNumber), Boolean(metadata.documentDate), Boolean(metadata.partyName)];
  const confidence = Math.round((confidenceSignals.filter(Boolean).length / confidenceSignals.length) * 100);

  onProgress?.(94, `اكتمل التحليل المحلي: ${items.length} صنفاً، موثوقية أولية ${confidence}%`, 3);

  return {
    detectedType: targetType,
    documentTitle: metadata.title,
    partyName: metadata.partyName,
    documentNumber: metadata.documentNumber,
    documentDate: metadata.documentDate,
    currency: metadata.currency,
    totalAmount,
    items,
    confidence,
    summary: `تحليل محلي متعدد المراحل: تم فحص النص والجداول والصور، وإعادة بناء البنية تلقائياً، واستخراج ${items.length} صنفاً دون إرسال الملف إلى Gemini.`,
    rawText: combinedText,
  };
}
