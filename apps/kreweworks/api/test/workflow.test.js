'use strict';
const test = require('node:test');
const assert = require('node:assert');
process.env.PORTAL_MAIL_ENABLED = 'false';
process.env.PORTAL_BOOTSTRAP_ADMINS = 'tammy@noitgroup.com';
const { resetStore, MemoryStore } = require('../src/lib/store');
const access = require('../src/lib/access');
const workflow = require('../src/lib/workflow');
const people = require('../src/lib/people');
const model = require('../src/lib/model');
const notify = require('../src/lib/notify');

function caller(upn, role, stores) { return access.makeCaller({ upn, name: upn, tid: '00000000-0000-4000-8000-00000000d3e0', oid: 'x' }, { upn, role, stores: stores || ['*'], active: true }, false); }
const manager = caller('gm@bayoudemo.example', 'manager', ['north']);
const hr = caller('hr@bayoudemo.example', 'hr');
const it = caller('blake@noitgroup.com', 'it');
const otherMgr = caller('other@bayoudemo.example', 'manager', ['south']);

test.beforeEach(() => resetStore(new MemoryStore('')));

test('hire runs end to end with the right roles at each step', async () => {
  const r = await workflow.createHire({ firstName: 'Jane', lastName: 'Doe', mobile: '225-555-0100', storeId: 'north', department: 'Sales', title: 'Sales Associate', managerUpn: 'gm@bayoudemo.example', managerName: 'GM' }, manager);
  assert.equal(r.stage, 'packet_pending');
  const p0 = await people.get(r.personId); assert.equal(p0.status, 'applicant'); assert.equal(p0.mobile, '+12255550100');

  await assert.rejects(workflow.applyAction(r, 'acknowledge', {}, manager), /not available/);
  let out = await workflow.applyAction(r, 'packet_sent', { packetItems: { application: true } }, manager);
  assert.equal(out.request.stage, 'packet_sent');
  await assert.rejects(workflow.applyAction(out.request, 'acknowledge', {}, manager), /role does not allow/);
  out = await workflow.applyAction(out.request, 'acknowledge', {}, hr);
  out = await workflow.applyAction(out.request, 'record_screening', { background: 'clear', mvr: 'clear', drug: 'pending', notes: 'HR only' }, hr);
  assert.equal(out.request.stage, 'screening');
  out = await workflow.applyAction(out.request, 'approve', {}, hr);
  assert.equal(out.request.stage, 'approved');

  // checklist before start date keeps the stage; start date then moves straight to checklist_complete
  await assert.rejects(workflow.applyAction(out.request, 'submit_checklist', { checklist: { hardware: 'existing_on_site' } }, manager), /endpoint name/);
  out = await workflow.applyAction(out.request, 'submit_checklist', { checklist: { hardware: 'existing_on_site', endpointName: 'bd-north-pc7', extension: '114', applications: { erp: true, crm: 'true' }, equipment: { monitor2: { needed: true } } } }, manager);
  assert.equal(out.request.stage, 'approved');
  assert.equal(out.request.hire.checklist.endpointName, 'BD-NORTH-PC7');
  assert.equal(out.request.hire.checklist.applications.office, true);
  out = await workflow.applyAction(out.request, 'offer_accepted', { startDate: '2026-10-13', startTime: '08:00' }, manager);
  assert.equal(out.request.stage, 'checklist_complete');
  assert.equal(out.person.status, 'hired');

  await assert.rejects(workflow.applyAction(out.request, 'send_notice', {}, hr), /employeeNumber/);
  out = await workflow.applyAction(out.request, 'send_notice', { employeeNumber: 'E1234' }, hr);
  assert.equal(out.request.stage, 'it_queue');
  const msg = notify.compose(out.request, 'send_notice', out.person, hr);
  assert.match(msg.subject, /New Hire Notice: Jane Doe starts 2026-10-13/);
  assert.ok(msg.body.includes('BD-NORTH-PC7'));
  assert.ok(!msg.body.includes('HR only'));

  out = await workflow.applyAction(out.request, 'it_start', {}, it);
  await assert.rejects(workflow.applyAction(out.request, 'it_complete', {}, it), /work email/);
  out = await workflow.applyAction(out.request, 'it_complete', { upn: 'jdoe@bayoudemo.example', license: 'F1', credentialDelivered: true }, it);
  assert.equal(out.request.stage, 'it_complete');
  assert.equal(out.person.workEmail, 'jdoe@bayoudemo.example');
  out = await workflow.applyAction(out.request, 'started', { payrollOnboarding: true }, manager);
  assert.equal(out.person.status, 'active');
  out = await workflow.applyAction(out.request, 'close', {}, hr);
  assert.equal(out.request.stage, 'closed');
  const evs = await workflow.events(r.id);
  assert.ok(evs.length >= 10);
});

test('HR-only data is redacted for managers and IT', async () => {
  const r = await workflow.createHire({ firstName: 'A', lastName: 'B', mobile: '2255550101', storeId: 'north', department: 'Sales', title: 'Sales Associate', managerUpn: 'gm@bayoudemo.example' }, manager);
  let out = await workflow.applyAction(r, 'packet_sent', {}, manager);
  out = await workflow.applyAction(out.request, 'acknowledge', {}, hr);
  out = await workflow.applyAction(out.request, 'record_screening', { background: 'flag', notes: 'confidential' }, hr);
  out = await workflow.applyAction(out.request, 'decline', { reason: 'failed' }, hr);
  const red = workflow.redact(out.request, manager);
  assert.equal(red.hire.screening.notes, undefined);
  assert.equal(red.hire.decision.reason, undefined);
  assert.equal(red.hire.screening.background, 'flag');
  assert.equal(workflow.redact(out.request, hr).hire.screening.notes, 'confidential');
  assert.equal(out.person.status, 'not_approved');
});

test('duplicate detection flags a prior not-approved applicant and rehire keeps history', async () => {
  const r = await workflow.createHire({ firstName: 'Sam', lastName: 'Rehire', mobile: '2255550102', storeId: 'north', department: 'Service', title: 'Porter', managerUpn: 'gm@bayoudemo.example' }, manager);
  let out = await workflow.applyAction(r, 'packet_sent', {}, manager);
  out = await workflow.applyAction(out.request, 'acknowledge', {}, hr);
  out = await workflow.applyAction(out.request, 'decline', {}, hr);
  const dups = await people.findDuplicates({ firstName: 'sam', lastName: 'REHIRE' });
  assert.equal(dups.length, 1); assert.deepEqual(dups[0].reasons, ['same name']);
  const r2 = await workflow.createHire({ personId: dups[0].person.id, firstName: 'Sam', lastName: 'Rehire', mobile: '2255550102', storeId: 'south', department: 'Service', title: 'Porter', managerUpn: 'other@bayoudemo.example' }, otherMgr);
  assert.equal(r2.isRehire, true);
  const p = await people.get(r2.personId);
  assert.equal(p.status, 'applicant'); assert.equal(p.previousEmployment.length, 1); assert.equal(p.previousEmployment[0].status, 'not_approved');
  assert.equal(p.requestIds.length, 2);
});

test('termination: involuntary is urgent, IT completion terminates the person, rehire flag is HR-only', async () => {
  const p = await people.create({ firstName: 'Old', lastName: 'Timer', storeId: 'north', department: 'Sales', title: 'Sales Associate', workEmail: 'otimer@bayoudemo.example', status: 'active', managerUpn: 'gm@bayoudemo.example' }, hr);
  const r = await workflow.createTermination({ personId: p.id, lastDay: '2026-10-02', terminationType: 'termination_cause', rehireEligible: 'no', reasonNotes: 'policy', equipmentToRecover: 'Laptop, key fob' }, manager);
  assert.equal(r.priority, 'urgent'); assert.equal(r.termination.accessEndAt, 'immediately');
  assert.equal((await people.get(p.id)).status, 'terminating');
  const redacted = workflow.redact(r, it);
  assert.equal(redacted.termination.reasonNotes, undefined); assert.equal(redacted.termination.rehireEligible, undefined);
  let out = await workflow.applyAction(r, 'it_start', {}, it);
  out = await workflow.applyAction(out.request, 'it_complete', { signInBlocked: true, sessionsRevoked: true, deviceRecovered: true }, it);
  assert.equal(out.person.status, 'terminated'); assert.equal(out.person.rehireEligible, 'no');
  out = await workflow.applyAction(out.request, 'hr_processed', { finalPayroll: true, hrSystemInactive: true }, hr);
  out = await workflow.applyAction(out.request, 'close', {}, hr);
  assert.equal(out.request.stage, 'closed');
  const dup = await people.findDuplicates({ firstName: 'Old', lastName: 'Timer' });
  assert.equal(dup[0].person.rehireEligible, 'no');
  assert.equal(people.redact(dup[0].person, manager).rehireEligible, undefined);
});

test('change: transfer applies the new store and title when IT completes', async () => {
  const p = await people.create({ firstName: 'Move', lastName: 'Me', storeId: 'north', department: 'Sales', title: 'Sales Associate', workEmail: 'mme@bayoudemo.example', status: 'active' }, hr);
  const r = await workflow.createChange({ personId: p.id, changeTypes: ['transfer', 'title'], effectiveDate: '2026-10-15', to: { storeId: 'south', title: 'Sales Manager' } }, manager);
  assert.equal(r.stage, 'submitted');
  await assert.rejects(workflow.applyAction(r, 'hr_decline', {}, hr), /note/);
  let out = await workflow.applyAction(r, 'hr_approve', {}, hr);
  assert.equal(out.request.stage, 'it_queue');
  out = await workflow.applyAction(out.request, 'it_complete', { notes: 'done' }, it);
  assert.equal(out.person.storeId, 'south'); assert.equal(out.person.title, 'Sales Manager'); assert.equal(out.person.status, 'active');
  out = await workflow.applyAction(out.request, 'close', {}, manager);
  assert.equal(out.request.stage, 'closed');
});

test('visibility: managers only see their stores; HR and IT see everything', async () => {
  const r = await workflow.createHire({ firstName: 'V', lastName: 'W', mobile: '2255550103', storeId: 'north', department: 'Sales', title: 'Sales Associate', managerUpn: 'gm@bayoudemo.example' }, manager);
  assert.equal(workflow.visibleTo(r, manager), true);
  assert.equal(workflow.visibleTo(r, otherMgr), false);
  assert.equal(workflow.visibleTo(r, hr), true);
  assert.equal(workflow.visibleTo(r, it), true);
  assert.deepEqual(workflow.allowedActions(r, it), []);
  assert.deepEqual(workflow.allowedActions(r, manager).map(a => a.key).sort(), ['packet_sent', 'withdraw']);
  assert.deepEqual(workflow.allowedActions(r, hr).map(a => a.key).sort(), ['packet_sent', 'reassign_manager', 'set_confidential', 'withdraw']);
});

test('every stage action references a real target stage', () => {
  for (const [type, def] of Object.entries(model.TYPES)) {
    for (const [stage, s] of Object.entries(def.stages)) {
      for (const [k, a] of Object.entries(s.actions || {})) {
        assert.ok(a.to === null || def.stages[a.to], `${type}.${stage}.${k} -> ${a.to}`);
        assert.ok(a.roles.every(r => access.ROLES.includes(r)), `${type}.${stage}.${k} roles`);
      }
    }
  }
});

test('confidential hire: hidden from other managers and IT until it reaches IT, duplicates do not reveal it', async () => {
  const sameStoreMgr = caller('peer@bayoudemo.example', 'manager', ['north']);
  const wideMgr = caller('regional@bayoudemo.example', 'manager', ['*']);
  const r = await workflow.createHire({ firstName: 'Quiet', lastName: 'Hire', mobile: '2255550177', storeId: 'north', department: 'Sales', title: 'Sales Associate', managerUpn: 'gm@bayoudemo.example', confidential: true }, manager);
  assert.equal(r.confidential, true);
  assert.equal((await people.get(r.personId)).confidential, true);
  assert.equal(workflow.visibleTo(r, manager), true);
  assert.equal(workflow.visibleTo(r, hr), true);
  assert.equal(workflow.visibleTo(r, sameStoreMgr), false);
  assert.equal(workflow.visibleTo(r, wideMgr), false);
  assert.equal(workflow.visibleTo(r, it), false);
  // Once the New Hire Notice goes to IT, IT can see it to build the account.
  r.stage = 'it_queue';
  assert.equal(workflow.visibleTo(r, it), true);
  assert.equal(workflow.visibleTo(r, sameStoreMgr), false);
  // HR can lift confidentiality; then normal store scoping applies.
  r.stage = 'screening';
  const out = await workflow.applyAction(r, 'set_confidential', { confidential: false }, hr);
  assert.equal(out.request.confidential, false);
  assert.equal(workflow.visibleTo(out.request, sameStoreMgr), true);
  assert.equal((await people.get(r.personId)).confidential, false);
  // Managers cannot change confidentiality.
  await assert.rejects(workflow.applyAction(out.request, 'set_confidential', { confidential: true }, manager), /role/);
});

test('termination checklists come from the profile', async () => {
  const profile = require('../src/lib/profile');
  const r0 = await workflow.createHire({ firstName: 'T', lastName: 'C', mobile: '2255550178', storeId: 'north', department: 'Sales', title: 'Sales Associate', managerUpn: 'gm@bayoudemo.example' }, manager);
  const p = await people.get(r0.personId); p.status = 'active'; await people.save(p);
  const t = await workflow.createTermination({ personId: p.id, lastDay: '2026-11-01', terminationType: 'resignation' }, manager);
  assert.deepEqual(Object.keys(t.termination.hr).filter(k => k !== 'notes').sort(), profile.termination.hrChecks.map(c => c.key).sort());
  assert.ok(profile.termination.itChecks.every(c => t.termination.it[c.key] === false));
  assert.deepEqual(t.termination.deactivateApps.sort(), ['crm', 'erp', 'other']);
});
