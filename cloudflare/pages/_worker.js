const UPSTREAM = 'https://document-ai-api.aim777566722.workers.dev';

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'Content-Type'
  };
}

function withCors(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders())) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() });

    const incoming = new URL(request.url);
    if (incoming.pathname === '/api/health') {
      try {
        const response = await fetch(`${UPSTREAM}/api/health`, { method: 'GET' });
        return withCors(response);
      } catch (error) {
        return withCors(new Response(JSON.stringify({ ok: false, error: String(error) }), { status: 502, headers: { 'content-type': 'application/json; charset=UTF-8' } }));
      }
    }

    if (request.method !== 'POST' || !incoming.pathname.startsWith('/api/parse-')) {
      return withCors(new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'content-type': 'application/json; charset=UTF-8' } }));
    }

    try {
      const upstreamUrl = `${UPSTREAM}${incoming.pathname}${incoming.search}`;
      const response = await fetch(upstreamUrl, {
        method: 'POST',
        headers: { 'content-type': request.headers.get('content-type') || 'application/json' },
        body: request.body
      });
      return withCors(response);
    } catch (error) {
      return withCors(new Response(JSON.stringify({ success: false, error: String(error) }), { status: 502, headers: { 'content-type': 'application/json; charset=UTF-8' } }));
    }
  }
};
