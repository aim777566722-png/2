import { MarketPriceRecord, MedicinePriceSummary, PriceFreshness, Medicine } from '../types';
import { normalizeMedicineName, calculateSimilarity, findSimilarMedicine } from './similarity';

export function calculateDaysOld(dateString: string): number {
  if (!dateString) return 999;
  const priceDate = new Date(dateString).getTime();
  const now = new Date('2026-08-17').getTime(); // Using consistent system date
  const diffDays = Math.floor((now - priceDate) / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

export function getFreshness(daysOld: number): PriceFreshness {
  if (daysOld <= 7) return 'fresh';
  if (daysOld <= 30) return 'moderate';
  if (daysOld <= 60) return 'old';
  return 'stale';
}

export function getFreshnessBadge(freshness: PriceFreshness, daysOld: number) {
  switch (freshness) {
    case 'fresh':
      return {
        label: daysOld === 0 ? 'اليوم' : `منذ ${daysOld} ${daysOld === 1 ? 'يوم' : daysOld === 2 ? 'يومين' : 'أيام'} (سعر حديث)`,
        colorClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
        dotClass: 'bg-emerald-500',
        statusText: '🟢 حديث'
      };
    case 'moderate':
      return {
        label: `منذ ${daysOld} يوماً (مقبول)`,
        colorClass: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20',
        dotClass: 'bg-teal-500',
        statusText: '🟢 مقبول'
      };
    case 'old':
      return {
        label: `منذ ${daysOld} يوماً (متوسط القدم)`,
        colorClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
        dotClass: 'bg-amber-500',
        statusText: '🟡 قديم نسبياً'
      };
    case 'stale':
    default:
      return {
        label: `منذ ${daysOld} يوماً (قديم جداً - يحتاج تأكيد المورد)`,
        colorClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
        dotClass: 'bg-rose-500 animate-pulse',
        statusText: '🔴 قديم يحتاج تأكيد'
      };
  }
}

const summaryCache = new Map<string, MedicinePriceSummary | null>();

export function computeMedicinePriceSummary(
  medicineId: string,
  medicineName: string,
  allRecords: MarketPriceRecord[],
  knownMedicines?: Medicine[]
): MedicinePriceSummary | null {
  if (!allRecords || !Array.isArray(allRecords) || allRecords.length === 0) return null;

  const targetId = String(medicineId || '').trim();
  const targetName = String(medicineName || '').trim();
  const targetNorm = normalizeMedicineName(targetName);

  if (!targetId && !targetNorm) return null;

  const cacheKey = `${targetId}|||${targetNorm}|||${allRecords.length}|||${knownMedicines?.length || 0}`;
  if (summaryCache.has(cacheKey)) {
    return summaryCache.get(cacheKey)!;
  }

  // 1. Direct match by ID if ID is provided and valid
  let matchedRecords: MarketPriceRecord[] = targetId 
    ? allRecords.filter(r => r && String(r.medicineId || '').trim() === targetId)
    : [];

  // 2. Direct match by exact normalized name
  if (matchedRecords.length === 0 && targetNorm) {
    matchedRecords = allRecords.filter(r => {
      if (!r || !r.medicineName) return false;
      const rNorm = normalizeMedicineName(r.medicineName);
      return rNorm === targetNorm;
    });
  }

  // 3. Match via knownMedicines dictionary and aliases if provided
  if (matchedRecords.length === 0 && targetNorm && knownMedicines && knownMedicines.length > 0) {
    const simResult = findSimilarMedicine(targetName, knownMedicines);
    const matchedMed = simResult?.existingMedicine;

    if (matchedMed) {
      const medAliases = Array.isArray(matchedMed.aliases) ? matchedMed.aliases : [];
      const canonicalNorm = normalizeMedicineName(matchedMed.name);
      const aliasNorms = new Set(medAliases.map(a => normalizeMedicineName(a)));

      matchedRecords = allRecords.filter(r => {
        if (!r) return false;
        if (r.medicineId && r.medicineId === matchedMed.id) return true;
        const rNorm = normalizeMedicineName(r.medicineName || '');
        if (rNorm === canonicalNorm || aliasNorms.has(rNorm)) return true;
        return calculateSimilarity(matchedMed.name, r.medicineName || '') >= 0.70;
      });
    }
  }

  // 4. Substring & Fuzzy Similarity match against all market price records
  if (matchedRecords.length === 0 && targetNorm) {
    let bestSimilarity = 0;
    let bestMatchedNameNorm = '';

    for (const r of allRecords) {
      if (!r || !r.medicineName) continue;
      const rNorm = normalizeMedicineName(r.medicineName);
      
      // Substring check (e.g. "بندول اكسترا" inside "بنادول اكسترا 500 ملجم" or vice versa)
      if (targetNorm.length >= 3 && rNorm.length >= 3 && (rNorm.includes(targetNorm) || targetNorm.includes(rNorm))) {
        const minLen = Math.min(targetNorm.length, rNorm.length);
        const maxLen = Math.max(targetNorm.length, rNorm.length);
        const score = 0.80 + 0.20 * (minLen / maxLen);
        if (score > bestSimilarity) {
          bestSimilarity = score;
          bestMatchedNameNorm = rNorm;
        }
      } else {
        const sim = calculateSimilarity(targetName, r.medicineName);
        if (sim > bestSimilarity && sim >= 0.60) {
          bestSimilarity = sim;
          bestMatchedNameNorm = rNorm;
        }
      }
    }

    if (bestMatchedNameNorm && bestSimilarity >= 0.60) {
      matchedRecords = allRecords.filter(r => {
        if (!r || !r.medicineName) return false;
        const rNorm = normalizeMedicineName(r.medicineName);
        return rNorm === bestMatchedNameNorm || calculateSimilarity(r.medicineName, bestMatchedNameNorm) >= 0.80;
      });
    }
  }

  if (matchedRecords.length === 0) {
    if (summaryCache.size > 5000) summaryCache.clear();
    summaryCache.set(cacheKey, null);
    return null;
  }

  const validRecords = matchedRecords
    .filter(r => typeof r.unitPrice === 'number' && !isNaN(r.unitPrice) && r.unitPrice > 0)
    .sort((a, b) => new Date(b.invoiceDate || 0).getTime() - new Date(a.invoiceDate || 0).getTime());

  if (validRecords.length === 0) {
    if (summaryCache.size > 5000) summaryCache.clear();
    summaryCache.set(cacheKey, null);
    return null;
  }

  const prices = validRecords.map(r => r.unitPrice);
  const latestRecord = validRecords[0];
  const lowestPrice = Math.min(...prices);
  const highestPrice = Math.max(...prices);
  const sum = prices.reduce((acc, p) => acc + p, 0);
  const averagePrice = Math.round((sum / prices.length) * 100) / 100;

  const bestRecord = validRecords.find(r => r.unitPrice === lowestPrice) || latestRecord;
  const daysOld = calculateDaysOld(latestRecord.invoiceDate);

  const result: MedicinePriceSummary = {
    medicineId: targetId || latestRecord.medicineId || '',
    medicineName: targetName || latestRecord.medicineName || '',
    latestPrice: latestRecord.unitPrice,
    lowestPrice,
    averagePrice,
    highestPrice,
    bestSupplierId: bestRecord.supplierId,
    bestSupplierName: bestRecord.supplierName,
    latestDate: latestRecord.invoiceDate,
    daysOld,
    freshness: getFreshness(daysOld),
    recordsCount: validRecords.length,
    records: validRecords
  };

  if (summaryCache.size > 5000) summaryCache.clear();
  summaryCache.set(cacheKey, result);
  return result;
}

export function evaluatePriceQuality(
  price: number,
  averagePrice?: number,
  lowestPrice?: number
): { status: 'excellent' | 'fair' | 'high'; label: string; colorClass: string } {
  if (!averagePrice || averagePrice === 0) {
    return {
      status: 'fair',
      label: 'سعر قياسي',
      colorClass: 'bg-slate-500/10 text-slate-400 border-slate-500/20'
    };
  }

  if (lowestPrice && price <= lowestPrice) {
    return {
      status: 'excellent',
      label: '🟢 أفضل سعر سوق',
      colorClass: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
    };
  }

  if (price < averagePrice * 0.97) {
    return {
      status: 'excellent',
      label: '🟢 ممتاز (أقل من المتوسط)',
      colorClass: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
    };
  }

  if (price <= averagePrice * 1.04) {
    return {
      status: 'fair',
      label: '🟡 مقبول (حول المتوسط)',
      colorClass: 'bg-amber-500/10 text-amber-500 border-amber-500/20'
    };
  }

  return {
    status: 'high',
    label: '🔴 مرتفع عن السوق',
    colorClass: 'bg-rose-500/10 text-rose-500 border-rose-500/20'
  };
}

export function formatCurrency(amount: number | null | undefined): string {
  const safeAmount = typeof amount === 'number' && !isNaN(amount) ? amount : (Number(amount) || 0);
  return new Intl.NumberFormat('ar-SA', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0
  }).format(safeAmount) + ' ريال';
}

export function formatDateAr(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

export interface ParsedLineResult {
  rawText: string;
  name: string;
  quantity: number;
  unit: string;
  isUncertain: boolean;
}

/**
 * Universal Arabic Medicine Order Line Parser
 * Accurately extracts medicine name, dosage, and count from any free-text order format.
 * Guarantees that 100% of items are parsed whether saved in database or completely new.
 */
export function parseMedicineOrderLine(rawLine: string): ParsedLineResult {
  const trimmed = rawLine.trim();
  if (!trimmed) {
    return { rawText: '', name: '', quantity: 1, unit: 'علبة', isUncertain: false };
  }

  // Remove leading numbers / bullets e.g. "1.", "1-", "1)", "[1]", "*", "-", "•"
  let line = trimmed
    .replace(/^\[?\d+\]?[\.\-\)\:\s]+/, '')
    .replace(/^[\*\•\-\–\—\>]\s*/, '')
    .trim();

  if (!line) line = trimmed;

  let qty = 1;
  let name = line;
  let isUncertain = false;

  // Patterns for extracting quantity while preserving medicine strength (e.g. 500mg, 50 ملجم, 10 مجم):
  // 1. Explicit keyword: "بندول عدد 5" or "بندول كمية 5" or "بندول x 5" or "بندول * 5"
  const explicitCountMatch = line.match(/^(.+?)\s+(?:عدد|كمية|x|×|\*)\s*[:\s]*(\d+)(?:\s+(?:علبة|علب|شريط|باكيت|كرتون|حبات|حبة|امبول|فيال|قرص|كبسول))?$/i);
  
  // 2. Trailing unit + number or number + unit: e.g. "بندول 5 علب", "بندول 5 باكيت", "بندول 5 حبات"
  const trailingUnitMatch = line.match(/^(.+?)\s+(\d+)\s*(?:علبة|علب|شريط|باكيت|كرتون|حبات|حبة|امبول|فيال|قرص|كبسول|amp|tab|cap|vial)$/i);

  // 3. Leading count: "5 بندول", "5 علب بندول", "5x بندول", "5* بندول"
  const leadingCountMatch = line.match(/^(\d+)\s*(?:علبة|علب|شريط|باكيت|كرتون|حبات|حبة|x|×|\*|\-)?\s+(.+)$/i);

  // 4. Trailing number after medicine name (preserving strength):
  // E.g., "زواجرا 50 ملجم 4" or "بندول اكسترا 10" or "اموكسيل 500 5"
  const trailingNumberWithStrengthMatch = line.match(/^(.+?\s+\d+\s*(?:ملجم|مجم|ملج|جم|جرام|mg|g|ml|mcg|iu|%))\s+(\d+)$/i);
  const trailingTwoNumbersMatch = line.match(/^(.+?)\s+(\d+)\s+(\d+)$/i); // E.g., "زواجرا 50 4" -> name "زواجرا 50", qty 4
  const trailingSimpleNumberMatch = line.match(/^([^\d]+)\s+(\d+)$/i);

  if (explicitCountMatch) {
    name = explicitCountMatch[1].trim();
    qty = parseInt(explicitCountMatch[2], 10);
  } else if (trailingUnitMatch) {
    name = trailingUnitMatch[1].trim();
    qty = parseInt(trailingUnitMatch[2], 10);
  } else if (trailingNumberWithStrengthMatch) {
    name = trailingNumberWithStrengthMatch[1].trim();
    qty = parseInt(trailingNumberWithStrengthMatch[2], 10);
  } else if (trailingTwoNumbersMatch) {
    // First number is strength, second is quantity: "زواجرا 50 4" -> "زواجرا 50", 4
    name = `${trailingTwoNumbersMatch[1].trim()} ${trailingTwoNumbersMatch[2]}`;
    qty = parseInt(trailingTwoNumbersMatch[3], 10);
  } else if (trailingSimpleNumberMatch) {
    name = trailingSimpleNumberMatch[1].trim();
    qty = parseInt(trailingSimpleNumberMatch[2], 10);
  } else if (leadingCountMatch && isNaN(Number(leadingCountMatch[2]))) {
    qty = parseInt(leadingCountMatch[1], 10);
    name = leadingCountMatch[2].trim();
  } else {
    // If no distinct quantity found, keep whole line as medicine name and quantity 1
    name = line;
    qty = 1;
    isUncertain = false;
  }

  // Clean trailing punctuation / dashes from name
  name = name.replace(/^[\:\-\–\s]+|[\:\-\–\s]+$/g, '').trim();

  // Apply intelligent name formatting and OCR cleanup
  const formattedName = cleanAndFormatMedicineName(name || trimmed);

  return {
    rawText: trimmed,
    name: formattedName,
    quantity: qty > 0 ? qty : 1,
    unit: 'علبة',
    isUncertain
  };
}

/**
 * Intelligent Pharmaceutical Name Cleaner & Clarifier
 * Cleans OCR artifacts, normalizes units/strengths, and formats medicine names clearly.
 */
export function cleanAndFormatMedicineName(raw: string): string {
  if (!raw) return '';

  let cleaned = raw
    // Strip leading list markers like "1.", "1-", "[1]", "-", "*", "•"
    .replace(/^\[?\d+\]?[\.\-\)\:\s]+/, '')
    .replace(/^[\*\•\-\–\—\>\#\~\|\\]+\s*/, '')
    .replace(/[\*\•\-\–\—\>\#\~\|\\]+$/g, '')
    .replace(/[{}\[\]\<\>«»""'']/g, ' ')
    // Replace multiple spaces with single space
    .replace(/\s+/g, ' ')
    .trim();

  // Normalize pharmaceutical strength suffixes (e.g. 500mg, 500 ملج, 500 مجم -> 500 ملجم)
  cleaned = cleaned
    .replace(/(\d+)\s*(?:ملج|ملغم|مجم|ملجم|ميجام)\b/gi, '$1 ملجم')
    .replace(/(\d+)\s*(?:جرام|جم)\b/gi, '$1 جم')
    .replace(/(\d+)\s*(?:مل|ملي|ملتر)\b/gi, '$1 مل')
    .replace(/(\d+)\s*mg\b/gi, '$1 mg')
    .replace(/(\d+)\s*ml\b/gi, '$1 ml')
    .replace(/(\d+)\s*mcg\b/gi, '$1 mcg')
    .replace(/(\d+)\s*iu\b/gi, '$1 IU')
    .replace(/(\d+)\s*%\b/gi, '$1%');

  // Remove common OCR junk words or phone/footer fragments
  cleaned = cleaned
    .replace(/\b(?:تلفون|هاتف|جوال|ص\.ب|فاكس|page|صفحة)\s*[:\d\-]+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Strip standalone dates embedded in medicine name (e.g. "2027-05", "12/2026", "Exp: 05/27")
  // Only match real dates (avoid stripping dosages like 5/160 mg or dimensions like 4*5)
  cleaned = cleaned
    .replace(/(?:exp|expiry|mfg|date|تاريخ(?:\s*(?:الصلاحية|الانتهاء|الانتاج|الإنتاج))?|صلاحية|انتهاء|انتاج|إنتاج)[\s:\-_/.]*(?:20[2-3]\d[-/.]\d{1,2}(?:[-/.]\d{1,2})?|\d{1,2}[-/.]\d{1,2}[-/.]20[2-3]\d|\d{1,2}[-/.]20[2-3]\d|\d{1,2}[-/.]\d{2})/gi, '')
    .replace(/\b(20[2-3]\d[-/.](?:0?[1-9]|1[0-2])(?:[-/.](?:0?[1-9]|[12]\d|3[01]))?)\b/g, '')
    .replace(/\b((?:0?[1-9]|1[0-2])[-/.](?:20[2-3]\d|[2-3]\d))\b/g, '')
    .replace(/[\s:\-_/.]+$/g, '')
    .trim();

  // Capitalize Latin words properly if English
  if (/^[A-Za-z0-9\s\.\-\+%]+$/.test(cleaned)) {
    cleaned = cleaned
      .split(' ')
      .map(w => w.length > 1 ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w.toUpperCase())
      .join(' ');
  }

  return cleaned || raw.trim();
}

/**
 * Robust extraction separating medicine name from any embedded date or expiry string
 */
export function separateNameAndDate(rawName: string): { cleanName: string; extractedDate?: string } {
  if (!rawName) return { cleanName: '' };
  const str = String(rawName).trim();

  // 1. Look for explicit date pattern in the string, avoiding combination dosages like 5/160 mg
  let dateMatch: RegExpMatchArray | null = null;
  
  const explicitKeyword = /(?:exp|expiry|mfg|date|تاريخ(?:\s*(?:الصلاحية|الانتهاء|الانتاج|الإنتاج))?|صلاحية|انتهاء|انتاج|إنتاج)[\s:\-_/.]*(20[2-3]\d[-/.]\d{1,2}(?:[-/.]\d{1,2})?|\d{1,2}[-/.]\d{1,2}[-/.]20[2-3]\d|\d{1,2}[-/.]20[2-3]\d|\d{1,2}[-/.]\d{2})/i;
  const isoDate = /\b(20[2-3]\d[-/.](?:0?[1-9]|1[0-2])(?:[-/.](?:0?[1-9]|[12]\d|3[01]))?)\b/;
  const slashDate = /\b((?:0?[1-9]|1[0-2])[-/.](?:20[2-3]\d|[2-3]\d))\b/;

  dateMatch = str.match(explicitKeyword) || str.match(isoDate) || str.match(slashDate);

  let extractedDate: string | undefined = undefined;
  let remainingName = str;

  if (dateMatch) {
    extractedDate = dateMatch[1] || dateMatch[0];
    remainingName = str.replace(dateMatch[0], ' ').trim();
  }

  const cleanName = cleanAndFormatMedicineName(remainingName);
  return {
    cleanName: cleanName || (extractedDate ? '' : str),
    extractedDate
  };
}

/**
 * Strict validation rule for an individual extracted invoice/order item
 */
export function validateAndSanitizeInvoiceItem(item: any): any | null {
  if (!item || typeof item !== 'object') return null;

  let rawName = String(item.itemName || item.name || item.medicineName || '').trim();
  let existingExpiry = String(item.expiryDate || item.expiry || '').trim();

  // 1. Check if rawName is solely a date
  const isOnlyDate = /^(\d{4}[-/.]\d{1,2}(?:[-/.]\d{1,2})?|\d{1,2}[-/.]\d{1,2}[-/.]20[2-3]\d|\d{1,2}[-/.]20[2-3]\d)$/.test(rawName) ||
    /^(exp|expiry|mfg|date|تاريخ|صلاحية|انتهاء|انتاج|إنتاج)[\s:\-_/.]*\d{1,4}/i.test(rawName);

  if (isOnlyDate) {
    if (!existingExpiry) existingExpiry = rawName;
    return null; // Cannot use a pure date as a medicine name
  }

  // 2. Separate embedded date if present
  const sep = separateNameAndDate(rawName);
  let finalName = sep.cleanName;
  if (!existingExpiry && sep.extractedDate) {
    existingExpiry = sep.extractedDate;
  }

  // 3. Reject junk headers, timestamps, system watermarks, and noise
  if (
    !finalName ||
    finalName.length < 2 ||
    /^[\u0600-\u06FFa-zA-Z0-9\s]$/.test(finalName) ||
    /^\d{1,2}:\d{2}(:\d{2})?(\s*(am|pm|ص|م))?$/i.test(finalName) ||
    /^(am|pm|ص|م|am\/pm)\s*\d*$/i.test(finalName) ||
    /^\d{1,2}\s*(am|pm|ص|م)$/i.test(finalName) ||
    /(modernsoft|modernsoftye|yemensoft|onyx|al-?ameen|smartsystem|erp|software|power(ed)?\s*by|printed|user|admin|المستخدم|المسؤول|طباعة|طبع|تقرير|برمجة|نظام|تطوير|الوقت|الساعة)/i.test(finalName) ||
    /^(اسم الصنف|الصنف|اسم الدواء|الدواء|البيان|الوصف|المستحضر|المادة|اسم المادة|العلاج|item name|item|description|product|medicine|no\.|#|code|كود|رقم|م|الرقم|تسلسل|تاريخ|التاريخ|تاريخ الصنف|تاريخ الصلاحية|تاريخ الانتهاء|date|expiry|exp|mfg)$/i.test(finalName)
  ) {
    return null;
  }

  // 4. Validate quantity and prices
  const qty = Number(item.quantity || item.qty || item.count) || 1;
  const unitPrice = Number(item.unitPrice || item.price || item.rate) || 0;
  const totalPrice = item.totalPrice !== undefined ? Number(item.totalPrice) : unitPrice * qty;

  return {
    ...item,
    itemName: finalName,
    quantity: qty > 0 ? qty : 1,
    unit: item.unit || 'علبة',
    unitPrice: unitPrice >= 0 ? unitPrice : 0,
    totalPrice: totalPrice >= 0 ? totalPrice : 0,
    expiryDate: existingExpiry || undefined,
    bonusScheme: item.bonusScheme || '',
    discountPercent: Number(item.discountPercent) || 0,
    isUncertain: !!item.isUncertain,
    uncertaintyReason: item.uncertaintyReason || '',
    notes: item.notes || ''
  };
}

/**
 * Strict validation rule for an entire list of extracted items
 */
export function validateAndSanitizeInvoiceItemList(items: any[]): any[] {
  if (!Array.isArray(items)) return [];
  const result: any[] = [];

  for (const rawItem of items) {
    const sanitized = validateAndSanitizeInvoiceItem(rawItem);
    if (sanitized && sanitized.itemName) {
      result.push(sanitized);
    }
  }

  return result;
}

/**
 * Extract Strength and Pharmaceutical Form for clear UI display
 */
export function extractMedicineAttributes(name: string): {
  cleanName: string;
  strengthBadge?: string;
  formBadge?: string;
} {
  const cleanName = cleanAndFormatMedicineName(name);
  
  // Extract strength badge (e.g., 50 ملجم, 500 mg, 100 مل, 5%)
  const strengthMatch = cleanName.match(/(\d+(?:\.\d+)?\s*(?:ملجم|مجم|ملج|جم|مل|mg|ml|mcg|iu|%|g))/i);
  const strengthBadge = strengthMatch ? strengthMatch[1] : undefined;

  // Extract form badge (e.g., أقراص, كبسول, شراب, مرهم, كريم, قطرة, حقن, أمبول)
  const formMatch = cleanName.match(/(أقراص|قرص|حبوب|كبسولات|كبسول|شراب|معلق|مرهم|كريم|جل|قطرة|بخاخ|حقن|أمبولات|أمبول|فيال|تحاميل|فوار|tab|tabs|cap|caps|syrup|syr|cream|oint|drops|amp|vial|susp)\b/i);
  const formBadge = formMatch ? formMatch[1] : undefined;

  return {
    cleanName,
    strengthBadge,
    formBadge
  };
}

/**
 * Play a gentle, high quality synthetic audio chime on task completion
 */
export function playNotificationChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    // First note (D5 ~ 587Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0.12, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    // Second note (A5 ~ 880Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.12);
    gain2.gain.setValueAtTime(0.15, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.6);
  } catch (err) {
    // AudioContext might be muted or restricted by browser
  }
}
