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

const AR = '٠١٢٣٤٥٦٧٨٩';
const FA = '۰۱۲۳۴۵۶۷۸۹';
let itemCounter = 0;

function normalizeDigits(value: any): string {
  return String(value ?? '')
    .replace(/[٠-٩]/g, d => String(AR.indexOf(d)))
    .replace(/[۰-۹]/g, d => String(FA.indexOf(d)));
}

function normalizeText(value: any): string {
  return normalizeDigits(value)
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .replace(/[\u00A0\t]+/g, ' ')
    .replace(/\r/g, '')
    .replace(/ {2,}/g, ' ')
    .trim();
}

function compact(value: any): string {
  return normalizeText(value).toLowerCase().replace(/[\s:：._\-\/]+/g, '');
}

function parseNumber(value: any): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  let s = normalizeDigits(value).trim().replace(/[٬،]/g, ',').replace(/\s/g, '').replace(/[^0-9.,+\-]/g, '');
  if (!s) return 0;
  const comma = s.lastIndexOf(',');
  const dot = s.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) s = comma > dot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (comma >= 0) s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function isPureNumber(value: any): boolean {
  const s = normalizeDigits(value).trim().replace(/[٬،]/g, ',').replace(/\s/g, '');
  return /^[-+]?(?:\d{1,3}(?:[,.]\d{3})+|\d+)(?:[.]\d+)?$/.test(s);
}

function isDateLike(value: any): boolean {
  const s = normalizeDigits(value).trim();
  if (!s) return false;
  if (/^\d+(?:\.\d+)?\s*[\/\*]\s*\d+(?:\.\d+)?\s*(?:mg|g|ml|mcg|iu|مجم|ملجم|مل|جم)?$/i.test(s)) return false;
  return /^(?:20\d{2}[\/.\-]\d{1,2}(?:[\/.\-]\d{1,2})?|\d{1,2}[\/.\-]\d{1,2}[\/.\-](?:20)?\d{2}|\d{1,2}[\/.\-](?:20)?\d{2})$/.test(s);
}

function extractFirst(text: string, patterns: RegExp[]): string {
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) return normalizeText(m[1]);
  }
  return '';
}

function normalizeDate(value: string): string {
  const s = normalizeDigits(value).trim();
  if (!isDateLike(s)) return '';
  const p = s.split(/[/.\-]/).map(Number);
  if (p.length === 3) {
    if (p[0] >= 1900) return `${p[0].toString().padStart(4, '0')}-${p[1].toString().padStart(2, '0')}-${p[2].toString().padStart(2, '0')}`;
    const y = p[2] < 100 ? p[2] + 2000 : p[2];
    return `${y.toString().padStart(4, '0')}-${p[1].toString().padStart(2, '0')}-${p[0].toString().padStart(2, '0')}`;
  }
  if (p.length === 2) {
    const y = p[1] < 100 ? p[1] + 2000 : p[1];
    return `${y.toString().padStart(4, '0')}-${p[0].toString().padStart(2, '0')}`;
  }
  return '';
}

function isHeader(value: string): boolean {
  const s = compact(value);
  return /^(page|صفحة|total|subtotal|grandtotal|المجموع|الإجمالي|اجمالي|date|التاريخ|invoice|فاتورة|supplier|المورد|المورّد|customer|العميل|currency|العملة|item|الصنف|الصنفالدواء|description|الوصف|price|السعر|quantity|الكمية|qty|عدد|no|رقم|code|كود|barcode|باركود)$/.test(s);
}

function rowCells(value: any): string[] {
  if (Array.isArray(value)) return value.map(v => normalizeText(v)).filter(Boolean);
  if (value && typeof value === 'object') return Object.values(value).map(v => normalizeText(v)).filter(Boolean);
  const raw = String(value ?? '').replace(/\r/g, '').trim();
  if (!raw) return [];
  if (raw.includes('|')) return raw.split(/\s*\|\s*/).map(normalizeText).filter(Boolean);
  if (raw.includes('\t')) return raw.split(/\t+/).map(normalizeText).filter(Boolean);
  return raw.split(/\s{2,}/).map(normalizeText).filter(Boolean);
}

function textScore(value: string): number {
  if (!value || isHeader(value) || isDateLike(value) || isPureNumber(value)) return -10000;
  if (!/[A-Za-z\u0600-\u06FF]/.test(value)) return -10000;
  let score = value.length;
  if (/(mg|ml|mcg|iu|مجم|ملجم|مل|جم|شراب|كبسول|قرص|أقراص|مرهم|كريم|قطرة|امبول|فيال)/i.test(value)) score += 35;
  return score;
}

function createItem(name: string, quantity: number, unitPrice: number, totalPrice: number, rawText: string, unit = 'علبة') {
  const q = quantity > 0 ? quantity : 1;
  const p = unitPrice > 0 ? unitPrice : 0;
  const total = totalPrice > 0 ? totalPrice : (p > 0 ? p * q : 0);
  return {
    id: `local-${Date.now()}-${itemCounter++}`,
    itemName: name,
    quantity: q,
    unit,
    unitPrice: p,
    totalPrice: total,
    bonusScheme: '',
    discountPercent: 0,
    notes: '',
    rawText,
  };
}

function parseRow(row: any, rowIndex: number): any | null {
  const cells = rowCells(row);
  if (!cells.length) return null;
  const clean = cells.map(normalizeText).filter(Boolean);
  if (!clean.length || clean.every(isHeader)) return null;

  let name = '';
  let nameScore = -1;
  clean.forEach(c => {
    const score = textScore(c);
    if (score > nameScore) { nameScore = score; name = c; }
  });
  if (!name) return null;

  const nums = clean
    .map((c, i) => ({ value: c, n: parseNumber(c), i }))
    .filter(x => isPureNumber(x.value) && !isDateLike(x.value) && Number.isFinite(x.n) && x.n >= 0 && x.n < 100000000);
  if (!nums.length) return null;

  const numeric = nums.filter((x, i) => !(i === 0 && x.i === 0 && Number.isInteger(x.n) && x.n === rowIndex + 1 && x.n < 10000));
  if (!numeric.length) return null;

  const values = numeric.map(x => x.n);
  let quantity = 1;
  let unitPrice = 0;
  let totalPrice = 0;

  if (values.length === 1) {
    unitPrice = values[0];
    totalPrice = unitPrice;
  } else {
    const last = values[values.length - 1];
    const prev = values[values.length - 2];
    const before = values.length >= 3 ? values[values.length - 3] : 0;

    if (values.length >= 3 && Number.isInteger(before) && before > 0 && before <= 10000 && Math.abs(before * prev - last) <= Math.max(1, last * 0.03)) {
      quantity = before;
      unitPrice = prev;
      totalPrice = last;
    } else if (values.length === 2 && Number.isInteger(values[0]) && values[0] > 0 && values[0] <= 10000) {
      quantity = values[0];
      unitPrice = values[1];
      totalPrice = unitPrice * quantity;
    } else {
      unitPrice = prev > 0 ? prev : last;
      totalPrice = last > 0 ? last : unitPrice;
      const qtyCandidate = values.find(v => Number.isInteger(v) && v > 0 && v <= 10000 && v !== unitPrice && v !== totalPrice);
      if (qtyCandidate) quantity = qtyCandidate;
      if (unitPrice === totalPrice && quantity > 1) totalPrice = unitPrice * quantity;
    }
  }

  return createItem(name, quantity, unitPrice, totalPrice, clean.join(' | '));
}

function parseRows(rows: any[]): any[] {
  const result: any[] = [];
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    const item = parseRow(row, index);
    if (!item) return;
    const fullKey = `${compact(item.itemName)}|${item.quantity}|${item.unitPrice}|${item.totalPrice}`;
    if (seen.has(fullKey)) return;
    seen.add(fullKey);
    result.push(item);
  });
  return result;
}

function extractMetadata(text: string, names: string[], suppliers: string[]): LocalMetadata {
  const joined = text.split('\n').map(normalizeText).filter(Boolean).join('\n');
  const documentNumber = extractFirst(joined, [
    /(?:invoice|inv|فاتورة|الفاتورة|رقم\s*الفاتورة|رقم\s*المستند|document\s*(?:no|number)|order\s*(?:no|number)|أمر\s*شراء|طلب\s*شراء)\s*[:#№-]?\s*([A-Z0-9][A-Z0-9\/_-]{1,30})/i,
  ]);
  const dateRaw = extractFirst(joined, [
    /(?:date|dated|تاريخ|التاريخ|تاريخ\s*الفاتورة|تاريخ\s*الطلب)\s*[:：-]?\s*([0-9٠-٩۰-۹]{1,4}[/.\-][0-9٠-٩۰-۹]{1,2}(?:[/.\-][0-9٠-٩۰-۹]{2,4})?)/i,
  ]);
  let partyName = '';
  for (const supplier of suppliers) {
    const s = normalizeText(supplier);
    if (s && joined.toLowerCase().includes(s.toLowerCase())) { partyName = s; break; }
  }
  if (!partyName) partyName = extractFirst(joined, [/(?:supplier|vendor|company|customer|client|party|المورد|المورّد|الشركة|العميل|الزبون|الجهة)\s*[:：-]\s*([^\n]+)/i]);
  const currency = extractFirst(joined, [/(?:currency|العملة|عملة)\s*[:：-]?\s*([^\n]+)/i, /\b(YER|SAR|USD|EUR|AED|OMR|KWD|QAR|BHD|JOD|ريال\s*يمني|ريال|دولار|يورو|درهم|دينار)\b/i]);
  let title = extractFirst(joined, [/(?:document\s*title|title|نوع\s*المستند|نوع\s*الوثيقة)\s*[:：-]\s*([^\n]+)/i]);
  if (!title) title = /مرتجع|مرتجعات|إرجاع|sales\s*return|return\s*invoice/i.test(joined) ? 'مرتجع' : /أمر\s*شراء|طلب\s*شراء|purchase\s*order/i.test(joined) ? 'أمر شراء' : /قائمة\s*أسعار|price\s*list|اسعار/i.test(joined) ? 'قائمة أسعار' : /فاتورة|invoice/i.test(joined) ? 'فاتورة' : (names.length === 1 ? names[0] : names.join(' + '));
  return { documentNumber, documentDate: normalizeDate(dateRaw), partyName, currency, title };
}

async function preprocessImage(dataUrl: string): Promise<string> {
  if (!dataUrl || typeof window === 'undefined') return dataUrl;
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      try {
        const max = 2800;
        const scale = Math.min(2.0, max / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
        const w = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
        const h = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
        const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve(dataUrl);
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/png'));
      } catch { resolve(dataUrl); }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl.startsWith('data:') ? dataUrl : `data:image/jpeg;base64,${dataUrl}`;
  });
}

function asDataUrl(value: string, mime = 'image/jpeg'): string {
  return /^data:/i.test(value) ? value : `data:${mime};base64,${value}`;
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

  let combinedText = '';
  const rawRows: any[] = [];
  let totalPages = 0;
  let processedPages = 0;

  for (const file of files) {
    totalPages += file.pageImages?.length || (file.base64 && /image\//i.test(file.mimeType || '') ? 1 : 0);
    if (file.tableData?.length) rawRows.push(...file.tableData);
    if (file.extractedText) combinedText += `\n--- ${file.name} ---\n${file.extractedText}`;
  }
  totalPages = Math.max(1, totalPages);

  for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
    const file = files[fileIndex];
    const pages = file.pageImages?.length ? file.pageImages : (file.base64 && /image\//i.test(file.mimeType || '') ? [file.base64] : []);
    if (!pages.length) continue;

    const { ocrImageDataUrlWithLayout } = await import('./localOcr');
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      onProgress?.(Math.min(34, 20 + Math.round(((processedPages + 0.05) / totalPages) * 14)), `تشغيل OCR المحلي للصفحة ${pageIndex + 1} من ${pages.length}...`, 2);
      const prepared = await preprocessImage(asDataUrl(pages[pageIndex], file.mimeType || 'image/jpeg'));
      const ocr = await ocrImageDataUrlWithLayout(prepared, progress => {
        const pageProgress = Math.max(0, Math.min(100, progress)) / 100;
        const overall = (processedPages + pageProgress) / totalPages;
        onProgress?.(Math.min(88, 20 + Math.round(overall * 68)), `تحليل الصفحة ${pageIndex + 1} من ${pages.length} محلياً...`, 2);
      });
      const pageText = [ocr.text, ocr.layoutText].filter(Boolean).join('\n');
      if (pageText) combinedText += `\n--- OCR محلي: ${file.name} / الصفحة ${pageIndex + 1} ---\n${pageText}`;
      if (ocr.layoutText) rawRows.push(...ocr.layoutText.split('\n'));
      else if (ocr.text) rawRows.push(...ocr.text.split('\n'));
      processedPages++;
    }
    onProgress?.(Math.min(88, 20 + Math.round(((fileIndex + 1) / files.length) * 18)), `تمت معالجة الملف ${fileIndex + 1} من ${files.length} محلياً`, 2);
  }

  const rows = parseRows(rawRows);
  const items = validateAndSanitizeInvoiceItemList(rows);
  const metadata = extractMetadata(combinedText, files.map(f => f.name), knownSuppliers);
  const totalAmount = items.reduce((sum: number, item: any) => sum + (Number(item.totalPrice) || 0), 0);
  const signals = [combinedText.length > 80, rows.length > 0, items.length > 0, Boolean(metadata.documentNumber), Boolean(metadata.documentDate), Boolean(metadata.partyName)];
  const confidence = Math.round((signals.filter(Boolean).length / signals.length) * 100);

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
    summary: `تحليل محلي متعدد المراحل: تم تحليل النص وبنية الصفوف ومواقع الأعمدة، واستخراج ${items.length} صنفاً دون إرسال الملف إلى Gemini.`,
    rawText: combinedText.trim(),
  };
}
