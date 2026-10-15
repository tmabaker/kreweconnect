'use strict';
const { app } = require('@azure/functions');
const { route, ok, created, readJson, HttpError } = require('../lib/http');
const workflow = require('../lib/workflow');
const people = require('../lib/people');
const model = require('../lib/model');
const notify = require('../lib/notify');
const config = require('../lib/config');
const { getStore } = require('../lib/store');
const data = require('../lib/profile');

function summarize(r) {
  const s = model.stageDef(r.type, r.stage) || {};
  return {
    id: r.id, type: r.type, personId: r.personId, stage: r.stage, stageLabel: s.label || r.stage, owner: s.owner || null, step: s.step || 0, terminal: model.isTerminal(r.stage),
    storeId: r.storeId, department: r.department, title: r.title, managerUpn: r.managerUpn, managerName: r.managerName,
    createdAt: r.createdAt, createdBy: r.createdBy, createdByName: r.createdByName, updatedAt: r.updatedAt, priority: r.priority,
    startDate: r.hire ? r.hire.startDate : '', lastDay: r.termination ? r.termination.lastDay : '', effectiveDate: r.change ? r.change.effectiveDate : '',
    involuntary: r.termination ? r.termination.involuntary : false, isRehire: !!r.isRehire, confidential: !!r.confidential
  };
}

async function withPeople(rows) {
  const all = await people.list();
  const byId = Object.fromEntries(all.map(p => [p.id, p]));
  return rows.map(r => Object.assign(summarize(r), { personName: byId[r.personId] ? people.fullName(byId[r.personId]) : '(unknown)', personStatus: byId[r.personId] ? byId[r.personId].status : '' }));
}

app.http('requests-list', { methods: ['GET'], authLevel: 'anonymous', route: 'requests', handler: route(async (request, context, caller) => {
  const type = request.query.get('type') || '';
  const stage = request.query.get('stage') || '';
  const state = request.query.get('state') || 'open';
  const scope = request.query.get('scope') || 'all';
  const storeId = request.query.get('storeId') || '';
  let rows = (await workflow.listAll()).filter(r => workflow.visibleTo(r, caller));
  if (type) rows = rows.filter(r => r.type === type);
  if (stage) rows = rows.filter(r => r.stage === stage);
  if (state === 'open') rows = rows.filter(r => !model.isTerminal(r.stage));
  if (state === 'closed') rows = rows.filter(r => model.isTerminal(r.stage));
  if (storeId) rows = rows.filter(r => r.storeId === storeId);
  if (scope === 'mine') rows = rows.filter(r => r.createdBy === caller.upn || r.managerUpn === caller.upn);
  if (scope === 'queue') rows = rows.filter(r => { const s = model.stageDef(r.type, r.stage); return s && s.owner && caller.can(s.owner) && (s.owner !== 'manager' || caller.role !== 'hr' || r.managerUpn === caller.upn || r.createdBy === caller.upn); });
  rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return ok({ count: rows.length, value: await withPeople(rows) });
}) });

app.http('dashboard', { methods: ['GET'], authLevel: 'anonymous', route: 'dashboard', handler: route(async (request, context, caller) => {
  const rows = (await workflow.listAll()).filter(r => workflow.visibleTo(r, caller));
  const open = rows.filter(r => !model.isTerminal(r.stage));
  const queue = open.filter(r => { const s = model.stageDef(r.type, r.stage); return s && s.owner && caller.can(s.owner) && (s.owner !== 'manager' || caller.role !== 'hr' || r.managerUpn === caller.upn || r.createdBy === caller.upn); });
  const mine = open.filter(r => r.createdBy === caller.upn || r.managerUpn === caller.upn);
  const soon = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const startingSoon = open.filter(r => r.type === 'hire' && r.hire.startDate && r.hire.startDate <= soon && r.hire.startDate >= today);
  const late = open.filter(r => (r.type === 'hire' && r.hire.startDate && r.hire.startDate < today && !['started', 'closed'].includes(r.stage)) || (r.type === 'termination' && r.termination.lastDay < today && !['it_complete', 'closed'].includes(r.stage)));
  const counts = { open: open.length, hire: open.filter(r => r.type === 'hire').length, change: open.filter(r => r.type === 'change').length, termination: open.filter(r => r.type === 'termination').length, queue: queue.length, mine: mine.length, late: late.length, startingSoon: startingSoon.length };
  const sortByUpdated = (a, b) => b.updatedAt.localeCompare(a.updatedAt);
  return ok({ counts, queue: await withPeople(queue.sort(sortByUpdated).slice(0, 50)), mine: await withPeople(mine.sort(sortByUpdated).slice(0, 50)), startingSoon: await withPeople(startingSoon), late: await withPeople(late), recent: await withPeople(rows.sort(sortByUpdated).slice(0, 15)) });
}) });

app.http('requests-create', { methods: ['POST'], authLevel: 'anonymous', route: 'requests', handler: route(async (request, context, caller) => {
  const body = await readJson(request);
  const type = body.type;
  if (body.storeId && !caller.inScope(body.storeId)) throw new HttpError(403, 'You are not assigned to that store.');
  let r;
  if (type === 'hire') r = await workflow.createHire(body, caller);
  else if (type === 'change') r = await workflow.createChange(body, caller);
  else if (type === 'termination') r = await workflow.createTermination(body, caller);
  else throw new HttpError(400, 'type must be hire, change or termination.');
  if (!caller.inScope(r.storeId) && r.createdBy !== caller.upn) throw new HttpError(403, 'Out of scope.');
  const person = await people.get(r.personId);
  let notification = null;
  if (type !== 'hire') notification = await notify.send(r, 'created', person, caller, context);
  return created({ request: workflow.redact(r, caller), notification });
}, { roles: ['manager'] }) });

async function loadVisible(id, caller) {
  const r = await workflow.get(id);
  if (!r || !workflow.visibleTo(r, caller)) throw new HttpError(404, 'Request not found.');
  return r;
}

app.http('requests-get', { methods: ['GET'], authLevel: 'anonymous', route: 'requests/{id}', handler: route(async (request, context, caller) => {
  const r = await loadVisible(request.params.id, caller);
  const person = await people.get(r.personId);
  const evs = await workflow.events(r.id);
  const def = model.stageDef(r.type, r.stage) || {};
  const tt = config.techtoolsBase;
  const pages = data.techtools || {};
  const links = {};
  if (r.type === 'hire' && person) {
    const c = r.hire.checklist || {};
    const q = new URLSearchParams({ first: person.firstName, last: person.lastName, company: (people.storeById(r.storeId) || {}).name || '', dept: r.department, title: r.title, mobile: person.mobile || '', manager: r.managerUpn || '', start: r.hire.startDate || '', endpoint: c.endpointName || '', employeeId: r.hire.employeeNumber || person.employeeNumber || '', personalEmail: person.personalEmail || '', ref: r.id });
    if (pages.addUser) links.addUser = `${tt}/${pages.addUser}?${q.toString()}`;
  }
  if (r.type === 'change' && person && pages.modifyUser) links.modifyUser = `${tt}/${pages.modifyUser}?${new URLSearchParams({ upn: person.workEmail || '', ref: r.id }).toString()}`;
  if (r.type === 'termination' && person && pages.removeUser) links.removeUser = `${tt}/${pages.removeUser}?${new URLSearchParams({ upn: person.workEmail || '', ref: r.id }).toString()}`;
  return ok({ request: workflow.redact(r, caller), person: people.redact(person, caller), events: evs.filter(e => !e.hrOnly || caller.can('hr')), stage: { label: def.label, owner: def.owner, help: def.help || '', step: def.step }, actions: workflow.allowedActions(r, caller), links, canComment: true });
}) });

app.http('requests-action', { methods: ['POST'], authLevel: 'anonymous', route: 'requests/{id}/actions/{action}', handler: route(async (request, context, caller) => {
  const r = await loadVisible(request.params.id, caller);
  const body = await readJson(request);
  const result = await workflow.applyAction(r, request.params.action, body, caller);
  const notification = await notify.send(result.request, request.params.action, result.person, caller, context);
  return ok({ request: workflow.redact(result.request, caller), person: people.redact(result.person, caller), event: result.event, notification, actions: workflow.allowedActions(result.request, caller) });
}) });

app.http('requests-comment', { methods: ['POST'], authLevel: 'anonymous', route: 'requests/{id}/comments', handler: route(async (request, context, caller) => {
  const r = await loadVisible(request.params.id, caller);
  const body = await readJson(request);
  const text = String(body.text || '').trim();
  if (!text) throw new HttpError(400, 'Comment text is required.');
  const hrOnly = !!body.hrOnly && caller.can('hr');
  const ev = await workflow.addEvent(r, caller, 'comment', text, { hrOnly });
  r.updatedAt = new Date().toISOString(); await workflow.save(r);
  return created({ event: ev });
}) });

// Attachments: JSON { name, contentType, dataBase64 }. Stored privately in blob storage, streamed back only to users who can see the request.
app.http('requests-attach', { methods: ['POST'], authLevel: 'anonymous', route: 'requests/{id}/attachments', handler: route(async (request, context, caller) => {
  const r = await loadVisible(request.params.id, caller);
  const body = await readJson(request);
  const name = String(body.name || '').replace(/[^A-Za-z0-9._ ()-]/g, '_').slice(0, 120);
  if (!name || !body.dataBase64) throw new HttpError(400, 'name and dataBase64 are required.');
  const buf = Buffer.from(body.dataBase64, 'base64');
  if (!buf.length || buf.length > config.maxAttachmentBytes) throw new HttpError(413, `Attachment must be between 1 byte and ${Math.round(config.maxAttachmentBytes / 1048576)} MB.`);
  const blobName = `${r.id}/${Date.now()}-${name}`;
  await getStore().putBlob(blobName, buf, body.contentType || 'application/octet-stream');
  const att = { id: blobName, name, contentType: body.contentType || 'application/octet-stream', size: buf.length, uploadedBy: caller.upn, uploadedAt: new Date().toISOString(), hrOnly: !!body.hrOnly && caller.can('hr') };
  r.attachments = (r.attachments || []).concat(att);
  await workflow.save(r);
  await workflow.addEvent(r, caller, 'attachment', `Attached ${name}`, { hrOnly: att.hrOnly });
  return created({ attachment: att });
}) });

app.http('requests-attachment-get', { methods: ['GET', 'DELETE'], authLevel: 'anonymous', route: 'requests/{id}/attachments/{index}', handler: route(async (request, context, caller) => {
  const r = await loadVisible(request.params.id, caller);
  const idx = parseInt(request.params.index, 10);
  const att = (r.attachments || [])[idx];
  if (!att || (att.hrOnly && !caller.can('hr'))) throw new HttpError(404, 'Attachment not found.');
  if (request.method === 'DELETE') {
    if (!(caller.can('hr') || att.uploadedBy === caller.upn)) throw new HttpError(403, 'Only HR or the uploader can remove an attachment.');
    await getStore().deleteBlob(att.id);
    r.attachments.splice(idx, 1); await workflow.save(r);
    await workflow.addEvent(r, caller, 'attachment_removed', `Removed ${att.name}`);
    return ok({ removed: true });
  }
  const blob = await getStore().getBlob(att.id);
  if (!blob) throw new HttpError(404, 'Attachment content missing.');
  return { status: 200, body: blob.data, headers: { 'Content-Type': att.contentType, 'Content-Disposition': `attachment; filename="${att.name}"`, 'Cache-Control': 'no-store' } };
}) });
