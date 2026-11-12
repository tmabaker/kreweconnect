'use strict';
// Service routes called by NOIT systems rather than a signed-in person. SWA lets /api/service/* through
// without a portal sign in, so every call here must present PORTAL_SERVICE_KEY. With no key set the
// route answers 503 and nothing is written.
const crypto = require('crypto');
const { app } = require('@azure/functions');
const { route, ok, readJson, HttpError } = require('../lib/http');
const workflow = require('../lib/workflow');
const config = require('../lib/config');

function requireServiceKey(request) {
  if (!config.serviceKey) throw new HttpError(503, 'PORTAL_SERVICE_KEY is not set on this portal.');
  const given = Buffer.from(String(request.headers.get('x-kreweworks-service-key') || ''));
  const want = Buffer.from(config.serviceKey);
  // 403, not 401: the portal's SWA rules turn a 401 into a sign-in redirect, which a caller could mistake for success.
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) throw new HttpError(403, 'Service key required.');
}

// POST /api/service/requests/{id}/techtools  { actor: { upn, name }, items: [{ text, ok }], itChecks: [key], note }
app.http('service-techtools-update', { methods: ['POST'], authLevel: 'anonymous', route: 'service/requests/{id}/techtools', handler: route(async (request) => {
  requireServiceKey(request);
  const r = await workflow.get(request.params.id);
  if (!r) throw new HttpError(404, 'Request not found.');
  const result = await workflow.recordTechTools(r, await readJson(request));
  return ok({ id: r.id, stage: result.request.stage, checksSet: result.checksSet, eventId: result.event.id });
}, { anonymous: true }) });
