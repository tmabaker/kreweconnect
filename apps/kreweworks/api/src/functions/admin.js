'use strict';
// directory lookups, access management, CSV export
const { app } = require('@azure/functions');
const { route, ok, readJson, HttpError } = require('../lib/http');
const access = require('../lib/access');
const graph = require('../lib/graph');
const people = require('../lib/people');
const workflow = require('../lib/workflow');
const model = require('../lib/model');
const data = require('../lib/profile');

app.http('directory-search', { methods: ['GET'], authLevel: 'anonymous', route: 'directory/users', handler: route(async (request) => {
  if (!graph.configured()) return ok({ available: false, value: [] });
  const q = request.query.get('q') || '';
  const limit = Math.min(200, parseInt(request.query.get('limit') || '25', 10) || 25);
  const value = await graph.searchUsers(q, limit);
  return ok({ available: true, value: value.map(u => ({ id: u.id, displayName: u.displayName, upn: u.upn, mail: u.mail, jobTitle: u.jobTitle, department: u.department, companyName: u.companyName, storeId: (people.storeByName(u.companyName) || {}).id || '' })) });
}) });

app.http('directory-user', { methods: ['GET'], authLevel: 'anonymous', route: 'directory/users/{upn}', handler: route(async (request) => {
  if (!graph.configured()) throw new HttpError(503, 'Directory lookup is not configured.');
  const u = await graph.userByUpn(request.params.upn);
  if (!u) throw new HttpError(404, 'Not found in the company directory.');
  const m = await graph.managerOf(u.upn || request.params.upn);
  return ok({ user: Object.assign({}, u, { storeId: (people.storeByName(u.companyName) || {}).id || '' }), manager: m ? { upn: (m.userPrincipalName || m.mail || '').toLowerCase(), displayName: m.displayName } : null });
}) });

app.http('access-list', { methods: ['GET'], authLevel: 'anonymous', route: 'access', handler: route(async () => ok({ value: await access.listAccess(), roles: access.ROLES, stores: data.stores.map(s => ({ id: s.id, name: s.name })) }), { roles: ['hr', 'it'] }) });

app.http('access-save', { methods: ['PUT'], authLevel: 'anonymous', route: 'access', handler: route(async (request, context, caller) => {
  const body = await readJson(request);
  // HR may grant manager and hr roles; only admins may grant it or admin.
  if (['it', 'admin'].includes(body.role) && !caller.can('admin')) throw new HttpError(403, 'Only an administrator can grant IT or admin access.');
  try { return ok({ entry: await access.saveAccess(body, caller) }); } catch (e) { throw new HttpError(400, e.message); }
}, { roles: ['hr', 'admin'] }) });

app.http('access-remove', { methods: ['DELETE'], authLevel: 'anonymous', route: 'access/{upn}', handler: route(async (request, context, caller) => {
  const target = decodeURIComponent(request.params.upn).toLowerCase();
  const entry = await access.lookup(target);
  if (entry && ['it', 'admin'].includes(entry.role) && !caller.can('admin')) throw new HttpError(403, 'Only an administrator can remove IT or admin access.');
  if (target === caller.upn) throw new HttpError(400, 'You cannot remove your own access.');
  await access.removeAccess(target);
  return ok({ removed: target });
}, { roles: ['hr', 'admin'] }) });

function csv(rows, columns) {
  const q = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [columns.join(',')].concat(rows.map(r => columns.map(c => q(r[c])).join(','))).join('\r\n');
}

app.http('export-people', { methods: ['GET'], authLevel: 'anonymous', route: 'export/people.csv', handler: route(async () => {
  const rows = (await people.list()).sort((a, b) => (a.lastName + a.firstName).localeCompare(b.lastName + b.firstName)).map(p => Object.assign({}, p, {
    statusLabel: model.PERSON_STATUS[p.status] || p.status, store: (people.storeById(p.storeId) || {}).name || ''
  }));
  const body = csv(rows, ['id', 'firstName', 'lastName', 'preferredName', 'status', 'statusLabel', 'store', 'department', 'title', 'managerName', 'managerUpn', 'employeeNumber', 'workEmail', 'personalEmail', 'mobile', 'hireDate', 'lastDay', 'terminationType', 'rehireEligible', 'createdAt', 'updatedAt']);
  return { status: 200, body, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${data.client.slug}-people.csv"` } };
}, { roles: ['hr'] }) });

app.http('export-requests', { methods: ['GET'], authLevel: 'anonymous', route: 'export/requests.csv', handler: route(async () => {
  const ppl = Object.fromEntries((await people.list()).map(p => [p.id, p]));
  const rows = (await workflow.listAll()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(r => ({
    id: r.id, type: r.type, person: ppl[r.personId] ? people.fullName(ppl[r.personId]) : '', stage: r.stage, stageLabel: (model.stageDef(r.type, r.stage) || {}).label || '', store: (people.storeById(r.storeId) || {}).name || '', department: r.department, title: r.title, manager: r.managerName || r.managerUpn,
    startDate: r.hire ? r.hire.startDate : '', employeeNumber: r.hire ? r.hire.employeeNumber : (ppl[r.personId] || {}).employeeNumber || '', lastDay: r.termination ? r.termination.lastDay : '', effectiveDate: r.change ? r.change.effectiveDate : '', createdAt: r.createdAt, createdBy: r.createdBy, updatedAt: r.updatedAt, priority: r.priority
  }));
  return { status: 200, body: csv(rows, ['id', 'type', 'person', 'stage', 'stageLabel', 'store', 'department', 'title', 'manager', 'startDate', 'employeeNumber', 'lastDay', 'effectiveDate', 'priority', 'createdAt', 'createdBy', 'updatedAt']), headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${data.client.slug}-requests.csv"` } };
}, { roles: ['hr'] }) });
