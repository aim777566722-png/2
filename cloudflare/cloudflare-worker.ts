export interface Env {
  GEMINI_API_KEY: string;
}

const GEMINI_MODEL = 'gemini-3.6-flash';
const MAX_REFERENCE_ITEMS = 500;
const MAX_REFERENCE_CHARS = 24000;
const MAX_IMAGE_BASE64_CHARS = 12_000_000;

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

async function callGemini(env: Env, payload: any) {
  const parts: any[] = [];
  const images = collectImages(payload);
  const knownMedicines = limitReferenceList(payload?.knownMedicines);
  const knownSuppliers = limitReferenceList(payload?.knownSuppliers);
  const prompt = `You are a high-accuracy document OCR and pharmacy document extraction engine. Read Arabic and English text exactly from the supplied document, including printed and handwritten text, numbers, dates, prices, quantities, medicine names, strengths and tables. The supplied images are the primary source of truth; inspect them directly. Do not invent unreadable text. Return JSON only with this exact shape: {"items":[{"itemName":"","rawText":"","matchedName":"","quantity":1,"unit":"","isUncertain":false,"notes":""}],"summary":"","extractedText":""}. Use itemName as the primary medicine/item name. Every recognizable medicine/item line must be included in items. Preserve uncertain values and mark them isUncertain=true. If the image contains text but a field is unreadable, keep the item and leave only that field uncertain/empty rather than dropping the item. Document metadata: ${JSON.stringify({ documentType: payload?.documentType, extractionMode: payload?.extractionMode, fileName: payload?.fileName, knownMedicines, knownSuppliers })}.`;
  parts.push({ text: prompt });
  if (payload?.fileText) parts.push({ text: `Existing extracted text:\n${String(payload.fileText).slice(0, 50000)}` });
  if (Array.isArray(payload?.tableData) && payload.tableData.length > 0) {
    parts.push({ text: `Existing table data:\n${JSON.stringify(payload.tableData).slice(0, 50000)}` });
  }

  for (const image of images.slice(0, 12)) {
    parts.push({ inline_data: { mime_type: image.mimeType, data: image.base64 } });
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
    }),
  });

  const data: any = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || `Gemini request failed (${response.status})`);

  const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '{}';
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error('Gemini returned an invalid JSON extraction result');
    }
  }

  if (!parsed || typeof parsed !== 'object') throw new Error('Gemini returned an invalid extraction result');
  if (!Array.isArray(parsed.items)) parsed.items = [];

  parsed.items = parsed.items.map((item: any) => ({
    ...item,
    itemName: String(item?.itemName || item?.matchedName || item?.rawText || '').trim(),
    rawText: String(item?.rawText || item?.itemName || item?.matchedName || '').trim(),
    matchedName: String(item?.matchedName || item?.itemName || item?.rawText || '').trim(),
    quantity: Number.isFinite(Number(item?.quantity)) && Number(item?.quantity) > 0 ? Number(item.quantity) : 1,
    unit: String(item?.unit || '').trim(),
    isUncertain: Boolean(item?.isUncertain),
    notes: String(item?.notes || '').trim(),
  })).filter((item: any) => item.itemName || item.rawText || item.matchedName);

  return parsed;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const preflight = cors(request);
    if (preflight) return preflight;
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/api/health') {
      return json({ ok: true, service: 'document-ai-api', model: GEMINI_MODEL });
    }
    if (request.method !== 'POST' || !url.pathname.startsWith('/api/parse-')) return json({ error: 'Not found' }, 404);
    if (!env.GEMINI_API_KEY) return json({ error: 'GEMINI_API_KEY is not configured' }, 500);

    try {
      const payload = await request.json();
      const data = await callGemini(env, payload);
      return json({ success: true, data, fallbackUsed: false });
    } catch (error) {
      return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 502);
    }
  },
};