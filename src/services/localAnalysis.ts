import { validateAndSanitizeInvoiceItemList } from '../utils/helpers';

type LocalFile = { name: string; mimeType?: string; base64?: string; pageImages?: string[]; extractedText?: string; tableData?: unknown[] };
type Field = 'name' | 'unit' | 'quantity' | 'bonus' | 'price' | 'code' | 'expiry' | 'total' | 'serial';
type Schema = Partial<Record<Field, number>>;
type ParsedItem = { id: string; itemName: string; quantity: number; unit: string; unitPrice: number; totalPrice: number; bonusScheme: string; discountPercent: number; notes: string; expiryDate?: string; rawText: string; isUncertain?: boolean; uncertaintyReason?: string };

const AR = '٠١٢٣٤٥٦٧٨٩'; const FA = '۰۱۲۳۴۵۶۷۸۹'; let itemCounter = 0;
export const normalizeOcrText = (value: unknown) => String(value ?? '').replace(/[٠-٩]/g, d => String(AR.indexOf(d))).replace(/[۰-۹]/g, d => String(FA.indexOf(d))).replace(/[\u064B-\u065F\u0670]/g, '').replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim();
const compact = (value: unknown) => normalizeOcrText(value).toLowerCase().replace(/[\s:：._\-/]+/g, '');
function numberOf(value: unknown): number | null { if (typeof value === 'number') return Number.isFinite(value) ? value : null; let s = normalizeOcrText(value).replace(/[٬،]/g, ',').replace(/\s/g, '').replace(/[^0-9.,+-]/g, ''); if (!s) return null; const comma = s.lastIndexOf(','), dot = s.lastIndexOf('.'); if (comma >= 0 && dot >= 0) s = comma > dot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, ''); else if (comma >= 0) s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, ''); const n = Number(s); return Number.isFinite(n) ? n : null; }
function isNumeric(value: string) { return numberOf(value) !== null && /^[\d٠-٩۰-۹.,٬،+\-\s]+$/.test(value); }
function isDate(value: string) {
  const s = normalizeOcrText(value);
  // A dot-separated number such as 12.50 or 10.00 is overwhelmingly more
  // likely to be a price than an expiry date in an extracted table. Dates
  // using slashes and hyphens remain supported below.
  if (/^\d+\.\d{1,2}$/.test(s)) return false;
  return /^(?:20\d{2}[/.-]\d{1,2}(?:[/.-]\d{1,2})?|\d{1,2}[\/-]\d{1,2}[\/-](?:20)?\d{2}|\d{1,2}[\/-](?:20)?\d{2})$/.test(s);
}
function cells(row: unknown): string[] {
  if (Array.isArray(row)) {
    // Preserve empty cells in matrix rows. Removing an empty price column
    // shifts every later value left and makes totals look like unit prices.
    return row.flatMap(value => normalizeOcrText(value).split(/\s*\|\s*/)).map(normalizeOcrText);
  }
  if (row && typeof row === 'object') {
    return Object.values(row).flatMap(value => normalizeOcrText(value).split(/\s*\|\s*/)).map(normalizeOcrText).filter(Boolean);
  }
  const text = String(row ?? '');
  return (text.includes('|') ? text.split(/\s*\|\s*/) : text.includes('\t') ? text.split(/\t+/) : text.split(/\s{2,}/)).map(normalizeOcrText).filter(Boolean);
}
function field(value: string): Field | undefined { const s = compact(value); if (/^(اسمالصنف|اسمالدواء|الصنف|الدواء|البيان|الوصف|المستحضر|itemname|medicine|product|description)$/.test(s)) return 'name'; if (/^(الوحدة|وحدة|unit|units)$/.test(s)) return 'unit'; if (/^(الكمية|كمية|عدد|qty|quantity)$/.test(s)) return 'quantity'; if (/^(بونص|bonus|هدية)$/.test(s)) return 'bonus'; if (/^(السعر|سعر|price|unitprice|rate)$/.test(s)) return 'price'; if (/^(رقمالصنف|كودالصنف|كود|باركود|barcode|code|itemno)$/.test(s)) return 'code'; if (/^(تاريخالانتهاء|تاريخالصلاحية|الصلاحية|انتهاء|expiry|expiration|exp)$/.test(s)) return 'expiry'; if (/^(القيمة|الإجمالي|اجمالي|المجموع|total|amount|value)$/.test(s)) return 'total'; if (/^(م|تسلسل|التسلسل|no|serial|#)$/.test(s)) return 'serial'; }
export function detectTable(rows: unknown[]): { headerIndex: number; schema: Schema } | null { const all = rows.map(cells); for (let i = 0; i < all.length; i++) { const schema: Schema = {}; all[i].forEach((cell, index) => { const key = field(cell); if (key !== undefined && schema[key] === undefined) schema[key] = index; }); const keys = Object.keys(schema).length; if (schema.name !== undefined && keys >= 3 && (schema.price !== undefined || schema.total !== undefined || schema.quantity !== undefined)) return { headerIndex: i, schema }; } return null; }
function isJunkName(value: string) { const s = normalizeOcrText(value); return s.length < 2 || isNumeric(s) || isDate(s) || !/[A-Za-z\u0600-\u06FF]/.test(s) || /(?:address|phone|invoice|customer|printed|subtotal|grand total|العنوان|هاتف|رقم الفاتورة|العميل|التاريخ|ملاحظات|الإجمالي|المجموع|طباعة|مدخل البيانات|تاريخ ووقت الإضافة)/i.test(s); }
function cleanName(value: string, schema: Schema, row: string[]) { let name = normalizeOcrText(value).replace(/^\d{3,16}\s+/, '').trim(); for (const key of ['code', 'serial', 'expiry', 'price', 'total', 'quantity'] as Field[]) { const index = schema[key]; const cell = index !== undefined ? row[index] : undefined; if (index !== undefined && index !== schema.name && cell) { const escaped = cell.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); name = name.replace(new RegExp(`\\b${escaped}\\b`, 'g'), ' '); } } return name.replace(/\s+/g, ' ').trim(); }
function unit(value: string | undefined) { const v = normalizeOcrText(value); return /^(كيس|علبة|علب|باكت|باكيت|شريط|كرتون|حبة|حبات|قرص|كبسول(?:ة|ات)?|امبول|أمبول|فيال|تيوب|قطعة|وحدة|قارورة|مضرب|تب|tab|tabs|cap|caps|vial|amp|box)$/i.test(v) ? v : ''; }
function valueAt(row: string[], index: number | undefined, positive = false): number | null { if (index === undefined || isDate(row[index] || '')) return null; const value = numberOf(row[index]); return value !== null && (!positive || value > 0) ? value : null; }
function parseTableRow(row: string[], schema: Schema): ParsedItem | null {
  const nameCell = schema.name === undefined ? '' : row[schema.name];
  if (!nameCell) return null;
  const nameValue = cleanName(nameCell, schema, row);
  if (isJunkName(nameValue)) return null;
  const quantity = valueAt(row, schema.quantity, true) ?? 1;
  const listedPrice = valueAt(row, schema.price, true);
  const total = valueAt(row, schema.total, true);
  const price = listedPrice ?? (total !== null && schema.quantity !== undefined && quantity > 0 ? total / quantity : null);
  if (price === null) return null;
  return { id: `local-${Date.now()}-${itemCounter++}`, itemName: nameValue, quantity, unit: unit(schema.unit === undefined ? undefined : row[schema.unit]) || 'علبة', unitPrice: price, totalPrice: total ?? price * quantity, bonusScheme: '', discountPercent: 0, notes: '', expiryDate: schema.expiry !== undefined && isDate(row[schema.expiry] || '') ? row[schema.expiry] : undefined, rawText: row.join(' | ') };
}

function isRtlTableHeader(row: string[]): boolean {
  const text = compact(row.join(' '));
  return /اسمالصنف/.test(text) && /(السعر|القيمة)/.test(text) && /(الكمية|الوحدة)/.test(text);
}

function integerDigits(value: string): number {
  return normalizeOcrText(value).replace(/[^0-9]/g, '').length;
}

function parseRtlTableRow(row: string[]): ParsedItem | null {
  const parts = row.flatMap(part => normalizeOcrText(part).split(/\s*\|\s*/)).map(normalizeOcrText).filter(Boolean);
  if (parts.length < 4) return null;

  const serial = numberOf(parts[0]);
  if (serial === null || !Number.isInteger(serial) || serial < 1 || serial > 999) return null;

  const codeIndex = parts.findIndex((part, index) => index > 0 && integerDigits(part) >= 6 && numberOf(part) !== null);
  if (codeIndex < 1) return null;

  const unitIndex = parts.findIndex((part, index) => index > codeIndex && !!unit(part));
  if (unitIndex <= codeIndex) return null;

  const nameValue = parts.slice(codeIndex + 1, unitIndex).join(' ').trim();
  if (isJunkName(nameValue)) return null;

  const numericAfterUnit: Array<{ index: number; value: number }> = [];
  for (let i = unitIndex + 1; i < parts.length; i++) {
    if (isDate(parts[i])) continue;
    const value = numberOf(parts[i]);
    if (value !== null) numericAfterUnit.push({ index: i, value });
  }
  if (!numericAfterUnit.length) return null;

  const quantityEntry = numericAfterUnit.find(entry => Number.isInteger(entry.value) && entry.value > 0 && entry.value <= 10000);
  if (!quantityEntry) return null;
  const quantity = quantityEntry.value;

  const bonusEntry = numericAfterUnit.find(entry => entry.index > quantityEntry.index && Number.isInteger(entry.value) && entry.value >= 0 && entry.value <= 10000);
  const priceCandidates = numericAfterUnit.filter(entry => entry.index > (bonusEntry?.index ?? quantityEntry.index) && entry.value > 0);
  const priceEntry = priceCandidates.find(entry => integerDigits(parts[entry.index]) < 6 || /[.,٬،]/.test(parts[entry.index]));
  if (!priceEntry) return null;

  const expiryIndex = parts.findIndex((part, index) => index > priceEntry.index && isDate(part));
  const afterPrice = numericAfterUnit.filter(entry => entry.index > priceEntry.index);
  const operationEntry = afterPrice.find(entry => integerDigits(parts[entry.index]) >= 6 && Number.isInteger(entry.value));
  const totalCandidates = afterPrice.filter(entry => entry.index !== operationEntry?.index && entry.value > 0);
  const totalEntry = totalCandidates.length ? totalCandidates[totalCandidates.length - 1] : undefined;

  const unitPrice = priceEntry.value;
  const totalPrice = totalEntry?.value ?? unitPrice * quantity;
  const expiryDate = expiryIndex >= 0 ? parts[expiryIndex] : undefined;

  return {
    id: `local-${Date.now()}-${itemCounter++}`,
    itemName: nameValue,
    quantity,
    unit: unit(parts[unitIndex]) || 'علبة',
    unitPrice,
    totalPrice,
    bonusScheme: bonusEntry ? String(bonusEntry.value) : '',
    discountPercent: 0,
    notes: '',
    expiryDate,
    rawText: parts.join(' | '),
  };
}

function numericTokens(parts: string[]): Array<{ index: number; part: string; value: number }> {
  return parts
    .map((part, index) => ({ index, part: normalizeOcrText(part), value: numberOf(part) }))
    .filter((entry): entry is { index: number; part: string; value: number } =>
      entry.value !== null && isNumeric(entry.part) && !isDate(entry.part)
    );
}

function parseHeuristicRow(row: string[]): ParsedItem | null {
  // OCR may return the whole product row as one cell, for example:
  // "جينسولين ... 4,470.00 3.00 0.00 a 119044".
  // Split that cell into tokens before deciding which values are columns.
  const parts = row
    .flatMap(part => normalizeOcrText(part).split(/\s*\|\s*/))
    .flatMap(part => normalizeOcrText(part).split(/\s+/))
    .map(normalizeOcrText)
    .filter(Boolean);
  if (parts.length < 2) return null;

  const numeric = numericTokens(parts);
  if (!numeric.length) return null;

  const first = numeric[0];
  const serialIndex = first.index === 0 && Number.isInteger(first.value) && first.value >= 1 && first.value <= 999
    ? first.index
    : -1;
  const codeIndex = [...numeric]
    .reverse()
    .find(entry => !/[.,٬،]/.test(entry.part) && integerDigits(entry.part) >= 5)?.index ?? -1;
  const data = numeric.filter(entry => entry.index !== serialIndex && entry.index !== codeIndex);
  const positiveData = data.filter(entry => entry.value > 0);
  if (!positiveData.length) return null;

  // In the common supplier layout the numeric columns are price, quantity,
  // bonus/discount, followed by the item code. Prefer the first positive
  // value as the price; decimal formatting is a useful tie-breaker only.
  const priceEntry = positiveData[0];
  const quantityEntry = data.find(entry =>
    entry.index > priceEntry.index && Number.isInteger(entry.value) && entry.value >= 1 && entry.value <= 10000
  );
  const quantity = quantityEntry?.value ?? 1;
  const bonusEntry = quantityEntry
    ? data.find(entry => entry.index > quantityEntry.index && entry.value >= 0 && entry.value <= 10000)
    : undefined;
  const unitPrice = priceEntry.value;
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return null;

  const excluded = new Set([serialIndex, codeIndex]);
  const nameParts = parts.filter((part, index) => {
    if (excluded.has(index) || isNumeric(part) || isDate(part) || unit(part)) return false;
    return /[A-Za-z\u0600-\u06FF]/.test(part) && !/^(?:الصنف|اسم الصنف|الوصف|description|item|product|invoice|فاتورة|الإجمالي|المجموع|total|amount|price|السعر|الكمية|qty|quantity)$/i.test(part);
  });
  const nameValue = nameParts.join(' ').replace(/\s+/g, ' ').trim();
  if (isJunkName(nameValue)) return null;

  return {
    id: `local-${Date.now()}-${itemCounter++}`,
    itemName: nameValue,
    quantity,
    unit: 'علبة',
    unitPrice,
    totalPrice: unitPrice * quantity,
    bonusScheme: bonusEntry ? String(bonusEntry.value) : '',
    discountPercent: 0,
    notes: '',
    rawText: row.join(' | '),
  };
}

export function extractItemsFromRows(rows: unknown[]): ParsedItem[] {
  const table = detectTable(rows);
  const all = rows.map(cells);
  const result: ParsedItem[] = [];
  const seen = new Set<string>();
  const add = (item: ParsedItem | null) => {
    if (!item) return;
    const key = `${compact(item.itemName)}|${item.quantity}|${item.unitPrice}|${item.totalPrice}`;
    if (!seen.has(key)) { seen.add(key); result.push(item); }
  };

  if (table) {
    const rtl = isRtlTableHeader(all[table.headerIndex]);
    for (let i = table.headerIndex + 1; i < all.length; i++) {
      const row = all[i]; if (!row.length) continue;
      if (row.some(c => field(c) === 'name') && row.some(c => field(c) === 'price' || field(c) === 'total')) continue;
      add(rtl ? (parseRtlTableRow(row) || parseTableRow(row, table.schema)) : parseTableRow(row, table.schema));
    }
  }

  // OCR often misses or distorts column headers. Do not discard otherwise
  // usable product/price rows just because detectTable() found no schema.
  if (!result.length) {
    for (const row of all) add(parseHeuristicRow(row));
  }
  return result;
}
function first(text: string, patterns: RegExp[]) { for (const pattern of patterns) { const match = text.match(pattern); if (match?.[1]) return normalizeOcrText(match[1]); } return ''; }
function metadata(text: string, names: string[]) { return { documentNumber: first(text, [/(?:invoice|inv|فاتورة|رقم\s*الفاتورة|رقم\s*المستند)\s*[:#№-]?\s*([A-Z0-9][A-Z0-9/_-]{1,30})/i]), documentDate: first(text, [/(?:date|تاريخ)\s*[:：-]?\s*([0-9]{1,4}[/.-][0-9]{1,2}(?:[/.-][0-9]{2,4})?)/i]), currency: first(text, [/(YER|SAR|USD|EUR|AED|ريال\s*يمني|ريال|دولار|يورو|درهم)/i]), title: /مرتجع|sales\s*return|return\s*invoice/i.test(text) ? 'مرتجع' : /فاتورة|invoice/i.test(text) ? 'فاتورة' : names.join(' + ') }; }
const dataUrl = (value: string, mime = 'image/jpeg') => /^data:/i.test(value) ? value : `data:${mime};base64,${value}`;
export async function analyzeDocumentLocally(params: { files: LocalFile[]; targetType: 'order' | 'invoice' | 'price_list'; knownMedicines?: string[]; knownSuppliers?: string[]; onProgress?: (p: number, m: string, s?: number) => void }) { const { files, targetType, onProgress } = params; if (!files.length) throw new Error('لا توجد ملفات للتحليل المحلي'); const rows: unknown[] = []; let text = ''; let page = 0; const pages = files.reduce((n, f) => n + (f.pageImages?.length || (f.base64 && /image\//i.test(f.mimeType || '') ? 1 : 0)), 0) || 1;
  for (const file of files) { rows.push(...(file.tableData || [])); text += `\n${file.extractedText || ''}`; const images = file.pageImages?.length ? file.pageImages : file.base64 && /image\//i.test(file.mimeType || '') ? [file.base64] : []; for (const image of images) { const { ocrImageDataUrlWithLayout } = await import('./localOcr'); onProgress?.(20 + Math.round(page / pages * 68), `تشغيل OCR المحلي للصفحة ${page + 1} من ${pages}...`, 2); const ocr = await ocrImageDataUrlWithLayout(dataUrl(image, file.mimeType), progress => onProgress?.(20 + Math.round((page + progress / 100) / pages * 68), 'استخراج البيانات محلياً...', 2)); text += `\n${ocr.text}`; rows.push(...(ocr.layoutText || ocr.text).split('\n')); page++; } }
  const items = validateAndSanitizeInvoiceItemList(extractItemsFromRows(rows)); const md = metadata(text, files.map(f => f.name)); const totalAmount = items.reduce((sum: number, item: any) => sum + (Number(item.totalPrice) || 0), 0); onProgress?.(94, `اكتمل التحليل المحلي: ${items.length} صنفاً`, 3); return { detectedType: targetType, documentTitle: md.title, partyName: '', documentNumber: md.documentNumber, documentDate: md.documentDate, currency: md.currency, totalAmount, items, confidence: items.length ? 90 : 40, summary: items.length ? `تحليل محلي موثوق لـ ${items.length} صنفاً.` : 'لم يتم العثور على جدول أصناف موثوق؛ تحتاج النتيجة إلى مراجعة.', rawText: text.trim(), needsReview: !items.length }; }
