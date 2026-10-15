'use strict';
// Small helpers shared by every HTTP function.
class HttpError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details; }
}
const json = (status, body, headers) => ({ status, jsonBody: body, headers: Object.assign({ 'Cache-Control': 'no-store' }, headers || {}) });
const ok = (body) => json(200, body);
const created = (body) => json(201, body);

async function readJson(request) {
  const text = await request.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch (e) { throw new HttpError(400, 'Body must be valid JSON.'); }
}

// Wrap a handler: auth resolution, error mapping, consistent logging.
function route(handler, options) {
  const opts = options || {};
  return async (request, context) => {
    try {
      const { resolveCaller } = require('./access');
      let caller = null;
      if (!opts.anonymous) {
        caller = await resolveCaller(request);
        if (!caller) throw new HttpError(401, 'Sign in required.');
        if (!caller.role) throw new HttpError(403, 'Your account is signed in but has not been granted access to this portal. Ask HR or IT to add you.');
        if (opts.roles && !caller.can(opts.roles)) throw new HttpError(403, 'Your role does not allow this action.');
      }
      return await handler(request, context, caller);
    } catch (err) {
      if (err instanceof HttpError) {
        return json(err.status, { error: err.message, details: err.details });
      }
      context.error('Unhandled error', err);
      return json(500, { error: 'Unexpected server error.', message: err && err.message });
    }
  };
}
module.exports = { HttpError, json, ok, created, readJson, route };
