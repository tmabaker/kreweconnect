'use strict';
const { app } = require('@azure/functions');
const { route, ok, created, readJson, HttpError } = require('../lib/http');
const people = require('../lib/people');
const workflow = require('../lib/workflow');
const graph = require('../lib/graph');
const model = require('../lib/model');
const directorySync = require('../lib/sync');

// Who may see a person record. A person on a confidential hire is visible only to HR, admins,
// whoever filed it and the hiring manager (and to IT once the hire reaches IT; see workflow.visibleTo).
function scopeFilter(caller, requestsById) {
  return (p) => {
    const party = p.managerUpn === caller.upn || p.createdBy === caller.upn;
    if (p.confidential) {
      if (caller.can('hr') || party) return true;
      const r = requestsById && requestsById[p.confidentialRequestId];
      return !!(r && workflow.visibleTo(r, caller));
    }
    return caller.seesAll() || caller.inScope(p.storeId) || party;
  };
}
async function requestIndex() { return Object.fromEntries((await workflow.listAll()).map(r => [r.id, r])); }

app.http('people-list', { methods: ['GET'], authLevel: 'anonymous', route: 'people', handler: route(async (request, context, caller) => {
  // Existing employees come from the company directory; refresh when the last sync is stale.
  try { await directorySync.sync(false); } catch (e) { context.warn && context.warn('directory sync failed: ' + e.message); }
  const q = String(request.query.get('q') || '').trim().toLowerCase();
  const status = String(request.query.get('status') || '');
  const storeId = String(request.query.get('storeId') || '');
  let rows = (await people.list()).filter(scopeFilter(caller, await requestIndex()));
  if (q) rows = rows.filter(p => (p.search || '').includes(q));
  if (status) rows = rows.filter(p => p.status === status);
  if (storeId) rows = rows.filter(p => p.storeId === storeId);
  rows.sort((a, b) => (a.lastName + a.firstName).localeCompare(b.lastName + b.firstName));
  return ok({ count: rows.length, value: rows.map(p => people.redact(p, caller)) });
}) });

app.http('people-duplicates', { methods: ['POST'], authLevel: 'anonymous', route: 'people/duplicates', handler: route(async (request, context, caller) => {
  const probe = await readJson(request);
  const hits = await people.findDuplicates(probe);
  const canSee = scopeFilter(caller, await requestIndex());
  return ok({ value: hits.map(h => {
    // A match on a confidential record the caller cannot see is reported without revealing who it is.
    if (!canSee(h.person)) return { reasons: h.reasons, person: null, confidential: true, rehireWarning: 'A confidential record matches. HR will review before this hire moves forward.' };
    return { reasons: h.reasons, person: people.redact(h.person, caller), rehireWarning: h.person.status === 'terminated' && h.person.rehireEligible === 'no' ? 'HR marked this person as not eligible for rehire.' : (h.person.status === 'not_approved' ? 'This person was previously not approved for hire.' : '') };
  }) });
}, { roles: ['manager'] }) });

app.http('people-sync', { methods: ['GET', 'POST'], authLevel: 'anonymous', route: 'people/sync', handler: route(async (request) => {
  if (request.method === 'GET') return ok({ connected: graph.configured(), last: await directorySync.lastRun() });
  return ok(await directorySync.sync(true));
}, { roles: ['hr'] }) });

// Bring an existing employee (never processed through the portal) into the registry from the client directory.
app.http('people-import', { methods: ['POST'], authLevel: 'anonymous', route: 'people/import', handler: route(async (request, context, caller) => {
  const body = await readJson(request);
  const upn = String(body.upn || '').trim().toLowerCase();
  if (!upn) throw new HttpError(400, 'upn is required.');
  const existing = (await people.list()).find(p => p.workEmail === upn);
  if (existing) return ok({ person: people.redact(existing, caller), existed: true });
  let u = null;
  if (graph.configured()) u = await graph.userByUpn(upn);
  if (!u && !body.firstName) throw new HttpError(404, 'That person was not found in the company directory. Enter their details manually.');
  const display = u ? u.displayName : `${body.firstName} ${body.lastName}`;
  const parts = display.split(' ');
  const storeMatch = u ? people.storeByName(u.companyName) : people.storeById(body.storeId);
  let managerUpn = '', managerName = '';
  if (u && graph.configured()) { const m = await graph.managerOf(u.upn || upn); if (m) { managerUpn = (m.userPrincipalName || m.mail || '').toLowerCase(); managerName = m.displayName || ''; } }
  const p = await people.create({
    firstName: body.firstName || parts[0], lastName: body.lastName || parts.slice(1).join(' '), workEmail: upn, entraId: u ? u.id : '',
    storeId: storeMatch ? storeMatch.id : (body.storeId || ''), department: u ? u.department : (body.department || ''), title: u ? u.jobTitle : (body.title || ''),
    employeeNumber: u ? u.employeeId : (body.employeeNumber || ''), mobile: u ? u.mobilePhone : (body.mobile || ''), managerUpn, managerName, status: 'active'
  }, caller);
  return created({ person: people.redact(p, caller), existed: false });
}, { roles: ['manager'] }) });

app.http('people-get', { methods: ['GET'], authLevel: 'anonymous', route: 'people/{id}', handler: route(async (request, context, caller) => {
  const p = await people.get(request.params.id);
  if (!p || !scopeFilter(caller, await requestIndex())(p)) throw new HttpError(404, 'Person not found.');
  const all = await workflow.listAll();
  const reqs = all.filter(r => r.personId === p.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(r => ({ id: r.id, type: r.type, stage: r.stage, stageLabel: (model.stageDef(r.type, r.stage) || {}).label, createdAt: r.createdAt, updatedAt: r.updatedAt, storeId: r.storeId, title: r.title, startDate: r.hire && r.hire.startDate, lastDay: r.termination && r.termination.lastDay, effectiveDate: r.change && r.change.effectiveDate }));
  return ok({ person: people.redact(p, caller), requests: reqs, statusLabel: model.PERSON_STATUS[p.status] || p.status });
}) });

app.http('people-update', { methods: ['PATCH'], authLevel: 'anonymous', route: 'people/{id}', handler: route(async (request, context, caller) => {
  const p = await people.get(request.params.id);
  if (!p) throw new HttpError(404, 'Person not found.');
  const body = await readJson(request);
  for (const k of ['firstName', 'lastName', 'preferredName', 'personalEmail', 'employeeNumber', 'workEmail', 'notes', 'department', 'title', 'managerUpn', 'managerName', 'storeId']) if (body[k] !== undefined) p[k] = String(body[k]).trim().slice(0, 200);
  if (body.mobile !== undefined) p.mobile = people.normMobile(body.mobile);
  if (body.rehireEligible !== undefined && ['yes', 'no', 'review', ''].includes(body.rehireEligible)) p.rehireEligible = body.rehireEligible;
  if (body.rehireNotes !== undefined) p.rehireNotes = String(body.rehireNotes).slice(0, 2000);
  if (body.status !== undefined && model.PERSON_STATUS[body.status]) p.status = body.status;
  await people.save(p);
  return ok({ person: p });
}, { roles: ['hr'] }) });
