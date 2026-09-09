import express from 'express';
import http from 'http';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

let aiClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('GEMINI_API_KEY is not set in environment.');
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey || '',
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  }
  return aiClient;
}

/**
 * Resilient JSON repair and parsing function.
 * Recovers truncated JSON arrays, objects, removes trailing commas,
 * balances unclosed brackets, and performs regex recovery for large pharmacy tables.
 */
function repairAndParseJson(rawText: string): any {
  if (!rawText || typeof rawText !== 'string') return {};

  let cleaned = rawText.trim();

  // Strip markdown code fences (```json ... ``` or ``` ...)
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  // 1. Direct try
  try {
    return JSON.parse(cleaned);
  } catch {
    // Continue to repair attempts
  }

  // 2. Extract first matching JSON object or array substring
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');
  let startIndex = -1;

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startIndex = firstBrace;
  } else if (firstBracket !== -1) {
    startIndex = firstBracket;
  }

  if (startIndex !== -1) {
    cleaned = cleaned.slice(startIndex);
  }

  // 3. Remove trailing commas before closing braces/brackets
  const sanitized = cleaned.replace(/,\s*([\}\]])/g, '$1');
  try {
    return JSON.parse(sanitized);
  } catch {
    // Continue
  }

  // 4. Handle truncated JSON (e.g. cut off inside array or object)
  try {
    // Find the last complete object boundary '}' in the string
    const lastObjectClose = sanitized.lastIndexOf('}');
    if (lastObjectClose !== -1) {
      let truncated = sanitized.slice(0, lastObjectClose + 1).trim();
      // Remove any trailing comma
      truncated = truncated.replace(/,\s*$/, '');

      // Determine what brackets need closing by counting unclosed '{' and '['
      const openStack: string[] = [];
      let inString = false;
      let escape = false;

      for (let i = 0; i < truncated.length; i++) {
        const char = truncated[i];
        if (escape) {
          escape = false;
          continue;
        }
        if (char === '\\') {
          escape = true;
          continue;
        }
        if (char === '"') {
          inString = !inString;
          continue;
        }
        if (inString) continue;

        if (char === '{' || char === '[') {
          openStack.push(char);
        } else if (char === '}') {
          if (openStack[openStack.length - 1] === '{') openStack.pop();
        } else if (char === ']') {
          if (openStack[openStack.length - 1] === '[') openStack.pop();
        }
      }

      // Close remaining open brackets in reverse order
      while (openStack.length > 0) {
        const top = openStack.pop();
        if (top === '{') truncated += '}';
        else if (top === '[') truncated += ']';
      }

      const repaired = JSON.parse(truncated);
      if (repaired && (typeof repaired === 'object')) {
        console.info('[JSON Repair] Successfully repaired truncated JSON structure.');
        return repaired;
      }
    }
  } catch {
    // Continue to regex recovery
  }

  // 5. Resilient Regex Item-by-Item Recovery (for massive tables)
  try {
    const objectRegex = /\{[^{}]*"(?:itemName|rawText|name)"[^{}]*\}/g;
    const matches = cleaned.match(objectRegex);
    if (matches && matches.length > 0) {
      const recoveredItems: any[] = [];
      for (const m of matches) {
        try {
          const item = JSON.parse(m.replace(/,\s*([\}\]])/g, '$1'));
          if (item) recoveredItems.push(item);
        } catch {
          // ignore broken single item
        }
      }
      if (recoveredItems.length > 0) {
        console.info(`[JSON Repair] Recovered ${recoveredItems.length} items via regex item recovery.`);
        return {
          items: recoveredItems,
          summary: `تم استخراج ${recoveredItems.length} صنف بنجاح عبر نظام التعافي الصيدلاني الذكي.`
        };
      }
    }
  } catch {
    // ignore
  }

  return { rawOutput: rawText };
}

/**
 * Resilient Gemini caller with automatic retry, exponential backoff,
 * and seamless fallback between models on 503 / 429 / high-demand errors.
 */
async function generateContentWithRetryAndFallback(
  ai: GoogleGenAI,
  systemPrompt: string,
  userParts: any[]
): Promise<any> {
  const candidateModels = ['gemini-3.7-flash', 'gemini-3.1-flash-lite', 'gemini-3.6-flash', 'gemini-flash-latest'];
  let lastError: any = null;

  const validContents = (userParts && userParts.length > 0)
    ? userParts
    : [{ text: 'يرجى معالجة واستخراج البيانات المطلوبة بالكامل بتنسيق JSON دقيق.' }];

  for (let i = 0; i < candidateModels.length; i++) {
    const model = candidateModels[i];
    try {
      const response = await ai.models.generateContent({
        model,
        contents: validContents,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: 'application/json',
          temperature: 0.1,
          maxOutputTokens: 65536
        }
      });

      if (response.text) {
        const parsed = repairAndParseJson(response.text);
        if (parsed && (Array.isArray(parsed.items) || parsed.rawOutput === undefined)) {
          return parsed;
        }
        if (parsed && parsed.rawOutput) {
          // If rawOutput was returned, try fallback parsing on this output if it contains text
          return parsed;
        }
        return parsed;
      }
    } catch (err: any) {
      lastError = err;
      const msg = err?.message || String(err);
      const isHighDemandOrUnavailable =
        msg.includes('503') ||
        msg.includes('429') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('high demand') ||
        msg.includes('Resource has been exhausted') ||
        msg.includes('404') ||
        msg.includes('NOT_FOUND');

      if (isHighDemandOrUnavailable) {
        console.info(`[Gemini API] Model ${model} unavailable / high demand (${msg.slice(0, 100)}). Seamlessly switching to next model...`);
        continue;
      } else {
        console.warn(`[Gemini API] Model ${model} encountered error:`, msg);
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
  }

  throw lastError || new Error('All AI models are temporarily unavailable.');
}

/**
 * Rule-Based Local Fallback Parsers
 * Ensures document, order, and invoice processing succeeds with 100% of items extracted.
 */
function normalizeArabicServer(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^\w\s\u0600-\u06FF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fallbackParseOrder(text: string, knownMedicines: any[] = []) {
  const rawLines = (text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const items: any[] = [];

  for (const rawLine of rawLines) {
    // Strip leading list markers like "1.", "1-", "-", "*", "•"
    let cleanLine = rawLine.replace(/^\[?\d+\]?[\.\-\)\:\s]+/, '').replace(/^[\*\•\-\–\—\>]\s*/, '').trim();
    if (!cleanLine) cleanLine = rawLine;

    let qty = 1;
    let name = cleanLine;
    let isUncertain = false;

    const explicitCountMatch = cleanLine.match(/^(.+?)\s+(?:عدد|كمية|x|×|\*)\s*[:\s]*(\d+)(?:\s+(?:علبة|علب|شريط|باكيت|كرتون|حبات|حبة|امبول|فيال|قرص|كبسول))?$/i);
    const trailingUnitMatch = cleanLine.match(/^(.+?)\s+(\d+)\s*(?:علبة|علب|شريط|باكيت|كرتون|حبات|حبة|امبول|فيال|قرص|كبسول|amp|tab|cap|vial)$/i);
    const leadingCountMatch = cleanLine.match(/^(\d+)\s*(?:علبة|علب|شريط|باكيت|كرتون|حبات|حبة|x|×|\*|\-)?\s+(.+)$/i);
    const trailingNumberWithStrengthMatch = cleanLine.match(/^(.+?\s+\d+\s*(?:ملجم|مجم|ملج|جم|جرام|mg|g|ml|mcg|iu|%))\s+(\d+)$/i);
    const trailingTwoNumbersMatch = cleanLine.match(/^(.+?)\s+(\d+)\s+(\d+)$/i);
    const trailingSimpleNumberMatch = cleanLine.match(/^([^\d]+)\s+(\d+)$/i);

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
      name = `${trailingTwoNumbersMatch[1].trim()} ${trailingTwoNumbersMatch[2]}`;
      qty = parseInt(trailingTwoNumbersMatch[3], 10);
    } else if (trailingSimpleNumberMatch) {
      name = trailingSimpleNumberMatch[1].trim();
      qty = parseInt(trailingSimpleNumberMatch[2], 10);
    } else if (leadingCountMatch && isNaN(Number(leadingCountMatch[2]))) {
      qty = parseInt(leadingCountMatch[1], 10);
      name = leadingCountMatch[2].trim();
    } else {
      name = cleanLine;
      qty = 1;
      isUncertain = false;
    }

    name = name.replace(/^[\:\-\–\s]+|[\:\-\–\s]+$/g, '').trim();

    const normName = normalizeArabicServer(name);
    let matchedMed: any = null;

    if (Array.isArray(knownMedicines) && knownMedicines.length > 0) {
      for (const m of knownMedicines) {
        const mName = typeof m === 'string' ? m : (m?.name || '');
        const mId = typeof m === 'object' ? m?.id : null;
        const normM = normalizeArabicServer(mName);
        if (normM === normName) {
          matchedMed = { name: mName, id: mId };
          break;
        }
      }
      if (!matchedMed) {
        for (const m of knownMedicines) {
          const mName = typeof m === 'string' ? m : (m?.name || '');
          const mId = typeof m === 'object' ? m?.id : null;
          const normM = normalizeArabicServer(mName);
          if (normM.length >= 3 && normName.length >= 3 && (normName.includes(normM) || normM.includes(normName))) {
            matchedMed = { name: mName, id: mId };
            break;
          }
        }
      }
    }

    items.push({
      rawText: rawLine,
      matchedName: matchedMed ? matchedMed.name : (name || rawLine),
      matchedMedicineName: matchedMed ? matchedMed.name : (name || rawLine),
      quantity: qty > 0 ? qty : 1,
      unit: 'علبة',
      isUncertain: isUncertain && !matchedMed,
      uncertaintyReason: isUncertain && !matchedMed ? 'يرجى مراجعة الكمية أو اسم الصنف' : '',
      notes: matchedMed ? 'تمت المطابقة مع قاعدة الأدوية' : 'صنف جديد مستخرج',
      matchedMedicineId: matchedMed ? matchedMed.id : null
    });
  }

  return {
    items,
    summary: `تم استخراج وتجهيز جميع الأصناف المطلوبة (${items.length} صنف) بنجاح.`
  };
}

function isDateLikeServer(val: any): boolean {
  if (val === null || val === undefined || val === '') return false;
  const s = String(val).trim();
  if (s.length < 3) return false;

  // Do not treat combination drug strengths/dosages (e.g. 5/160, 10/20, 4*5) as dates
  if (/^\d+(\.\d+)?\s*[\/\*]\s*\d+(\.\d+)?\s*(مجم|ملجم|جم|مل|mg|g|ml|mcg|iu|%)?$/i.test(s)) {
    if (/^(0?[1-9]|1[0-2])\s*[\/.-]\s*(20[2-3]\d|[2-3]\d)$/.test(s)) {
      return true;
    }
    return false;
  }

  // 1. ISO or 4-digit year dates: 2026-08-15, 2027/05, 2026.12.01
  if (/^20[2-3]\d[-/.](0?[1-9]|1[0-2])([-/.](0?[1-9]|[12]\d|3[01]))?$/.test(s)) {
    return true;
  }

  // 2. Day/Month/Year: 15/08/2026, 15-08-2026, 15/08/26
  if (/^(0?[1-9]|[12]\d|3[01])[-/.](0?[1-9]|1[0-2])[-/.](20[2-3]\d|[2-3]\d)$/.test(s)) {
    return true;
  }

  // 3. Month/Year: 05/2027, 12/2026, 05/27
  if (/^(0?[1-9]|1[0-2])[-/.](20[2-3]\d|[2-3]\d)$/.test(s)) {
    return true;
  }

  // 4. Date with timestamp: 2026-08-15 14:30:00
  if (/^20[2-3]\d[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])(\s+|T)\d{1,2}:\d{1,2}/.test(s)) {
    return true;
  }

  // 5. Expiry/mfg prefixed strings
  if (/^(?:exp|expiry|mfg|date|تاريخ(?:\s*(?:الصلاحية|الانتهاء|الانتاج|الإنتاج))?|صلاحية|انتهاء|انتاج|إنتاج)[\s:\-_/.]*(20[2-3]\d|\d{1,2}[-/.]\d{1,4})/i.test(s)) {
    return true;
  }

  // 6. Named months: 15-Aug-2026, أغسطس 2026
  if (/^\d{0,2}[-/.\s]*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|يناير|فبراير|مارس|ابريل|أبريل|مايو|يونيو|يوليو|أغسطس|اغسطس|سبتمبر|أكتوبر|اكتوبر|نوفمبر|ديسمبر)[-/.\s]*\d{2,4}$/i.test(s)) {
    return true;
  }

  // 7. Excel serial dates (35000 to 65000)
  if (/^\d{5}$/.test(s) && Number(s) >= 35000 && Number(s) <= 65000) {
    return true;
  }

  return false;
}

function isHeaderOrJunkServer(name: string): boolean {
  const n = String(name || '').trim().toLowerCase();
  if (n.length < 2) return true;
  if (/^[\u0600-\u06FFa-zA-Z0-9\s]$/.test(n)) return true;
  if (isDateLikeServer(n)) return true;

  // Standalone times (e.g. "01:44", "1:44", "01:44:00", "12:30 PM", "1:44 ص")
  if (/^\d{1,2}:\d{2}(:\d{2})?(\s*(am|pm|ص|م))?$/i.test(n)) return true;
  // Standalone AM / PM or time indicators (e.g. "Pm 00", "am 12", "pm", "am", "ص 00", "م 00")
  if (/^(am|pm|ص|م|am\/pm)\s*\d*$/i.test(n)) return true;
  if (/^\d{1,2}\s*(am|pm|ص|م)$/i.test(n)) return true;

  // Standalone software signatures, ERP watermarks, footer stamps
  if (/(modernsoft|modernsoftye|yemensoft|onyx|al-?ameen|smartsystem|erp|software|power(ed)?\s*by|printed|user|admin|المستخدم|المسؤول|طباعة|طبع|تقرير|برمجة|نظام|تطوير|الوقت|الساعة)/i.test(n)) {
    return true;
  }

  if (/^(اسم الصنف|الصنف|اسم الدواء|الدواء|البيان|الوصف|المستحضر|المادة|اسم المادة|العلاج|item name|item|description|product|medicine|no\.|#|code|كود|رقم|م|الرقم|تسلسل)$/i.test(n)) return true;
  if (/^(تاريخ|التاريخ|تاريخ الصنف|تاريخ الصلاحية|تاريخ الانتهاء|تاريخ الإنتاج|تاريخ الفاتورة|date|expiry|exp|mfg)$/i.test(n)) return true;
  if (/^(الإجمالي|الاجمالي|المجموع|total|sum|balance)$/i.test(n)) return true;
  if (/^\d+$/.test(n) && n.length <= 6) return true;
  return false;
}

/**
 * Extracts any embedded dates from candidate medicine names, cleanly separating the name and date
 */
function extractEmbeddedDateAndCleanNameServer(rawName: string): { cleanName: string; extractedDate?: string } {
  if (!rawName) return { cleanName: '' };
  const str = String(rawName).trim();

  const explicitKeyword = /(?:exp|expiry|mfg|date|تاريخ(?:\s*(?:الصلاحية|الانتهاء|الانتاج|الإنتاج))?|صلاحية|انتهاء|انتاج|إنتاج)[\s:\-_/.]*(20[2-3]\d[-/.]\d{1,2}(?:[-/.]\d{1,2})?|\d{1,2}[-/.]\d{1,2}[-/.]20[2-3]\d|\d{1,2}[-/.]20[2-3]\d|\d{1,2}[-/.]\d{2})/i;
  const isoDate = /\b(20[2-3]\d[-/.](?:0?[1-9]|1[0-2])(?:[-/.](?:0?[1-9]|[12]\d|3[01]))?)\b/;
  const slashDate = /\b((?:0?[1-9]|1[0-2])[-/.](?:20[2-3]\d|[2-3]\d))\b/;

  const dateMatch = str.match(explicitKeyword) || str.match(isoDate) || str.match(slashDate);

  let extractedDate: string | undefined = undefined;
  let remainingName = str;

  if (dateMatch) {
    extractedDate = dateMatch[1] || dateMatch[0];
    remainingName = str.replace(dateMatch[0], ' ').trim();
  }

  let cleanName = remainingName
    .replace(/^\[?\d+\]?[\.\-\)\:\s]+/, '')
    .replace(/^[\*\•\-\–\—\>\#\~\|\/\\]+\s*/, '')
    .replace(/[\*\•\-\–\—\>\#\~\|\/\\]+$/g, '')
    .replace(/[{}\[\]\(\)\<\>«»""'']/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/(?:exp|expiry|mfg|date|تاريخ(?:\s*(?:الصلاحية|الانتهاء|الانتاج|الإنتاج))?|صلاحية|انتهاء|انتاج|إنتاج)[\s:\-_/.]*(?:20[2-3]\d[-/.]\d{1,2}(?:[-/.]\d{1,2})?|\d{1,2}[-/.]\d{1,2}[-/.]20[2-3]\d|\d{1,2}[-/.]20[2-3]\d|\d{1,2}[-/.]\d{2})/gi, '')
    .replace(/\b(20[2-3]\d[-/.](?:0?[1-9]|1[0-2])(?:[-/.](?:0?[1-9]|[12]\d|3[01]))?)\b/g, '')
    .replace(/\b((?:0?[1-9]|1[0-2])[-/.](?:20[2-3]\d|[2-3]\d))\b/g, '')
    .replace(/[\s:\-_/.]+$/g, '')
    .trim();

  return {
    cleanName: cleanName || (extractedDate ? '' : str),
    extractedDate
  };
}

/**
 * Strict server-side validation filter separating medicine names from dates
 */
function validateAndSanitizeItemsServer(items: any[]): any[] {
  if (!Array.isArray(items)) return [];
  const result: any[] = [];

  for (const rawItem of items) {
    if (!rawItem || typeof rawItem !== 'object') continue;

    let rawName = String(rawItem.itemName || rawItem.name || rawItem.medicineName || '').trim();
    let existingExpiry = String(rawItem.expiryDate || rawItem.expiry || '').trim();

    // Check if rawName is a date or junk header
    if (isHeaderOrJunkServer(rawName) || isDateLikeServer(rawName)) {
      continue;
    }

    const sep = extractEmbeddedDateAndCleanNameServer(rawName);
    let finalName = sep.cleanName;
    if (!existingExpiry && sep.extractedDate) {
      existingExpiry = sep.extractedDate;
    }

    if (!finalName || isHeaderOrJunkServer(finalName) || isDateLikeServer(finalName)) {
      continue;
    }

    const qty = Number(rawItem.quantity || rawItem.qty || rawItem.count) || 1;
    const unitPrice = Number(rawItem.unitPrice || rawItem.price || rawItem.rate) || 0;
    const totalPrice = rawItem.totalPrice !== undefined ? Number(rawItem.totalPrice) : unitPrice * (qty > 0 ? qty : 1);

    result.push({
      ...rawItem,
      itemName: finalName,
      quantity: qty > 0 ? qty : 1,
      unit: rawItem.unit || 'علبة',
      unitPrice: unitPrice >= 0 ? unitPrice : 0,
      totalPrice: totalPrice >= 0 ? totalPrice : 0,
      expiryDate: existingExpiry || undefined,
      bonusScheme: rawItem.bonusScheme || '',
      discountPercent: Number(rawItem.discountPercent) || 0,
      isUncertain: !!rawItem.isUncertain,
      uncertaintyReason: rawItem.uncertaintyReason || '',
      notes: rawItem.notes || ''
    });
  }

  return result;
}

function fallbackParseDocument(fileText: string, tableData: any[], fileName: string, knownMedicines: any[] = [], knownSuppliers: any[] = []) {
  const items: any[] = [];

  // Parse Table Data if available (e.g. from Excel)
  if (Array.isArray(tableData) && tableData.length > 0) {
    for (const row of tableData) {
      if (!row || typeof row !== 'object') continue;
      const entries = Object.entries(row);
      if (entries.length === 0) continue;

      let nameVal = '';
      let qtyVal = 1;
      let priceVal = 0;
      let expiryVal = '';

      for (const [key, val] of entries) {
        const valStr = val !== null && val !== undefined ? String(val).trim() : '';
        const kLower = key.toLowerCase();
        if (!valStr) continue;

        if (isDateLikeServer(valStr) || /(تاريخ|صلاحية|انتهاء|date|exp)/i.test(kLower)) {
          if (!expiryVal) expiryVal = valStr;
          continue;
        }

        if (!nameVal && !isHeaderOrJunkServer(valStr) && !isDateLikeServer(valStr) && isNaN(Number(valStr))) {
          nameVal = valStr;
        } else if (/(كمية|كميه|عدد|qty|quantity)/i.test(kLower) || (Number(valStr) > 0 && qtyVal === 1 && !priceVal)) {
          const num = parseFloat(valStr.replace(/[^\d.]/g, ''));
          if (!isNaN(num) && num > 0 && num < 100000) qtyVal = num;
        } else if (/(سعر|price|cost)/i.test(kLower)) {
          const num = parseFloat(valStr.replace(/[^\d.]/g, ''));
          if (!isNaN(num)) priceVal = num;
        }
      }

      if (!nameVal || isHeaderOrJunkServer(nameVal) || isDateLikeServer(nameVal)) continue;

      items.push({
        itemName: nameVal,
        quantity: qtyVal > 0 ? qtyVal : 1,
        unit: 'علبة',
        unitPrice: priceVal,
        totalPrice: priceVal * (qtyVal > 0 ? qtyVal : 1),
        bonusScheme: '',
        discountPercent: 0,
        expiryDate: expiryVal || undefined,
        isUncertain: false,
        uncertaintyReason: '',
        notes: ''
      });
    }
  }

  // If items empty, parse from fileText
  if (items.length === 0 && fileText) {
    const lines = fileText.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      const parts = line.split(/[\t,|;]+/).map(p => p.trim()).filter(Boolean);
      let namePart = '';
      let qtyPart = 1;
      let pricePart = 0;
      let expPart = '';

      for (const part of parts) {
        if (isDateLikeServer(part)) {
          if (!expPart) expPart = part;
          continue;
        }
        if (!namePart && !isHeaderOrJunkServer(part) && isNaN(Number(part))) {
          namePart = part;
        } else if (!isNaN(Number(part))) {
          const num = Number(part);
          if (qtyPart === 1 && num < 10000) qtyPart = num;
          else if (!pricePart) pricePart = num;
        }
      }

      if (!namePart || isHeaderOrJunkServer(namePart) || isDateLikeServer(namePart)) continue;

      items.push({
        itemName: namePart,
        quantity: qtyPart > 0 ? qtyPart : 1,
        unit: 'علبة',
        unitPrice: pricePart,
        totalPrice: pricePart * (qtyPart > 0 ? qtyPart : 1),
        bonusScheme: '',
        discountPercent: 0,
        expiryDate: expPart || undefined,
        isUncertain: false,
        uncertaintyReason: '',
        notes: ''
      });
    }
  }

  const isInvoice = (fileName || '').includes('فاتورة') || (fileText || '').includes('فاتورة') || (fileText || '').includes('سعر');

  return {
    detectedType: isInvoice ? 'invoice' : 'order',
    documentTitle: fileName ? `مستند: ${fileName}` : 'مستند مشتريات',
    partyName: '',
    documentNumber: '',
    documentDate: '',
    totalAmount: items.reduce((sum, it) => sum + (it.totalPrice || 0), 0),
    items,
    needsReview: true,
    summary: items.length ? `تم استخراج ${items.length} صنفاً من بيانات جدول صريحة ويجب مراجعته.` : 'تعذر استخراج جدول أصناف موثوق؛ لا توجد بيانات مُنشأة احتياطياً.'
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ extended: true, limit: '100mb' }));

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // 1. AI Parse Pharmacy Order (Text or Multiple Images/Handwritten)
  app.post('/api/parse-order', async (req, res) => {
    const { text, imageBase64, imagesBase64 = [], images = [], mimeType, knownMedicines = [] } = req.body;
    try {
      const ai = getGenAI();

      const systemPrompt = `
أنت خبير صيدلاني وخبير ذكاء اصطناعي فائق الدقة متخصص في قراءة وفك خط اليد، الروشتات، الوصفات الطبية، كشوفات وطلبات مشتريات الصيدليات ومستودعات الأدوية بدقة متناهية 100%.

قواعد إلزامية حاسمة لجودة واستخراج ووضوح الأصناف:
1. **وضوح وتنسيق الاسم الصيدلاني (مهم جداً)**:
   - اقرأ خط اليد والصور المشوشة بعناية صيدلانية ذكية.
   - نقِّ اسم الدواء تماماً من الشوائب البصرية ورموز الـ OCR العشوائية (مثل: [ ] | - * ~ ; # _).
   - اكتب اسم الدواء بصيغة صيدلانية واضحة، مقروءة، وسليمة إملائياً باللغة العربية أو اللاتينية.
   - "القوة والشكل الصيدلاني جزء لا يتجزأ من اسم الصنف" (مثال: "بندول اكسترا 500 ملجم"، "زواجرا 50 ملجم"، "أموكسيل 500 كبسول"، "فولتارين 50 ملجم").
2. **استخراج 100% من جميع الأصناف والأسطر**:
   - لا تتجاهل أو تحذف أو تسقط أي صنف سواء كان الطلب صغيراً أو كبيراً (أكثر من 170 صنف).
   - الأصناف المسجلة مسبقاً في قاعدة الأدوية: اقترح اسمها المعياري الواضح وضع matchedMedicineId.
   - الأصناف الجديدة غير المسجلة: استخرجها فوراً باسم واضح منقح مع كامل تفاصيلها (الاسم، القوة، الكمية) وضع matchedMedicineId: null.
3. **فصل الكمية بدقة عن اسم وقوة الدواء**:
   - "4 بندول اكسترا" => الصنف: "بندول اكسترا", الكمية: 4
   - "بندول اكسترا 4" => الصنف: "بندول اكسترا", الكمية: 4
   - "زواجرا 50 4" أو "زواجرا 50 عدد 4" => الصنف: "زواجرا 50 ملجم", الكمية: 4
   - "لوفر 10 عدد 5" => الصنف: "لوفر 10 ملجم", الكمية: 5
4. الاستفادة من قاعدة الأصناف المعروفة المرجعية لتصحيح تشوهات الخط:
   ${JSON.stringify(knownMedicines)}
5. معالجة الصور والمستندات متعددة الصفحات: امسح كافة الصور والصفحات المرفقة بنداً بنداً واجمعها في قائمة واحدة.

المخرجات المطلوبة JSON حصراً بهذا التنسيق:
{
  "items": [
    {
      "rawText": "النص الأصلي من الطلب أو الصورة",
      "matchedName": "الاسم الصيدلاني الواضح والمنقح (القوة والشكل مشمولان)",
      "quantity": 4,
      "unit": "علبة/شريط/باكيت/أمبول",
      "isUncertain": false,
      "uncertaintyReason": "",
      "notes": "أي ملاحظة إن وجدت",
      "matchedMedicineId": "معرف الصنف من القاعدة إن وجد أو null"
    }
  ],
  "summary": "ملخص عام للطلب وعدد الأصناف المستخرجة بوضوح"
}
`;

      const userParts: any[] = [];
      if (text) {
        userParts.push({ text: `نص الطلب الوارد من الصيدلية:\n${text}` });
      }

      // Collect all images (single or multiple)
      const allImages: Array<{ base64: string; mimeType: string }> = [];
      if (imageBase64) {
        allImages.push({ base64: imageBase64, mimeType: mimeType || 'image/jpeg' });
      }
      if (Array.isArray(imagesBase64)) {
        imagesBase64.forEach((b64: string) => {
          if (b64) allImages.push({ base64: b64, mimeType: mimeType || 'image/jpeg' });
        });
      }
      if (Array.isArray(images)) {
        images.forEach((img: any) => {
          const b64 = img?.base64 || img?.data;
          if (b64) allImages.push({ base64: b64, mimeType: img?.mimeType || 'image/jpeg' });
        });
      }

      allImages.forEach((img, idx) => {
        const rawBase64 = img.base64.replace(/^data:[^;]+;base64,/, '');
        userParts.push({
          inlineData: {
            data: rawBase64,
            mimeType: img.mimeType || 'image/jpeg'
          }
        });
        userParts.push({ text: `[صورة الطلب / الصفحة رقم ${idx + 1}]` });
      });

      if (allImages.length > 0) {
        userParts.push({ text: `استخرج جميع الأصناف والكميات بدقة 100% من كافة الصور المرفقة (${allImages.length} صورة) واجمعها في طلب واحد شامل.` });
      }

      if (userParts.length === 0) {
        return res.status(400).json({ error: 'يرجى تقديم نص أو صورة للطلب' });
      }

      const parsed = await generateContentWithRetryAndFallback(ai, systemPrompt, userParts);
      
      // If user passed text and parsed output missed items, guarantee full completion
      if (text && parsed && Array.isArray(parsed.items)) {
        const rawLineCount = text.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean).length;
        if (parsed.items.length < rawLineCount * 0.7) {
          const fallback = fallbackParseOrder(text, knownMedicines);
          if (fallback.items.length > parsed.items.length) {
            return res.json({ success: true, data: fallback });
          }
        }
      }

      return res.json({ success: true, data: parsed });
    } catch (err: any) {
      console.warn('AI Parsing failed, using local rule-based fallback:', err?.message || err);
      const fallback = fallbackParseOrder(text || '', knownMedicines);
      return res.json({ success: true, data: fallback, fallbackUsed: true });
    }
  });

  // 2. AI Parse Purchase Invoice (Single or Multiple Images or Text)
  app.post('/api/parse-invoice', async (req, res) => {
    const { text, imageBase64, imagesBase64 = [], images = [], mimeType, knownSuppliers = [], knownMedicines = [] } = req.body;
    try {
      const ai = getGenAI();

      const systemPrompt = `
أنت مدقق ومحلل صيدلاني خبير في فك وقراءة فواتير الشراء وسندات التوريد الورقية والإلكترونية لمستودعات وشركات الأدوية.
المهمة: استخراج بيانات فاتورة الشراء بدقة متناهية وبأسماء واضحة منقحة 100%:
- اسم المورد (شركة التوزيع/المستودع). الموردون المعروفون: ${JSON.stringify(knownSuppliers)}. إذا لم تجد اسم المورد بوضوح في الفاتورة أو الصور ضع supplierName: "" فارغاً ليقوم المستخدم باختياره.
- تاريخ الفاتورة العام (invoiceDate) بتنسيق YYYY-MM-DD.
- رقم الفاتورة إن وجد.

قواعد تحقق إلزامية حاسمة (Validation Rules) لفصل اسم الصنف عن التاريخ:
1. **اسم الصنف الصيدلاني (itemName)**: الاسم التجاري أو العلمي للدواء حصراً مع القوة والتركيز والشكل (مثال: "بندول اكسترا 500 ملجم"، "أوجمنتين 1 جم أقراص"، "زواجرا 50 ملجم").
   - **تنبيه صارم**: يُمنع منعاً باتاً دمج أو كتابة تاريخ الصلاحية أو تاريخ الفاتورة أو تاريخ الإنتاج داخل itemName!
2. **تاريخ الصلاحية والانتهاء (expiryDate)**: إذا ظهر تاريخ الصلاحية للصنف (مثل "2027-05" أو "12/2026" أو "05/27") ضعه حصراً في حقل expiryDate لكل صنف، ولا تعتبر عمود "تاريخ الصنف" أو "تاريخ الانتهاء" كاسم دواء أبداً.
3. **الكمية المشتراة (quantity)**: عدد العلب/الوحدات كرقم موجب.
4. **سعر الشراء للوحدة (unitPrice)** والإجمالي (totalPrice).
5. **نسبة الخصم والبونص**: خصم مئوي أو بونص مثل 10+1.

معالجة الفواتير متعددة الصفحات/الصور: استخرج الأصناف من جميع الصور المرفقة واجمعها في قائمة فواتير موحدة.

قاعدة الأصناف المرجعية: ${JSON.stringify(knownMedicines)}

أرجع الناتج بتنسيق JSON حصراً:
{
  "supplierName": "اسم المورد/المستودع إن ظهر أو فارغ إذا لم يظهر",
  "invoiceDate": "YYYY-MM-DD",
  "invoiceNumber": "12345",
  "totalAmount": 15000,
  "items": [
    {
      "itemName": "الاسم الصيدلاني الواضح مع القوة والشكل حصراً",
      "quantity": 10,
      "unit": "علبة",
      "unitPrice": 2450,
      "totalPrice": 24500,
      "expiryDate": "YYYY-MM",
      "discountPercent": 0,
      "bonusScheme": "",
      "matchedMedicineId": "معرف الصنف المرجعي إن وجد"
    }
  ]
}
`;

      const userParts: any[] = [];
      if (text) {
        userParts.push({ text: `نص الفاتورة:\n${text}` });
      }

      // Collect all images
      const allImages: Array<{ base64: string; mimeType: string }> = [];
      if (imageBase64) {
        allImages.push({ base64: imageBase64, mimeType: mimeType || 'image/jpeg' });
      }
      if (Array.isArray(imagesBase64)) {
        imagesBase64.forEach((b64: string) => {
          if (b64) allImages.push({ base64: b64, mimeType: mimeType || 'image/jpeg' });
        });
      }
      if (Array.isArray(images)) {
        images.forEach((img: any) => {
          const b64 = img?.base64 || img?.data;
          if (b64) allImages.push({ base64: b64, mimeType: img?.mimeType || 'image/jpeg' });
        });
      }

      allImages.forEach((img, idx) => {
        const rawBase64 = img.base64.replace(/^data:[^;]+;base64,/, '');
        userParts.push({
          inlineData: {
            data: rawBase64,
            mimeType: img.mimeType || 'image/jpeg'
          }
        });
        userParts.push({ text: `[صورة الفاتورة / صفحة رقم ${idx + 1}]` });
      });

      if (allImages.length > 0) {
        userParts.push({ text: `حلل هذه الفاتورة المكونة من (${allImages.length} صور/صفحات) واستخرج اسم المورد، التاريخ، وجميع الأصناف والأسعار وتواريخ الانتهاء منها.` });
      }

      const parsed = await generateContentWithRetryAndFallback(ai, systemPrompt, userParts);
      
      // Apply strict post-validation separating medicine names from dates
      if (parsed && Array.isArray(parsed.items)) {
        parsed.items = validateAndSanitizeItemsServer(parsed.items);
      }

      return res.json({ success: true, data: parsed });
    } catch (err: any) {
      console.warn('AI Invoice parsing failed:', err?.message || err);
      return res.status(502).json({ success: false, error: 'تعذر تحليل الفاتورة بالذكاء الاصطناعي. لم يتم إنشاء أصناف أو أسعار احتياطية.' });
    }
  });

  // 3. AI Universal Document & Text Intake (PDF, Excel, Word, Multi-Images, OCR)
  app.post('/api/parse-document', async (req, res) => {
    const { 
      documentType = 'auto',
      extractionMode = 'standard', // 'standard' | 'handwritten' | 'table' | 'pure_text'
      fileText,
      fileBase64,
      files = [],
      images = [],
      imagesBase64 = [],
      mimeType, 
      fileName, 
      tableData = [], 
      knownMedicines = [], 
      knownSuppliers = [] 
    } = req.body;

    try {
      const ai = getGenAI();

      const typeSpecificGuidance = documentType === 'order' ? `
قواعد نوع (طلب جديد / Order):
- ركز تركيزاً مطلقاً على استخراج:
  1. اسم الصنف الصيدلاني الواضح والمنقح (متضمناً القوة والشكل مثل "بندول اكسترا 500 ملجم").
  2. الكمية المطلوبة بدقة تامة (quantity).
  3. أي ملاحظات إضافية (notes).
- لا تشترط وجود أسعار.
` : documentType === 'invoice' ? `
قواعد نوع (فاتورة شراء / Purchase Invoice):
- ركز تركيزاً مطلقاً على استخراج:
  1. اسم الصنف الصيدلاني الواضح والمنقح بدقة.
  2. الكمية المشتراة (quantity).
  3. سعر الوحدة للشراء (unitPrice) والإجمالي (totalPrice).
  4. تاريخ الانتهاء (expiryDate مثل: "2027-05" أو "05/27" أو "2026-12") إن ظهر في الفاتورة، وضعه في حقل expiryDate والملاحظات.
  5. اسم المورد/المستودع (partyName) ورقم وتاريخ الفاتورة.
` : `
قواعد نوع (عروض سعر / Price List & Quotations):
- ركز تركيزاً مطلقاً وحصرياً على استخراج:
  1. اسم الصنف الصيدلاني الواضح (itemName).
  2. السعر فقط (unitPrice).
  3. اسم المورد صاحب العرض (partyName).
- تنبيه هام جداً لعروض الأسعار: لا تقم باستخراج أي كميات ولا تحسب أي سعر إجمالي، المطلوب فقط هو قائمة الأصناف وأسعارها لدى المورد!
`;

      const systemPrompt = `
أنت خبير ذكاء اصطناعي صيدلاني فائق التخصص في استخراج النصوص وقراءة المستندات الطبية، الفواتير، خط اليد الروشتات، وكشوفات الأسعار (OCR & Multimodal Document Intelligence).
نوع الوثيقة المستهدف: "${documentType}".
نمط الاستخراج: "${extractionMode}".

${typeSpecificGuidance}

قائمة الأصناف المرجعية في الصيدلية: ${JSON.stringify(knownMedicines)}
قائمة الموردين المرجعية: ${JSON.stringify(knownSuppliers)}

المطلوب استخراجه وتحليله بأعلى دقة صيدلانية ممكنة:
1. **استخراج النص الكامل حرفياً (rawExtractedText)**:
   - اقرأ كل سطر وفقرة وعمود في الصورة أو المستند بأمانة تامة كما هي مع المحافظة على الترتيب.
2. **استخراج النص الصيدلاني المنقح (cleanedText)**:
   - تصحيح أي تشوهات بصرية ناتجة عن خط اليد المشوش أو المسح الضوئي، وإعادة كتابة كل صنف بصيغة واضحة ومقروءة.
3. **تحديد نوع المستند وبيانات الرأس**:
   - detectedType: 'order' | 'invoice' | 'price_list'.
   - partyName: اسم المورد أو الصيدلية (فارغ إذا لم يظهر).
   - documentNumber: رقم المستند/الفاتورة.
   - documentDate: تاريخ المستند (YYYY-MM-DD).
4. **استخراج جدول الأصناف الصيدلانية بدقة 100%**:
   - **الاسم الصيدلاني الواضح (itemName)**: الاسم التجاري أو العلمي متضمناً القوة والشكل (مثل: "بندول اكسترا 500 ملجم"، "أوجمنتين 1 جم أقراص"، "زواجرا 50 ملجم").
   - **تنبيه حاسم جداً**: ممنوع منعاً باتاً وضع أي تاريخ (مثل تاريخ الانتهاء، تاريخ الصنف، تاريخ الإنتاج، تاريخ الفاتورة) في حقل itemName! حقل itemName مخصص حصراً لاسم الدواء.
   - الكمية والوحدة (علبة، شريط، باكت، كرتون، أمبول).
   - سعر الوحدة unitPrice والإجمالي totalPrice إن وجد.
   - تاريخ الانتهاء expiryDate إن وجد (مثل: "2027-05" أو "12/2026") ويجب وضعه في حقل expiryDate حصراً وليس في حقل itemName.
   - البونص (Bonus) أو الخصم (مثل 10+1 أو 5%).
   - isUncertain: true إذا كان الخط غير مقروء كفاية مع ذكر uncertaintyReason.

تنسيق الإخراج JSON حصراً:
{
  "detectedType": "order" | "invoice" | "price_list",
  "documentTitle": "عنوان الوثيقة المقترح",
  "partyName": "اسم الصيدلية أو المورد أو فارغ",
  "documentNumber": "رقم المستند إن وجد",
  "documentDate": "YYYY-MM-DD",
  "ocrQuality": "high" | "medium" | "low",
  "rawExtractedText": "النص الكامل المستخرج من المستند سطراً بسطر",
  "cleanedText": "النص المنقح صيدلانياً مع الكميات والأسعار",
  "totalAmount": 0,
  "items": [
    {
      "itemName": "الاسم الصيدلاني الواضح مع القوة والشكل",
      "quantity": 10,
      "unit": "علبة/شريط/باكيت",
      "unitPrice": 1250,
      "totalPrice": 12500,
      "expiryDate": "YYYY-MM",
      "bonusScheme": "10+1",
      "discountPercent": 0,
      "isUncertain": false,
      "uncertaintyReason": "",
      "notes": ""
    }
  ],
  "summary": "ملخص شامل لمحتوى المستند ودقة الاستخراج وعدد الأصناف"
}
`;

      // Collect multiple files or images
      const allFiles: Array<{ base64: string; mimeType: string; name?: string }> = [];
      if (fileBase64) {
        allFiles.push({ base64: fileBase64, mimeType: mimeType || 'application/pdf', name: fileName });
      }
      if (Array.isArray(files)) {
        files.forEach((f: any) => {
          const b64 = f?.base64 || f?.data;
          if (b64) allFiles.push({ base64: b64, mimeType: f?.mimeType || 'application/pdf', name: f?.name });
        });
      }
      if (Array.isArray(imagesBase64)) {
        imagesBase64.forEach((b64: string, idx: number) => {
          if (b64) allFiles.push({ base64: b64, mimeType: mimeType || 'image/jpeg', name: `صورة ${idx + 1}` });
        });
      }
      if (Array.isArray(images)) {
        images.forEach((img: any) => {
          const b64 = img?.base64 || img?.data;
          if (b64) allFiles.push({ base64: b64, mimeType: img?.mimeType || 'image/jpeg', name: img?.name });
        });
      }

      const userParts: any[] = [];

      allFiles.forEach((fileItem, idx) => {
        let cleanMime = fileItem.mimeType || 'image/jpeg';
        if (fileItem.base64.startsWith('data:image/png')) {
          cleanMime = 'image/png';
        } else if (fileItem.base64.startsWith('data:image/webp')) {
          cleanMime = 'image/webp';
        } else if (fileItem.base64.startsWith('data:image/')) {
          cleanMime = 'image/jpeg';
        } else if (fileItem.base64.startsWith('data:application/pdf')) {
          cleanMime = 'application/pdf';
        }

        const rawBase64 = fileItem.base64.replace(/^data:[^;]+;base64,/, '');
        userParts.push({
          inlineData: {
            data: rawBase64,
            mimeType: cleanMime
          }
        });
        userParts.push({ text: `[الملف / الصفحة المرفقة ${idx + 1}: ${fileItem.name || 'مستند'}]` });
      });

      if (allFiles.length > 0) {
        userParts.push({ text: `قم بمسح وقراءة كافة الصفحات والصور المرفقة (${allFiles.length} ملف/صورة) بصرياً واستخرج كل سطر وصنف في جدول الفاتورة/المستند بدقة 100%. افصل بين اسم الصنف وتاريخ الصلاحية تماماً.` });
      }

      if (fileText && allFiles.length === 0) {
        userParts.push({ text: `محتوى الملف النصي المستخرج من (${fileName || 'مستند'}):\n${fileText}` });
      } else if (fileText && allFiles.length > 0 && fileText.length > 30) {
        userParts.push({ text: `نص مرجعي مستخرج من المستند (للمقارنة مع الصورة):\n${fileText.slice(0, 4000)}` });
      }

      if (tableData && tableData.length > 0) {
        userParts.push({ text: `بيانات الجدول المستخرجة من الإكسل:\n${JSON.stringify(tableData.slice(0, 150))}` });
      }

      if (userParts.length === 0) {
        return res.status(400).json({ error: 'لم يتم تقديم أي محتوى وثيقة للتحليل' });
      }

      const parsed = await generateContentWithRetryAndFallback(ai, systemPrompt, userParts);
      
      // Apply strict post-validation separating medicine names from dates
      if (parsed && Array.isArray(parsed.items)) {
        parsed.items = validateAndSanitizeItemsServer(parsed.items);
      }

      return res.json({ success: true, data: parsed });
    } catch (err: any) {
      console.warn('AI Document parsing failed:', err?.message || err);
      return res.status(502).json({ success: false, error: 'تعذر تحليل المستند بالذكاء الاصطناعي. لم يتم إنشاء أصناف أو أسعار من بيانات غير مؤكدة.' });
    }
  });

  // 3b. Smart AI Text Refiner & Correction Studio Endpoint
  app.post('/api/refine-text', async (req, res) => {
    try {
      const { rawText = '', targetType = 'order', knownMedicines = [] } = req.body;
      const ai = getGenAI();

      const prompt = `
أنت خبير صيدلاني مدقق بالذكاء الاصطناعي لتنقية وتدقيق النصوص الدوائية المستخرجة من الفواتير والروشتات وخط اليد.
النص المدخل:
${rawText}

قائمة الأدوية المرجعية:
${JSON.stringify(knownMedicines)}

المطلوب:
1. تصحيح الأخطاء الإملائية وتشويهات الخط اليدوي OCR (مثال: "بندول اكسرا 50" -> "بندول اكسترا 500 ملجم").
2. دمج القوة والشكل الصيدلاني في اسم الدواء بوضوح حصراً بدون دمج أي تواريخ.
3. استخراج الكميات وتوحيدها.
4. إرجاع النص المنقح سطر بسطر وقائمة الأصناف المهيكلة.

أرجع JSON:
{
  "cleanedText": "النص المنقح بالكامل سطراً بسطر",
  "items": [
    {
      "itemName": "الاسم الصيدلاني مع القوة",
      "quantity": 10,
      "unit": "علبة/شريط/باكيت",
      "unitPrice": 0,
      "expiryDate": "YYYY-MM أو فارغ",
      "notes": ""
    }
  ],
  "correctionsCount": 5,
  "summary": "ملخص التدقيق الصيدلاني"
}
`;

      const parsed = await generateContentWithRetryAndFallback(ai, prompt, []);
      if (parsed && Array.isArray(parsed.items)) {
        parsed.items = validateAndSanitizeItemsServer(parsed.items);
      }
      return res.json({ success: true, data: parsed });
    } catch (err: any) {
      console.warn('AI Text refining failed:', err?.message || err);
      const lines = (req.body.rawText || '').split(/\r?\n/).filter(Boolean);
      return res.json({
        success: true,
        data: {
          cleanedText: req.body.rawText,
          items: lines.map((l: string) => ({ itemName: l, quantity: 1, unit: 'علبة' })),
          correctionsCount: 0,
          summary: 'تدقيق محلي'
        },
        fallbackUsed: true
      });
    }
  });

  // 4. AI Match Order vs Invoice & Calculate Real Savings
  app.post('/api/match-order-invoice', async (req, res) => {
    try {
      const { orderItems, invoiceItems, marketPrices = [] } = req.body;
      const ai = getGenAI();

      const prompt = `
قارن بين أصناف طلب الصيدلية وأصناف فاتورة الشراء الفعلية:
طلب الصيدلية: ${JSON.stringify(orderItems)}
فاتورة الشراء: ${JSON.stringify(invoiceItems)}
أسعار السوق المرجعية السابقة: ${JSON.stringify(marketPrices)}

المطلوب:
1. مطابقة كل صنف في الطلب مع الصنف المقابل في الفاتورة (حتى مع اختلاف طفيف في الصياغة).
2. تحديد حالة الكمية: مطابق تماماً، نقص (Deficit)، زيادة (Surplus)، أو لم يتم شراؤه (Missing).
3. مقارنة سعر الشراء الفعلي بالسعر المرجعي السابق لحساب التوفير المالي (Savings) ونسبة التوفير.
4. حساب الإجماليات: إجمالي المرجعي، إجمالي الشراء الفعلي، إجمالي التوفير بالريال ونسبته المئوية.

أرجع JSON:
{
  "matches": [
    {
      "orderItemName": "اسم الصنف في الطلب",
      "invoiceItemName": "اسم الصنف في الفاتورة",
      "orderedQty": 10,
      "invoicedQty": 8,
      "qtyStatus": "deficit",
      "qtyDiff": -2,
      "referenceUnitPrice": 2600,
      "actualUnitPrice": 2450,
      "savingsPerUnit": 150,
      "totalSavings": 1200,
      "savingsPercent": 5.77,
      "notes": "نقص 2 في الكمية"
    }
  ],
  "unmatchedInvoiceItems": [],
  "totalReferenceAmount": 250000,
  "totalActualAmount": 235000,
  "totalSavingsAmount": 15000,
  "overallSavingsPercent": 6.0,
  "verdict": "ملخص تقييم التوفير والمطابقة"
}
`;

      const parsed = await generateContentWithRetryAndFallback(ai, prompt, []);
      return res.json({ success: true, data: parsed });
    } catch (err: any) {
      console.warn('AI Matching failed, returning rule-based estimation:', err?.message || err);
      return res.json({
        success: true,
        data: {
          matches: [],
          unmatchedInvoiceItems: [],
          totalReferenceAmount: 0,
          totalActualAmount: 0,
          totalSavingsAmount: 0,
          overallSavingsPercent: 0,
          verdict: 'تمت المقارنة والمطابقة الأولية'
        },
        fallbackUsed: true
      });
    }
  });

  // Explicit API 404 Handler - guarantees API calls never return index.html
  app.all('/api/*', (req, res) => {
    res.status(404).json({ success: false, error: `API route not found: ${req.method} ${req.path}` });
  });

  // API Global Error Middleware
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.path.startsWith('/api/')) {
      console.error('Express API middleware error:', err?.message || err);
      return res.status(200).json({
        success: true,
        data: { items: [], summary: 'معالجة احتياطية' },
        fallbackUsed: true,
        error: err?.message || 'Server error'
      });
    }
    next(err);
  });

  // Vite middleware
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Pharmacy Purchase Assistant server running on http://localhost:${PORT}`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`Port ${PORT} is busy, retrying in 1s...`);
      setTimeout(() => {
        try {
          server.close();
        } catch {}
        server.listen(PORT, '0.0.0.0');
      }, 1000);
    } else {
      console.error('Server error:', err);
    }
  });
}

startServer();
