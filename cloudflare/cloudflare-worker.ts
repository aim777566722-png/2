export interface Env {
  GEMINI_API_KEY: string;
}

const GEMINI_MODEL = 'gemini-3.6-flash';
const MAX_REFERENCE_ITEMS = 500;
const MAX_REFERENCE_CHARS = 24000;
const MAX_IMAGE_BASE64_CHARS = 12_000_000;
const GEMINI_MAX_RETRIES = 2;
const GEMINI_RETRY_DELAYS_MS = [1500, 3500];
const GEMINI_REQUEST_TIMEOUT_MS = 60000;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'access-control-allow-origin': '*',
    },
  });
}

function cors(request: Request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'POST,GET,OPTIONS',
        'access-control-allow-headers': 'Content-Type',
      },
    });
  }
}

function normalizeBase64(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/^data:[^;]+;base64,/i, '').replace(/\s/g, '');
}

function normalizeMimeType(value: unknown): string {
  const mime = typeof value === 'string' ? value.toLowerCase().split(';')[0].trim() : '';
  return /^image\/(jpeg|jpg|png|webp|heic|heif)$/.test(mime) ? (mime === 'image/jpg' ? 'image/jpeg' : mime) : 'image/jpeg';
}

function collectImages(payload: any) {
  const result: Array<{ name?: string; base64: string; mimeType: string }> = [];
  const images = Array.isArray(payload?.images) ? payload.images : [];
  for (const image of images) {
    const base64 = normalizeBase64(typeof image === 'string' ? image : image?.base64);
    if (!base64) continue;
    if (base64.length > MAX_IMAGE_BASE64_CHARS) {
      throw new Error('الصورة كبيرة جداً بعد الضغط. أعد اختيار الصورة من داخل التطبيق ليتم ضغطها تلقائياً.');
    }
    result.push({
      name: typeof image === 'object' ? image?.name : undefined,
      base64,
      mimeType: normalizeMimeType(typeof image === 'string' ? 'image/jpeg' : image?.mimeType),
    });
  }
  if (result.length === 0 && Array.isArray(payload?.imagesBase64)) {
    for (const image of payload.imagesBase64) {
      const base64 = normalizeBase64(image);
      if (!base64) continue;
      if (base64.length > MAX_IMAGE_BASE64_CHARS) {
        throw new Error('الصورة كبيرة جداً بعد الضغط. أعد اختيار الصورة من داخل التطبيق ليتم ضغطها تلقائياً.');
      }
      result.push({ base64, mimeType: 'image/jpeg' });
    }
  }
  return result;
}

function limitReferenceList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  let chars = 0;
  for (const entry of value) {
    const text = String(entry ?? '').trim();
    if (!text) continue;
    if (result.length >= MAX_REFERENCE_ITEMS || chars + text.length > MAX_REFERENCE_CHARS) break;
    result.push(text);
    chars += text.length;
  }
  return result;
}

function normalizeArabicDigits(value: unknown): string {
  return String(value ?? '')
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = normalizeArabicDigits(value).replace(/[,،\s\$\£\€\¥]/g, '').replace(/[^0-9.\-]/g, '');
  const number = Number(text);
  return Number.isFinite(number) ? number : 0;
}

function firstValue(item: any, keys: string[]) {
  for (const key of keys) {
    const value = item?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
}

function normalizeExtractedItem(item: any) {
  const itemName = String(firstValue(item, ['itemName', 'matchedName', 'medicineName', 'name', 'productName', 'description', 'rawText']) || '').trim();
  const rawText = String(firstValue(item, ['rawText', 'itemName', 'description', 'name']) || itemName).trim();
  const matchedName = String(firstValue(item, ['matchedName', 'itemName', 'medicineName', 'name']) || itemName).trim();
  const quantityValue = firstValue(item, ['quantity', 'qty', 'count', 'amount']);
  const unitPriceValue = firstValue(item, ['unitPrice', 'price', 'unit_price', 'sellingPrice', 'purchasePrice', 'cost', 'سعر']);
  const totalPriceValue = firstValue(item, ['totalPrice', 'total', 'lineTotal', 'amountTotal', 'total_amount', 'الإجمالي']);
  const bonusScheme = String(firstValue(item, ['bonusScheme', 'bonus', 'freeQuantity', 'offer', 'promotion', 'البونص', 'الخصم']) || '').trim();
  const discountPercentValue = firstValue(item, ['discountPercent', 'discountPercentage', 'discount_rate']);
  const expiryDate = String(firstValue(item, ['expiryDate', 'expirationDate', 'expiry', 'تاريخ_الانتهاء']) || '').trim();
  return {
    ...item,
    itemName,
    rawText,
    matchedName,
    quantity: Math.max(1, toNumber(quantityValue) || 1),
    unit: String(firstValue(item, ['unit', 'uom', 'unitName']) || '').trim(),
    unitPrice: Math.max(0, toNumber(unitPriceValue)),
    totalPrice: Math.max(0, toNumber(totalPriceValue)),
    bonusScheme,
    discountPercent: Math.max(0, toNumber(discountPercentValue)),
    expiryDate,
    isUncertain: Boolean(item?.isUncertain),
    uncertaintyReason: String(item?.uncertaintyReason || '').trim(),
    notes: String(item?.notes || '').trim(),
  };
}

function isRetryableGeminiStatus(status: number) {
  return status === 408 || status === 409 || status === 500 || status === 502 || status === 503 || status === 504;
}

async function callGemini(env: Env, payload: any) {
  const parts: any[] = [];
  const images = collectImages(payload);
  const knownMedicines = limitReferenceList(payload?.knownMedicines);
  const knownSuppliers = limitReferenceList(payload?.knownSuppliers);
  const prompt = `You are a high-accuracy pharmacy document OCR and structured extraction engine. Read Arabic and English documents directly from every supplied page/image. The primary goal is COMPLETE extraction of every recognizable line, especially prices and commercial terms.

Return JSON only using this exact top-level shape:
{"partyName":"","documentNumber":"","documentDate":"","detectedType":"","totalAmount":0,"items":[{"itemName":"","rawText":"","matchedName":"","quantity":1,"unit":"","unitPrice":0,"totalPrice":0,"bonusScheme":"","discountPercent":0,"expiryDate":"","isUncertain":false,"uncertaintyReason":"","notes":""}],"summary":"","extractedText":""}

For EVERY recognizable item line, extract itemName, quantity, unit, unitPrice, totalPrice, bonusScheme, discountPercent, expiryDate and uncertainty information when applicable. Inspect table columns and row alignment visually. The numeric value under the price/سعر column is the unit price; the numeric value under value/القيمة is the line total. Do not confuse medicine strength with price. Preserve decimal prices and convert Arabic-Indic digits to normal numbers. If a visible price is uncertain, give the best read and set isUncertain=true. Never drop an item because one field is unreadable. If a price truly is not visible, use 0 rather than inventing it.

The supplied images are the source of truth. Existing OCR text/table data are supplementary and may have lost layout. Use them only for cross-checking. Inspect all supplied pages/images. Return valid JSON only, with no markdown fences.
Document metadata: ${JSON.stringify({ documentType: payload?.documentType, extractionMode: payload?.extractionMode, fileName: payload?.fileName, knownMedicines, knownSuppliers })}.`;
  parts.push({ text: prompt });
  if (payload?.fileText) parts.push({ text: `Existing extracted text for cross-checking:\n${String(payload.fileText).slice(0, 80000)}` });
  if (Array.isArray(payload?.tableData) && payload.tableData.length > 0) parts.push({ text: `Existing table data for cross-checking:\n${JSON.stringify(payload.tableData).slice(0, 80000)}` });
  for (const image of images) parts.push({ inline_data: { mime_type: image.mimeType, data: image.base64 } });

  const requestBody = JSON.stringify({
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
  });

  let lastError = 'Gemini request failed';
  for (let attempt = 0; attempt <= GEMINI_MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEMINI_REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: requestBody,
        signal: controller.signal,
      });
    } catch (error) {
      lastError = error instanceof Error && error.name === 'AbortError'
        ? 'انتهت مهلة الاتصال بخدمة Gemini أثناء تحليل المستند.'
        : error instanceof Error ? error.message : String(error);
      if (attempt >= GEMINI_MAX_RETRIES) break;
      await new Promise(resolve => setTimeout(resolve, GEMINI_RETRY_DELAYS_MS[attempt] ?? 3500));
      continue;
    } finally {
      clearTimeout(timeout);
    }

    let data: any;
    try { data = await response.json(); } catch { data = null; }

    if (response.ok) {
      const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => typeof p?.text === 'string' ? p.text : '').join('') || '';
      if (!text.trim()) {
        const reason = data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason || 'NO_TEXT';
        throw new Error(`Gemini لم يُرجع نتيجة منظمة (${reason}).`);
      }
      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        try { parsed = JSON.parse(cleaned); }
        catch {
          const start = cleaned.indexOf('{');
          const end = cleaned.lastIndexOf('}');
          if (start >= 0 && end > start) parsed = JSON.parse(cleaned.slice(start, end + 1));
          else throw new Error('Gemini returned an invalid JSON extraction result');
        }
      }
      if (!parsed || typeof parsed !== 'object') throw new Error('Gemini returned an invalid extraction result');
      if (!Array.isArray(parsed.items)) parsed.items = [];
      parsed.items = parsed.items.map(normalizeExtractedItem).filter((item: any) => item.itemName || item.rawText || item.matchedName);
      parsed.partyName = String(parsed.partyName || parsed.supplierName || parsed.vendorName || '').trim();
      parsed.documentNumber = String(parsed.documentNumber || parsed.invoiceNumber || '').trim();
      parsed.documentDate = String(parsed.documentDate || parsed.invoiceDate || '').trim();
      parsed.detectedType = String(parsed.detectedType || payload?.documentType || '').trim();
      parsed.totalAmount = Math.max(0, toNumber(parsed.totalAmount || parsed.total || parsed.grandTotal));
      if (!parsed.totalAmount) parsed.totalAmount = parsed.items.reduce((sum: number, item: any) => sum + (item.totalPrice || item.unitPrice * item.quantity), 0);
      parsed.summary = String(parsed.summary || '').trim();
      parsed.extractedText = String(parsed.extractedText || payload?.fileText || '').trim();
      return parsed;
    }

    const upstreamMessage = data?.error?.message || '';
    if (response.status === 429) {
      throw new Error(`Gemini رفض الطلب بسبب حد الاستخدام أو الحصة (HTTP 429). ${upstreamMessage}`.trim());
    }
    lastError = upstreamMessage || `Gemini request failed (${response.status})`;
    if (!isRetryableGeminiStatus(response.status) || attempt >= GEMINI_MAX_RETRIES) break;
    await new Promise(resolve => setTimeout(resolve, GEMINI_RETRY_DELAYS_MS[attempt] ?? 3500));
  }
  throw new Error(lastError);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const preflight = cors(request);
    if (preflight) return preflight;
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/api/health') return json({ ok: true, service: 'document-ai-api', model: GEMINI_MODEL });
    if (request.method !== 'POST' || !url.pathname.startsWith('/api/parse-')) return json({ error: 'Not found' }, 404);
    if (!env.GEMINI_API_KEY) return json({ success: false, error: 'GEMINI_API_KEY is not configured' }, 500);
    try {
      const payload = await request.json();
      const data = await callGemini(env, payload);
      return json({ success: true, data, fallbackUsed: false });
    } catch (error) {
      return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 502);
    }
  },
};
