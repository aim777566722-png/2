export const onRequestGet: PagesFunction = () =>
  Response.json({ ok: true, service: 'document-ai-api' });
