'use strict';
// Requests (hire, change, termination): creation, scoping, actions and the resulting person updates.
const { getStore } = require('./store');
const { newId, eventKey } = require('./ids');
const { HttpError } = require('./http');
const model = require('./model');
const people = require('./people');
const data = require('./profile');

const PK = 'requests';
const nowIso = () => new Date().toISOString();

function clean(s, max) { return String(s == null ? '' : s).trim().slice(0, max || 2000); }
function bool(v) { return v === true || v === 'true' || v === 'on' || v === 1; }
function isoDate(v) { const s = clean(v, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; }

async function listAll() { return getStore().list('requests', PK); }
async function get(id) { return getStore().get('requests', PK, id); }
async function save(r) { r.updatedAt = nowIso(); return getStore().upsert('requests', PK, r.id, r); }

async function addEvent(r, actor, action, note, extra) {
  const ev = Object.assign({ id: eventKey(), requestId: r.id, at: nowIso(), by: actor.upn, byName: actor.name, role: actor.role, action, note: clean(note, 4000) }, extra || {});
  await getStore().upsert('events', r.id, ev.id, ev);
  return ev;
}
async function events(requestId) {
  const rows = await getStore().list('events', requestId);
  return rows.sort((a, b) => a.id.localeCompare(b.id));
}

// Stages from which IT works a confidential hire (before them, IT has nothing to do with it).
const IT_STAGES = ['it_queue', 'it_in_progress', 'it_complete', 'started', 'closed'];

function isParty(r, caller) { return r.createdBy === caller.upn || r.managerUpn === caller.upn; }

function visibleTo(r, caller) {
  if (r.confidential) {
    // Confidential hire: HR, admins, the person who filed it and the hiring manager. IT once it reaches IT.
    if (caller.can('hr') || isParty(r, caller)) return true;
    return caller.role === 'it' && IT_STAGES.includes(r.stage);
  }
  if (caller.seesAll()) return true;
  return caller.inScope(r.storeId) || isParty(r, caller);
}

// ---------- checklist (the digital New Hire Checklist, rev 09/26 plus the meeting-guide fields) ----------
function normalizeChecklist(input) {
  const c = input || {};
  const apps = {};
  for (const a of data.applications) apps[a.key] = a.always ? true : bool((c.applications || {})[a.key]);
  const equipment = {};
  for (const e of data.equipment) {
    const row = (c.equipment || {})[e.key] || {};
    equipment[e.key] = { needed: bool(row.needed), atDesk: bool(row.atDesk) };
  }
  return {
    preferredDisplayName: clean(c.preferredDisplayName, 120),
    workArea: clean(c.workArea, 200),
    hardware: ['existing_on_site', 'needs_purchase', 'shared_workstation', 'none'].includes(c.hardware) ? c.hardware : '',
    endpointName: clean(c.endpointName, 15).toUpperCase(),
    extension: clean(c.extension, 10),
    startTime: clean(c.startTime, 10),
    applications: apps,
    otherApplications: clean(c.otherApplications, 500),
    equipment,
    printerAssignment: clean(c.printerAssignment, 200),
    applicationExceptions: clean(c.applicationExceptions, 1000),
    copyAccessFrom: clean(c.copyAccessFrom, 120).toLowerCase(),
    notes: clean(c.notes, 2000),
    completedAt: nowIso()
  };
}
function checklistComplete(c) {
  if (!c) return false;
  if (!c.hardware) return false;
  if ((c.hardware === 'existing_on_site') && !c.endpointName) return false;
  return true;
}

// ---------- creation ----------
async function createHire(input, actor) {
  const storeId = clean(input.storeId, 60);
  if (!people.storeById(storeId)) throw new HttpError(400, 'Choose the store the employee will work at.');
  if (!clean(input.department)) throw new HttpError(400, 'Department is required.');
  if (!clean(input.title)) throw new HttpError(400, 'Job title is required.');
  if (!clean(input.managerUpn)) throw new HttpError(400, 'Direct manager is required.');
  const mobile = people.normMobile(input.mobile);
  if (!mobile) throw new HttpError(400, 'A mobile number is required. Temporary credentials are delivered by text message.');

  let person = input.personId ? await people.get(input.personId) : null;
  if (person && ['active', 'changing', 'hired', 'terminating'].includes(person.status)) {
    throw new HttpError(409, `${people.fullName(person)} is already ${model.PERSON_STATUS[person.status].toLowerCase()}. Use a change request instead.`);
  }
  const isRehire = !!person;
  if (person) {
    // Rehire: keep history, refresh the current details.
    person.previousEmployment = person.previousEmployment || [];
    if (person.status === 'terminated' || person.status === 'not_approved' || person.status === 'withdrawn') {
      person.previousEmployment.push({ status: person.status, storeId: person.storeId, title: person.title, hireDate: person.hireDate, lastDay: person.lastDay, terminationType: person.terminationType, rehireEligible: person.rehireEligible, recordedAt: nowIso() });
    }
    Object.assign(person, {
      firstName: clean(input.firstName, 80) || person.firstName, lastName: clean(input.lastName, 80) || person.lastName,
      preferredName: clean(input.preferredName, 80), personalEmail: clean(input.personalEmail, 120).toLowerCase(), mobile,
      storeId, department: clean(input.department, 80), title: clean(input.title, 80), managerUpn: clean(input.managerUpn, 120).toLowerCase(), managerName: clean(input.managerName, 120),
      status: 'applicant', hireDate: '', lastDay: '', terminationType: ''
    });
    await people.save(person);
  } else {
    person = await people.create({
      firstName: input.firstName, lastName: input.lastName, preferredName: input.preferredName, personalEmail: input.personalEmail, mobile,
      storeId, department: input.department, title: input.title, managerUpn: input.managerUpn, managerName: input.managerName, status: 'applicant'
    }, actor);
  }

  const r = {
    id: newId('H'), type: 'hire', personId: person.id, stage: 'packet_pending',
    storeId, department: clean(input.department, 80), title: clean(input.title, 80),
    managerUpn: clean(input.managerUpn, 120).toLowerCase(), managerName: clean(input.managerName, 120),
    createdAt: nowIso(), createdBy: actor.upn, createdByName: actor.name,
    priority: clean(input.priority, 20) || 'normal',
    targetStartDate: isoDate(input.targetStartDate),
    confidential: data.features.confidentialHires ? bool(input.confidential) : false,
    isRehire,
    hire: {
      packet: { items: {}, sentAt: '', sentBy: '', note: clean(input.packetNote, 1000) },
      screening: { background: 'pending', mvr: 'pending', drug: 'pending', notes: '', updatedAt: '' },
      decision: { outcome: '', by: '', at: '', reason: '' },
      startDate: '', startTime: '', offerAcceptedAt: '', employeeNumber: '',
      checklist: null,
      notice: { sentAt: '', sentBy: '', ticketNote: '' },
      it: { assignedTo: '', upn: '', license: '', endpointName: '', extension: '', credentialDelivered: false, managerCredentialDelivered: false, notes: '', startedAt: '', completedAt: '', completedBy: '' },
      dayOne: {}
    },
    attachments: [], managerNotes: clean(input.notes, 2000)
  };
  for (const item of data.packetItems) r.hire.packet.items[item.key] = bool((input.packetItems || {})[item.key]);
  await save(r);
  person.requestIds = (person.requestIds || []).concat(r.id);
  if (r.confidential) { person.confidential = true; person.confidentialRequestId = r.id; }
  await people.save(person);
  await addEvent(r, actor, 'created', isRehire ? 'Rehire request created from an existing record.' : 'New hire request created.', { toStage: r.stage });
  return r;
}

async function createChange(input, actor) {
  const person = await people.get(clean(input.personId, 40));
  if (!person) throw new HttpError(400, 'Pick the employee first.');
  const types = (Array.isArray(input.changeTypes) ? input.changeTypes : []).filter(t => data.changeTypes.some(c => c.key === t));
  if (!types.length) throw new HttpError(400, 'Choose at least one kind of change.');
  const effectiveDate = isoDate(input.effectiveDate);
  if (!effectiveDate) throw new HttpError(400, 'Effective date is required.');
  const to = input.to || {};
  if (types.includes('transfer') && !people.storeById(to.storeId)) throw new HttpError(400, 'Choose the destination store.');
  const r = {
    id: newId('C'), type: 'change', personId: person.id, stage: 'submitted',
    storeId: person.storeId, department: person.department, title: person.title,
    managerUpn: person.managerUpn || actor.upn, managerName: person.managerName || actor.name,
    createdAt: nowIso(), createdBy: actor.upn, createdByName: actor.name, priority: clean(input.priority, 20) || 'normal',
    change: {
      changeTypes: types, effectiveDate,
      from: { storeId: person.storeId, department: person.department, title: person.title, managerUpn: person.managerUpn, managerName: person.managerName, workEmail: person.workEmail },
      to: {
        storeId: clean(to.storeId, 60), department: clean(to.department, 80), title: clean(to.title, 80),
        managerUpn: clean(to.managerUpn, 120).toLowerCase(), managerName: clean(to.managerName, 120),
        extension: clean(to.extension, 10), endpointName: clean(to.endpointName, 15).toUpperCase(), workArea: clean(to.workArea, 200),
        firstName: clean(to.firstName, 80), lastName: clean(to.lastName, 80), preferredName: clean(to.preferredName, 80)
      },
      accessAdd: clean(input.accessAdd, 1000), accessRemove: clean(input.accessRemove, 1000),
      equipment: clean(input.equipment, 1000), reason: clean(input.reason, 2000),
      it: { assignedTo: '', notes: '', startedAt: '', completedAt: '', completedBy: '' }
    },
    attachments: []
  };
  await save(r);
  person.requestIds = (person.requestIds || []).concat(r.id);
  if (person.status === 'active') person.status = 'changing';
  await people.save(person);
  await addEvent(r, actor, 'created', 'Change request submitted.', { toStage: r.stage });
  return r;
}

async function createTermination(input, actor) {
  const person = await people.get(clean(input.personId, 40));
  if (!person) throw new HttpError(400, 'Pick the employee first.');
  if (person.status === 'terminated') throw new HttpError(409, 'This person is already terminated.');
  const lastDay = isoDate(input.lastDay);
  if (!lastDay) throw new HttpError(400, 'Last day is required.');
  const terminationType = data.terminationTypes.some(t => t.key === input.terminationType) ? input.terminationType : '';
  if (!terminationType) throw new HttpError(400, 'Choose the type of departure.');
  const involuntary = ['termination', 'termination_cause'].includes(terminationType) || bool(input.involuntary);
  const r = {
    id: newId('T'), type: 'termination', personId: person.id, stage: 'submitted',
    storeId: person.storeId, department: person.department, title: person.title,
    managerUpn: person.managerUpn || actor.upn, managerName: person.managerName || actor.name,
    createdAt: nowIso(), createdBy: actor.upn, createdByName: actor.name, priority: involuntary ? 'urgent' : (clean(input.priority, 20) || 'normal'),
    termination: {
      lastDay, accessEndAt: clean(input.accessEndAt, 30) || (involuntary ? 'immediately' : `${lastDay} end of day`),
      terminationType, involuntary,
      rehireEligible: ['yes', 'no', 'review'].includes(input.rehireEligible) ? input.rehireEligible : 'review',
      reasonNotes: clean(input.reasonNotes, 4000),
      equipmentToRecover: clean(input.equipmentToRecover, 1000), deviceEndpointName: clean(input.deviceEndpointName, 15).toUpperCase(),
      mailboxDelegate: clean(input.mailboxDelegate, 120).toLowerCase(), forwardDays: Math.max(0, Math.min(365, parseInt(input.forwardDays || '30', 10) || 0)),
      deactivateApps: (Array.isArray(input.deactivateApps) ? input.deactivateApps : data.applications.filter(a => !a.always).map(a => a.key)).filter(k => data.applications.some(a => a.key === k)),
      managerNotes: clean(input.managerNotes, 2000),
      hr: Object.assign(Object.fromEntries(data.termination.hrChecks.map(c => [c.key, false])), { notes: '' }),
      it: Object.assign(Object.fromEntries(data.termination.itChecks.map(c => [c.key, false])), { assignedTo: '', notes: '', startedAt: '', completedAt: '', completedBy: '' })
    },
    attachments: []
  };
  await save(r);
  person.requestIds = (person.requestIds || []).concat(r.id);
  person.status = 'terminating';
  person.lastDay = lastDay;
  await people.save(person);
  await addEvent(r, actor, 'created', involuntary ? 'Termination submitted (involuntary, urgent).' : 'Termination submitted.', { toStage: r.stage });
  return r;
}

// ---------- actions ----------
function allowedActions(r, caller) {
  if (model.isTerminal(r.stage)) return [];
  const def = model.stageDef(r.type, r.stage) || { actions: {} };
  const all = Object.assign({}, def.actions, model.commonActionsFor(r.type));
  return Object.entries(all).filter(([, a]) => caller.can(a.roles)).map(([key, a]) => ({ key, label: a.label, to: a.to, requires: a.requires || [] }));
}

async function applyAction(r, action, payload, actor) {
  if (model.isTerminal(r.stage)) throw new HttpError(409, 'This request is closed.');
  const def = model.actionDef(r.type, r.stage, action) || model.commonActionsFor(r.type)[action];
  if (!def) throw new HttpError(400, `"${action}" is not available at stage "${r.stage}".`);
  if (!actor.can(def.roles)) throw new HttpError(403, 'Your role does not allow this action.');
  payload = payload || {};
  for (const f of def.requires || []) if (!clean(payload[f])) throw new HttpError(400, `"${f}" is required for this action.`);

  const person = await people.get(r.personId);
  const fromStage = r.stage;
  let toStage = def.to;
  let note = clean(payload.note, 4000);
  const effects = { notify: action };

  if (r.type === 'hire') {
    const h = r.hire;
    switch (action) {
      case 'packet_sent':
        for (const item of data.packetItems) if (payload.packetItems && payload.packetItems[item.key] !== undefined) h.packet.items[item.key] = bool(payload.packetItems[item.key]);
        h.packet.sentAt = nowIso(); h.packet.sentBy = actor.upn; break;
      case 'record_screening':
        for (const s of data.screeningItems) if (['pending', 'clear', 'flag'].includes(payload[s.key])) h.screening[s.key] = payload[s.key];
        if (payload.notes !== undefined) h.screening.notes = clean(payload.notes, 4000);
        h.screening.updatedAt = nowIso(); break;
      case 'approve':
        h.decision = { outcome: 'approved', by: actor.upn, at: nowIso(), reason: clean(payload.reason, 2000) };
        if (person) await people.applyOutcome(person, { status: 'applicant', rehireEligible: person.rehireEligible });
        break;
      case 'decline':
        h.decision = { outcome: 'not_approved', by: actor.upn, at: nowIso(), reason: clean(payload.reason, 2000) };
        if (person) await people.applyOutcome(person, { status: 'not_approved' });
        break;
      case 'offer_accepted':
      case 'update_start': {
        const d = isoDate(payload.startDate); if (!d) throw new HttpError(400, 'Start date must be a valid date.');
        h.startDate = d; h.startTime = clean(payload.startTime, 10); if (action === 'offer_accepted') h.offerAcceptedAt = nowIso();
        if (person) await people.applyOutcome(person, { status: 'hired', hireDate: d });
        if (action === 'offer_accepted' && checklistComplete(h.checklist)) toStage = 'checklist_complete';
        break; }
      case 'offer_declined':
        if (person) await people.applyOutcome(person, { status: 'withdrawn' }); break;
      case 'submit_checklist': {
        h.checklist = normalizeChecklist(payload.checklist || payload);
        if (!checklistComplete(h.checklist)) throw new HttpError(400, 'Tell IT about the hardware: an existing device on site (with its endpoint name), a purchase, a shared workstation, or no computer.');
        if (fromStage === 'approved') toStage = null; // stays until the start date is set
        break; }
      case 'send_notice': {
        if (!checklistComplete(h.checklist)) throw new HttpError(409, 'The IT checklist is not complete yet.');
        if (!h.startDate) throw new HttpError(409, 'The start date is not set yet.');
        h.employeeNumber = clean(payload.employeeNumber, 40);
        h.notice = { sentAt: nowIso(), sentBy: actor.upn, ticketNote: clean(payload.ticketNote, 2000) };
        if (person) await people.applyOutcome(person, { employeeNumber: h.employeeNumber });
        break; }
      case 'it_start': h.it.startedAt = h.it.startedAt || nowIso(); h.it.assignedTo = actor.upn; break;
      case 'it_update': case 'it_complete': {
        const it = h.it;
        if (payload.upn !== undefined) it.upn = clean(payload.upn, 120).toLowerCase();
        if (payload.license !== undefined) it.license = clean(payload.license, 120);
        if (payload.endpointName !== undefined) it.endpointName = clean(payload.endpointName, 15).toUpperCase();
        if (payload.extension !== undefined) it.extension = clean(payload.extension, 10);
        if (payload.credentialDelivered !== undefined) it.credentialDelivered = bool(payload.credentialDelivered);
        if (payload.managerCredentialDelivered !== undefined) it.managerCredentialDelivered = bool(payload.managerCredentialDelivered);
        if (payload.notes !== undefined) it.notes = clean(payload.notes, 4000);
        it.assignedTo = it.assignedTo || actor.upn;
        if (action === 'it_complete') {
          if (!it.upn) throw new HttpError(400, 'Record the employee work email (UPN) before completing.');
          it.completedAt = nowIso(); it.completedBy = actor.upn;
          if (person) await people.applyOutcome(person, { workEmail: it.upn });
        }
        break; }
      case 'it_return': h.it.returnedNote = note; break;
      case 'started':
        r.confidential = false;
        if (person) await people.applyOutcome(person, { status: 'active', hireDate: h.startDate || person.hireDate, confidential: false, confidentialRequestId: '' });
        for (const item of data.dayOneItems) if (payload[item.key] !== undefined) h.dayOne[item.key] = bool(payload[item.key]);
        break;
      case 'no_show':
        if (person) await people.applyOutcome(person, { status: 'withdrawn' }); break;
      case 'dayone_update':
        for (const item of data.dayOneItems) if (payload[item.key] !== undefined) h.dayOne[item.key] = bool(payload[item.key]);
        break;
      case 'close': break;
      case 'set_confidential': {
        r.confidential = bool(payload.confidential);
        if (person) { person.confidential = r.confidential; person.confidentialRequestId = r.confidential ? r.id : ''; await people.save(person); }
        break; }
      default: break;
    }
  } else if (r.type === 'change') {
    const c = r.change;
    switch (action) {
      case 'edit': {
        const to = payload.to || {};
        for (const k of ['storeId', 'department', 'title', 'managerUpn', 'managerName', 'extension', 'endpointName', 'workArea', 'firstName', 'lastName', 'preferredName']) if (to[k] !== undefined) c.to[k] = clean(to[k], 200);
        for (const k of ['accessAdd', 'accessRemove', 'equipment', 'reason']) if (payload[k] !== undefined) c[k] = clean(payload[k], 2000);
        if (payload.effectiveDate) { const d = isoDate(payload.effectiveDate); if (d) c.effectiveDate = d; }
        break; }
      case 'hr_approve': c.hrApprovedAt = nowIso(); c.hrApprovedBy = actor.upn; c.hrNotes = clean(payload.notes, 2000); break;
      case 'hr_decline': c.hrDeclinedAt = nowIso(); c.hrNotes = note; if (person && person.status === 'changing') await people.applyOutcome(person, { status: 'active' }); break;
      case 'it_start': c.it.startedAt = c.it.startedAt || nowIso(); c.it.assignedTo = actor.upn; break;
      case 'it_update': if (payload.notes !== undefined) c.it.notes = clean(payload.notes, 4000); break;
      case 'it_complete': {
        if (payload.notes !== undefined) c.it.notes = clean(payload.notes, 4000);
        c.it.completedAt = nowIso(); c.it.completedBy = actor.upn;
        if (person) {
          const patch = { status: 'active' };
          if (c.changeTypes.includes('transfer') && c.to.storeId) patch.storeId = c.to.storeId;
          if (c.changeTypes.includes('department') && c.to.department) patch.department = c.to.department;
          if (c.changeTypes.includes('title') && c.to.title) patch.title = c.to.title;
          if (c.changeTypes.includes('manager') && c.to.managerUpn) { patch.managerUpn = c.to.managerUpn; patch.managerName = c.to.managerName; }
          if (c.changeTypes.includes('name')) { if (c.to.firstName) patch.firstName = c.to.firstName; if (c.to.lastName) patch.lastName = c.to.lastName; patch.preferredName = c.to.preferredName; }
          await people.applyOutcome(person, patch);
        }
        break; }
      case 'close': if (person && person.status === 'changing') await people.applyOutcome(person, { status: 'active' }); break;
      default: break;
    }
  } else if (r.type === 'termination') {
    const t = r.termination;
    switch (action) {
      case 'edit':
        for (const k of ['equipmentToRecover', 'mailboxDelegate', 'managerNotes', 'reasonNotes']) if (payload[k] !== undefined) t[k] = clean(payload[k], 2000);
        if (payload.lastDay) { const d = isoDate(payload.lastDay); if (d) { t.lastDay = d; if (person) await people.applyOutcome(person, { lastDay: d }); } }
        if (payload.accessEndAt !== undefined) t.accessEndAt = clean(payload.accessEndAt, 30);
        if (payload.rehireEligible && ['yes', 'no', 'review'].includes(payload.rehireEligible) && actor.can('hr')) t.rehireEligible = payload.rehireEligible;
        break;
      case 'hr_processed':
        for (const c of data.termination.hrChecks) if (payload[c.key] !== undefined) t.hr[c.key] = bool(payload[c.key]);
        if (payload.notes !== undefined) t.hr.notes = clean(payload.notes, 4000);
        if (['yes', 'no', 'review'].includes(payload.rehireEligible)) t.rehireEligible = payload.rehireEligible;
        if (payload.reasonNotes !== undefined) t.reasonNotes = clean(payload.reasonNotes, 4000);
        t.hr.processedAt = nowIso(); t.hr.processedBy = actor.upn;
        if (person) await people.applyOutcome(person, { rehireEligible: t.rehireEligible, terminationType: t.terminationType });
        break;
      case 'it_start': t.it.startedAt = t.it.startedAt || nowIso(); t.it.assignedTo = actor.upn; break;
      case 'it_update': case 'it_complete':
        for (const c of data.termination.itChecks) if (payload[c.key] !== undefined) t.it[c.key] = bool(payload[c.key]);
        if (payload.notes !== undefined) t.it.notes = clean(payload.notes, 4000);
        if (action === 'it_complete') {
          t.it.completedAt = nowIso(); t.it.completedBy = actor.upn;
          if (person) await people.applyOutcome(person, { status: 'terminated', lastDay: t.lastDay, terminationType: t.terminationType, rehireEligible: t.rehireEligible });
        }
        break;
      case 'close':
        if (person) await people.applyOutcome(person, { status: 'terminated', lastDay: t.lastDay, terminationType: t.terminationType, rehireEligible: t.rehireEligible });
        break;
      default: break;
    }
  }

  if (action === 'withdraw') {
    if (person) {
      const back = r.type === 'hire' ? 'withdrawn' : (person.status === 'terminating' || person.status === 'changing' ? 'active' : person.status);
      await people.applyOutcome(person, { status: back });
    }
  }
  if (action === 'reassign_manager') {
    r.managerUpn = clean(payload.managerUpn, 120).toLowerCase(); r.managerName = clean(payload.managerName, 120);
    if (person) await people.applyOutcome(person, { managerUpn: r.managerUpn, managerName: r.managerName });
  }

  if (toStage) r.stage = toStage;
  await save(r);
  const ev = await addEvent(r, actor, action, note, { fromStage, toStage: r.stage });
  return { request: r, event: ev, effects, person: person ? await people.get(person.id) : null };
}

// Redact HR-only fields for non-HR callers.
function redact(r, caller) {
  if (!r || caller.can('hr')) return r;
  const copy = JSON.parse(JSON.stringify(r));
  if (copy.hire) { copy.hire.screening = Object.assign({}, copy.hire.screening, { notes: undefined }); if (copy.hire.decision) copy.hire.decision.reason = undefined; }
  if (copy.termination) { delete copy.termination.reasonNotes; delete copy.termination.rehireEligible; }
  return copy;
}

module.exports = { IT_STAGES, listAll, get, save, events, addEvent, visibleTo, createHire, createChange, createTermination, allowedActions, applyAction, redact, normalizeChecklist, checklistComplete, PK };
