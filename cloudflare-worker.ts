export interface Env {
  GEMINI_API_KEY: string;
}

const GEMINI_MODEL = 'gemini-3.6-flash';
const GEMINI_MAX_RETRIES = 3;
const GEMINI_RETRY_DELAYS_MS = [1500, 3500, 7000];

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
        'access-control-allow-headers': 'Content-Type, Accept',
      },
    });
  }
}

function isRetryableGeminiStatus(status: number) {
  return status === 408 || status === 409 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

async function callGemini(env: Env, payload: any) {
  const parts: any[] = [];
  const prompt = `You are a high-accuracy document OCR and pharmacy document extraction engine. Read Arabic and English text exactly, including handwritten text, numbers, dates, prices, quantities, medicine names, strengths and tables. Do not invent unreadable text. Return JSON only with this shape: {"items":[{"rawText":"","matchedName":"","quantity":1,"unit":"","isUncertain":false,"notes":""}],"summary":"","extractedText":""}. Preserve uncertain values and mark them isUncertain=true. Document metadata: ${JSON.stringify({ documentType: payload.documentType, extractionMode: payload.extractionMode, fileName: payload.fileName, knownMedicines: payload.knownMedicines || [], knownSuppliers: payload.knownSuppliers || [] })}.`;
  parts.push({ text: prompt });
  if (payload.fileText) parts.push({ text: `Existing extracted text:\n${payload.fileText}` });
  if (payload.tableData) parts.push({ text: `Existing table data:\n${JSON.stringify(payload.tableData)}` });

  const images = Array.isArray(payload.images) ? payload.images : [];
  for (const image of images.slice(0, 20)) {
    const base64 = typeof image === 'string' ? image : image?.base64;
    if (!base64) continue;
    const mimeType = typeof image === 'string' ? 'image/jpeg' : (image?.mimeType || 'image/jpeg');
    parts.push({
      inline_data: {
        mime_type: mimeType,
        data: base64.replace(/^data:[^;]+;base64,/, ''),
      },
    });
  }

  const requestBody = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
    },
  };

  let lastError = 'Gemini request failed';
  for (let attempt = 0; attempt <= GEMINI_MAX_RETRIES; attempt++) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestBody),
      },
    );

    const data: any = await response.json();
    if (response.ok) {
      const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '{}';
      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { items: [], summary: text, extractedText: text };
      }
      return parsed;
    }

    lastError = data?.error?.message || `Gemini request failed with HTTP ${response.status}`;
    if (!isRetryableGeminiStatus(response.status) || attempt >= GEMINI_MAX_RETRIES) break;

    const delay = GEMINI_RETRY_DELAYS_MS[attempt] ?? 7000;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  throw new Error(lastError);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const preflight = cors(request);
    if (preflight) return preflight;

    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/api/health') {
      return json({ ok: true, service: 'document-ai-api', model: GEMINI_MODEL });
    }

    if (request.method !== 'POST' || !url.pathname.startsWith('/api/parse-')) {
      return json({ error: 'Not found' }, 404);
    }

    if (!env.GEMINI_API_KEY) {
      return json({ success: false, error: 'GEMINI_API_KEY is not configured' }, 500);
    }

    try {
      const payload = await request.json();
      const data = await callGemini(env, payload);
      return json({ success: true, data, fallbackUsed: false });
    } catch (error) {
      return json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }, 502);
    }
  },
};
