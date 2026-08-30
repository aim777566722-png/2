type Env = {
  GEMINI_API_KEY: string;
};

type PagesFunction<E = Env> = (context: { request: Request; env: E }) => Response | Promise<Response>;

export const onRequestPost: PagesFunction = async ({ request, env }) => {
  try {
    if (!env.GEMINI_API_KEY) {
      return Response.json({ error: 'GEMINI_API_KEY is not configured' }, { status: 500 });
    }

    const contentType = request.headers.get('content-type') || '';
    let body: unknown;
    if (contentType.includes('application/json')) body = await request.json();
    else body = { text: await request.text() };

    const prompt = `Extract the document content accurately. Preserve Arabic and English text, numbers, dates, tables and names. Return clean structured JSON when possible. Input:\n${JSON.stringify(body)}`;

    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + encodeURIComponent(env.GEMINI_API_KEY),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      },
    );

    const data = await response.json();
    if (!response.ok) {
      return Response.json({ error: 'Gemini request failed', details: data }, { status: 502 });
    }

    const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') || '';
    return Response.json({ text, raw: data });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
};
