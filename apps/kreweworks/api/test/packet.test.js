'use strict';
const test = require('node:test');
const assert = require('node:assert');
// Tests always run against the fictional demo profile, even inside a client package.
process.env.KREWEWORKS_PROFILE_PATH = require('path').join(__dirname, '../src/profiles/demo.json');
process.env.PORTAL_MAIL_ENABLED = 'false';
process.env.PORTAL_BOOTSTRAP_ADMINS = 'tammy@noitgroup.com';
process.env.PORTAL_PII_KEY = require('crypto').randomBytes(32).toString('base64');
process.env.PORTAL_DEV_PRINCIPAL = '';
const { app } = require('@azure/functions');
const { collect } = require('./harness');
const { resetStore, MemoryStore } = require('../src/lib/store');
const access = require('../src/lib/access');
const workflow = require('../src/lib/workflow');
const packet = require('../src/lib/packet');
const notify = require('../src/lib/notify');
const routes = collect(app, () => require('../src/index'));

function caller(upn, role, stores) { return access.makeCaller({ upn, name: upn, tid: '00000000-0000-4000-8000-00000000d3e0', oid: 'x' }, { upn, role, stores: stores || ['*'], active: true }, false); }
const manager = caller('gm@bayoudemo.example', 'manager', ['north']);
const hr = caller('hr@bayoudemo.example', 'hr');
const it = caller('blake@noitgroup.com', 'it');
function principal(upn) { return Buffer.from(JSON.stringify({ identityProvider: 'aad', userId: 'u', userDetails: upn, userRoles: ['authenticated'], claims: [{ typ: 'preferred_username', val: upn }, { typ: 'tid', val: '00000000-0000-4000-8000-0000000a0017' }] })).toString('base64');
}
async function call(method, path, body, upn) {
  const headers = { 'content-type': 'application/json' }; if (upn) headers['x-ms-client-principal'] = principal(upn);
  const res = await routes.dispatch(method, new URL(`http://x/api/${path}`), body ? Buffer.from(JSON.stringify(body)) : null, headers);
  let json = null; try { json = JSON.parse(res.body); } catch (e) { json = res.body; }
  return { status: res.status, body: json };
}
function fullSubmission() {
  const body = { firstName: 'Jane', lastName: 'Doe', address: '1 Main', city: 'Baton Rouge', state: 'LA', zip: '70816', phone: '225-555-0100', email: 'jane@example.com', ssn: '123456789', dob: '1990-05-04', driversLicense: 'D1234567', licenseState: 'LA', emergencyContact: 'John 225-555-0101',
    positionApplied: 'Sales Associate', dealership: 'North Shore', education: 'High school', employers: [{ employer: 'Not applicable' }], signatures: {} };
  for (const f of packet.FIELDS.filter(x => x.type === 'yesno')) body[f.key] = { answer: 'no', detail: '' };
  for (const s of packet.SIGNATURES) body.signatures[s.key] = { name: 'Jane Doe', agreed: true };
  return body;
}

test.beforeEach(() => resetStore(new MemoryStore('')));

test('invite, candidate submission, masking, HR reveal, purge at close', async () => {
  const r = await workflow.createHire({ firstName: 'Jane', lastName: 'Doe', mobile: '2255550100', storeId: 'north', department: 'Sales', title: 'Sales Associate', managerUpn: 'gm@bayoudemo.example', managerName: 'GM' }, manager);
  assert.equal(packet.inviteStatus(r), 'none');
  let out = await workflow.applyAction(r, 'packet_invite', { candidateEmail: 'jane@example.com', sendEmail: true }, manager);
  const token = out.request.hire.packet.invite.token;
  assert.equal(packet.inviteStatus(out.request), 'active');
  const mail = notify.compose(out.request, 'packet_invite', out.person, manager);
  assert.equal(mail.to[0], 'jane@example.com'); assert.ok(mail.body.includes(token));

  // anonymous candidate endpoints
  let res = await call('GET', `apply/${token}`);
  assert.equal(res.status, 200); assert.equal(res.body.status, 'active'); assert.equal(res.body.header.position, 'Sales Associate');
  res = await call('POST', `apply/${token}`, { firstName: 'Jane' });
  assert.equal(res.status, 400); assert.ok(res.body.details.length > 5);
  res = await call('POST', `apply/${token}`, fullSubmission());
  assert.equal(res.status, 200); assert.equal(res.body.submitted, true);
  res = await call('POST', `apply/${token}`, fullSubmission());
  assert.equal(res.status, 410);

  const saved = await workflow.get(r.id);
  assert.equal(saved.stage, 'packet_sent');
  assert.ok(saved.hire.packet.submission.values.ssn.startsWith('enc:v1:'));
  assert.equal(saved.hire.packet.submission.values.firstName, 'Jane');
  // masked for manager and IT, masked for HR by default, revealed on request
  assert.equal(workflow.redact(saved, manager).hire.packet.submission.values.ssn, '***-**-6789');
  assert.equal(workflow.redact(saved, it).hire.packet.submission.values.dob, 'on file');
  assert.equal(workflow.redact(saved, hr).hire.packet.submission.values.ssn, '***-**-6789');
  assert.equal(packet.viewSubmission(saved.hire.packet.submission, hr, true).values.ssn, '123-45-6789');
  assert.equal(packet.viewSubmission(saved.hire.packet.submission, manager, true).values.ssn, '***-**-6789');

  // HR view endpoint logs the reveal; managers cannot reveal
  await call('PUT', 'access', { upn: 'hr@bayoudemo.example', role: 'hr' }, 'tammy@noitgroup.com');
  await call('PUT', 'access', { upn: 'gm@bayoudemo.example', role: 'manager', stores: ['north'] }, 'tammy@noitgroup.com');
  res = await call('GET', `requests/${r.id}/packet?reveal=1`, null, 'gm@bayoudemo.example'); assert.equal(res.status, 403);
  res = await call('GET', `requests/${r.id}/packet?reveal=1`, null, 'hr@bayoudemo.example'); assert.equal(res.status, 200); assert.equal(res.body.submission.values.dob, '1990-05-04');
  const evs = await workflow.events(r.id);
  assert.ok(evs.some(e => e.action === 'pii_revealed' && e.hrOnly));
  assert.ok(evs.some(e => e.action === 'packet_submitted'));

  // walk to close: identifiers purged
  out = await workflow.applyAction(saved, 'acknowledge', {}, hr);
  out = await workflow.applyAction(out.request, 'decline', {}, hr);
  assert.equal(out.request.hire.packet.submission.values.ssn, '');
  assert.ok(out.request.hire.packet.submission.purgedAt);
  assert.ok((await workflow.events(r.id)).some(e => e.action === 'pii_purged'));
});

test('manager section and background screen call are recorded; pay hidden from IT', async () => {
  const r = await workflow.createHire({ firstName: 'A', lastName: 'B', mobile: '2255550102', storeId: 'north', department: 'Service', title: 'Porter', managerUpn: 'gm@bayoudemo.example' }, manager);
  let out = await workflow.applyAction(r, 'manager_section', { rateOfPay: '$15/hr', uniforms: true, employmentType: 'Full-time', workHours: '8-5', workDays: 'Mon-Fri', lunchDeductions: false }, manager);
  assert.equal(out.request.hire.managerSection.rateOfPay, '$15/hr'); assert.equal(out.request.hire.managerSection.uniforms, 'yes');
  assert.equal(workflow.redact(out.request, it).hire.managerSection.rateOfPay, undefined);
  assert.equal(workflow.redact(out.request, manager).hire.managerSection.rateOfPay, '$15/hr');
  // expired link is refused
  out = await workflow.applyAction(out.request, 'packet_invite', {}, manager);
  out = await workflow.applyAction(out.request, 'packet_sent', {}, manager);
  out = await workflow.applyAction(out.request, 'cole_called', { managerName: 'GM Name' }, manager);
  assert.equal(out.request.hire.packet.coleCall.managerName, 'GM Name');
  out.request.hire.packet.invite.expiresAt = new Date(Date.now() - 1000).toISOString(); await workflow.save(out.request);
  const res = await call('GET', `apply/${out.request.hire.packet.invite.token}`);
  assert.equal(res.body.status, 'expired');
});
