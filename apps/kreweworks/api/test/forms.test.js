'use strict';
// Hire pay fields, the separation notice on terminations, and notification watchers.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// A copy of the demo profile with watchers and a uniforms question, as a client profile would set them.
const demo = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/profiles/demo.json'), 'utf8'));
demo.mail = Object.assign({}, demo.mail, {
  watchers: [
    { name: 'Office lead', email: 'office@bayoudemo.example' },
    { name: 'Field director', email: 'field@bayoudemo.example', departments: ['Field Operations'] }
  ]
});
demo.termination = Object.assign({}, demo.termination || {}, { uniformsQuestion: 'Did the employee return all issued uniforms?' });
const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-')), 'profile.json');
fs.writeFileSync(file, JSON.stringify(demo));
process.env.KREWEWORKS_PROFILE_PATH = file;
process.env.PORTAL_MAIL_ENABLED = 'false';

const { resetStore, MemoryStore } = require('../src/lib/store');
const workflow = require('../src/lib/workflow');
const people = require('../src/lib/people');
const notify = require('../src/lib/notify');

const caller = (upn, role) => ({ upn, name: upn, role, stores: ['*'], can(r) { const s = { manager: ['manager', 'hr', 'admin'], hr: ['hr', 'admin'], it: ['it', 'admin'], admin: ['admin'] }; return (Array.isArray(r) ? r : [r]).some(x => (s[x] || []).includes(role)); }, seesAll() { return true; }, inScope() { return true; } });
const manager = caller('gm@bayoudemo.example', 'manager');
const hr = caller('hr@bayoudemo.example', 'hr');
const it = caller('it@bayoudemo.example', 'it');

const hireBase = { firstName: 'Pat', lastName: 'Pay', mobile: '2255550190', storeId: 'north', department: 'Sales', title: 'Sales Associate', managerUpn: 'gm@bayoudemo.example' };

test.beforeEach(() => resetStore(new MemoryStore('')));

test('a hire needs a rate of pay and a pay structure, and IT never sees them', async () => {
  await assert.rejects(workflow.createHire(hireBase, manager), /Rate of pay is required/);
  await assert.rejects(workflow.createHire(Object.assign({ payRate: '$18.00 per hour', payStructure: 'Barter' }, hireBase), manager), /pay structure/);
  const r = await workflow.createHire(Object.assign({ payRate: '$18.00 per hour', payStructure: 'Hourly' }, hireBase), manager);
  assert.deepEqual(r.hire.pay, { rate: '$18.00 per hour', structure: 'Hourly', notes: '' });
  assert.equal(workflow.redact(r, manager).hire.pay.rate, '$18.00 per hour');
  assert.equal(workflow.redact(r, hr).hire.pay.rate, '$18.00 per hour');
  assert.equal(workflow.redact(r, it).hire.pay, undefined);
  // Another manager who can see the request (a director, an office lead) does not see pay.
  assert.equal(workflow.redact(r, caller('director@bayoudemo.example', 'manager')).hire.pay, undefined);
  r.hire.managerSection.rateOfPay = '$18.00 per hour (Hourly)';
  assert.equal(workflow.redact(r, caller('director@bayoudemo.example', 'manager')).hire.managerSection.rateOfPay, undefined);
  assert.equal(workflow.redact(r, manager).hire.managerSection.rateOfPay, '$18.00 per hour (Hourly)');
});

async function person() {
  return people.create({ firstName: 'Lee', lastName: 'Leaving', storeId: 'north', department: 'Field Operations', status: 'active', workEmail: 'lee@bayoudemo.example' }, hr);
}
const termBase = (p) => ({ personId: p.id, lastDay: '2026-11-07', terminationDate: '2026-11-10', terminationType: 'resignation', separation: 'voluntary', noticeGiven: 'yes', noticeLength: 'Two weeks', rehireEligible: 'yes', uniformsReturned: 'yes', reasonNotes: 'Took a job closer to home.', otherComments: 'Good standing.', employeeSignature: 'signed' });

test('the separation notice requires voluntary or involuntary, the reason and the explanation', async () => {
  const p = await person();
  const drop = (k) => { const b = termBase(p); delete b[k]; return b; };
  await assert.rejects(workflow.createTermination(drop('separation'), manager), /voluntary or involuntary/);
  await assert.rejects(workflow.createTermination(drop('terminationType'), manager), /reason for leaving/);
  await assert.rejects(workflow.createTermination(drop('reasonNotes'), manager), /Explain the events/);
  await assert.rejects(workflow.createTermination(drop('rehireEligible'), manager), /eligible for rehire/);
  await assert.rejects(workflow.createTermination(drop('uniformsReturned'), manager), /uniforms/);
  await assert.rejects(workflow.createTermination(Object.assign(termBase(p), { noticeLength: '' }), manager), /how much notice/);
  await assert.rejects(workflow.createTermination(Object.assign(termBase(p), { terminationDate: '2026-11-01' }), manager), /cannot be before/);
  const r = await workflow.createTermination(termBase(p), manager);
  const t = r.termination;
  assert.equal(t.separation, 'voluntary');
  assert.equal(t.involuntary, false);
  assert.equal(t.terminationDate, '2026-11-10');
  assert.equal(t.noticeLength, 'Two weeks');
  assert.equal(t.uniformsReturned, 'yes');
  assert.equal(t.employeeSignature, 'signed');
  assert.equal(t.submittedBy.upn, 'gm@bayoudemo.example');
  // The explanation, comments and rehire answer stay with HR.
  const seen = workflow.redact(r, it).termination;
  assert.equal(seen.reasonNotes, undefined);
  assert.equal(seen.otherComments, undefined);
  assert.equal(seen.rehireEligible, undefined);
});

test('involuntary comes from the answer, not the reason, and is urgent', async () => {
  const p = await person();
  const r = await workflow.createTermination(Object.assign(termBase(p), { separation: 'involuntary', terminationType: 'termination', noticeGiven: 'na', noticeLength: '' }), manager);
  assert.equal(r.termination.involuntary, true);
  assert.equal(r.priority, 'urgent');
});

test('watchers are copied by type and department, never on candidate mail or a confidential hire', async () => {
  const p = await person();
  const t = await workflow.createTermination(termBase(p), manager);
  assert.deepEqual(notify.watchersFor(t).sort(), ['field@bayoudemo.example', 'office@bayoudemo.example']);
  const sales = await workflow.createHire(Object.assign({ payRate: '$18.00 per hour', payStructure: 'Hourly' }, hireBase), manager);
  assert.deepEqual(notify.watchersFor(sales), ['office@bayoudemo.example']);
  const quiet = await workflow.createHire(Object.assign({ payRate: '$18.00 per hour', payStructure: 'Hourly', confidential: true, mobile: '2255550191', firstName: 'Quiet' }, hireBase), manager);
  assert.deepEqual(notify.watchersFor(quiet), []);

  // A hire's first notice goes to the watchers only; a termination notice copies them alongside HR and IT.
  const hireMail = await notify.send(sales, 'created', await people.get(sales.personId), manager, null);
  assert.deepEqual(hireMail.to, ['office@bayoudemo.example']);
  const termMail = await notify.send(t, 'created', p, manager, null);
  assert.ok(termMail.to.includes('hr@bayoudemo.example'));
  assert.ok(termMail.cc.includes('office@bayoudemo.example'));
  assert.ok(termMail.cc.includes('field@bayoudemo.example'));
  // The notice names the separation but never the HR-only explanation.
  const composed = notify.compose(t, 'created', p, manager);
  assert.match(composed.body, /Voluntary/);
  assert.doesNotMatch(composed.body, /closer to home/);
});

test('a change into a watched department copies that department\'s watcher', async () => {
  const p = await people.create({ firstName: 'Mo', lastName: 'Ving', storeId: 'north', department: 'Sales', status: 'active' }, hr);
  const c = await workflow.createChange({ personId: p.id, changeTypes: ['department'], effectiveDate: '2026-12-01', to: { department: 'Field Operations' } }, manager);
  assert.ok(notify.watchersFor(c).includes('field@bayoudemo.example'));
});
