'use strict';
// Service routes called by NOIT systems rather than a signed-in person. SWA lets /api/service/* through
// without a portal sign in, so every call here must present PORTAL_SERVICE_KEY. With no key set the
// route answers 503 and nothing is written.
const crypto = require('crypto');
const { app } = require('@azure/functions');
const { route, ok, readJson, HttpError } = require('../lib/http');
const workflow = require('../lib/workflow');
const config = require('../lib/config');
const people = require('../lib/people');

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

// The read side, for the NOIT fulfillment orchestrator: one request by its id, as IT may see it. HR-only
// fields (pay, screening notes, termination reasons) are removed by workflow.redact with a non-HR caller,
// and the packet's protected values stay masked. Nothing is written.
const SERVICE_CALLER = Object.freeze({ upn: 'service:techtools', name: 'NOIT Tech Tools (service)', role: 'it', can: () => false });
const PERSON_FIELDS = ['id', 'firstName', 'lastName', 'preferredName', 'displayName', 'workEmail', 'upn', 'storeId', 'title', 'department', 'managerUpn', 'status', 'extension'];

// GET /api/service/requests/{id}
app.http('service-request-read', { methods: ['GET'], authLevel: 'anonymous', route: 'service/requests/{id}', handler: route(async (request) => {
  requireServiceKey(request);
  const r = await workflow.get(request.params.id);
  if (!r) throw new HttpError(404, 'Request not found.');
  const p = r.personId ? await people.get(r.personId) : null;
  const person = p ? Object.fromEntries(PERSON_FIELDS.filter(k => p[k] !== undefined).map(k => [k, p[k]])) : null;
  const events = (await workflow.events(r.id)).map(e => ({ id: e.id, at: e.at, action: e.action, by: e.byName || e.by, note: e.note }));
  return ok({ request: workflow.redact(r, SERVICE_CALLER), person, events });
}, { anonymous: true }) });
