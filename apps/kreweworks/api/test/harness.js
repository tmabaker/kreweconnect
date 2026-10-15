'use strict';
// Captures app.http registrations and dispatches requests to them, mimicking the Functions host.
function collect(app, load) {
  const registered = [];
  const original = app.http;
  app.http = (name, opts) => registered.push({ name, route: opts.route, methods: opts.methods, handler: opts.handler });
  try { load(); } finally { app.http = original; }

  function match(method, pathname) {
    const rel = pathname.replace(/^\/api\/?/, '');
    for (const r of registered) {
      if (!r.methods.includes(method)) continue;
      const parts = r.route.split('/'); const segs = rel.split('/');
      if (parts.length !== segs.length) continue;
      const params = {}; let okMatch = true;
      for (let i = 0; i < parts.length; i++) {
        if (parts[i].startsWith('{')) params[parts[i].slice(1, -1)] = decodeURIComponent(segs[i]);
        else if (parts[i] !== segs[i]) { okMatch = false; break; }
      }
      if (okMatch) return { route: r, params };
    }
    return null;
  }

  async function dispatch(method, url, body, headers) {
    const m = match(method, url.pathname);
    if (!m) return { status: 404, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'no route' }) };
    const h = new Map(Object.entries(headers || {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
    const request = {
      method, url: url.toString(), params: m.params,
      query: url.searchParams,
      headers: { get: (k) => h.get(k.toLowerCase()) || null },
      text: async () => (body ? body.toString('utf8') : ''),
      json: async () => JSON.parse(body.toString('utf8'))
    };
    const context = { log: () => {}, warn: () => {}, error: (...a) => console.error(...a) };
    const result = await m.route.handler(request, context);
    const out = { status: result.status || 200, headers: Object.assign({}, result.headers || {}) };
    if (result.jsonBody !== undefined) { out.headers['Content-Type'] = 'application/json'; out.body = JSON.stringify(result.jsonBody); }
    else out.body = result.body;
    return out;
  }
  return { registered, dispatch, match };
}
module.exports = { collect };
