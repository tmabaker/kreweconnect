'use strict';
const test = require('node:test');
const assert = require('node:assert');
process.env.KREWEWORKS_PROFILE_PATH = require('path').join(__dirname, '../src/profiles/demo.json');
process.env.PORTAL_MAIL_ENABLED = 'false';
process.env.PORTAL_BOOTSTRAP_ADMINS = 'tammy@noitgroup.com';
process.env.PORTAL_SERVICE_KEY = 'test-service-key';
const { app } = require('@azure/functions');
const { collect } = require('./harness');
const { resetStore, MemoryStore } = require('../src/lib/store');
const routes = collect(app, () => require('../src/index'));
const people = require('../src/lib/people');
const workflow = require('../src/lib/workflow');

async function post(path, body, key) {
  const headers = { 'content-type': 'application/json' };
  if (key !== undefined) headers['x-kreweworks-service-key'] = key;
  const res = await routes.dispatch('POST', new URL(`http://x/api/${path}`), Buffer.from(JSON.stringify(body)), headers);
  return { status: res.status, body: JSON.parse(res.body) };
}

async function termination() {
  const actor = { upn: 'hr@bayoudemo.example', name: 'HR', role: 'hr' };
  const p = await people.create({ firstName: 'Frank', lastName: 'Parkin', storeId: 'north', status: 'active', workEmail: 'fparkin@bayoudemo.example' }, actor);
  return workflow.createTermination({ personId: p.id, lastDay: '2026-11-07', terminationType: 'resignation', deviceEndpointName: 'BD-NORTH-PC1' }, actor);
}

test.beforeEach(() => resetStore(new MemoryStore('')));

test('Tech Tools updates need the service key', async () => {
  const r = await termination();
  const body = { actor: { upn: 'tech@noitgroup.com' }, items: [{ text: 'Block sign-in', ok: true }] };
  assert.equal((await post(`service/requests/${r.id}/techtools`, body)).status, 403);
  assert.equal((await post(`service/requests/${r.id}/techtools`, body, 'wrong-key-of-same-len')).status, 403);
  assert.equal((await post('service/requests/T-missing/techtools', body, 'test-service-key')).status, 404);
  assert.equal((await workflow.events(r.id)).filter(e => e.action === 'techtools_update').length, 0);
});

test('Tech Tools work lands on the termination timeline, ticks checks and starts IT, never completes', async () => {
  const r = await termination();
  assert.equal(r.stage, 'submitted');
  const res = await post(`service/requests/${r.id}/techtools`, {
    actor: { upn: 'Tech@NOITgroup.com', name: 'Tech One' },
    items: [{ text: 'Block sign-in', ok: true }, { text: 'Wipe BD-NORTH-PC1: Intune shows pending', ok: true }, { text: 'Remove licenses', ok: false }],
    itChecks: ['signInBlocked', 'deviceRecovered', 'notACheck'],
  }, 'test-service-key');
  assert.equal(res.status, 200);
  assert.equal(res.body.stage, 'it_in_progress');
  assert.deepEqual(res.body.checksSet.sort(), ['deviceRecovered', 'signInBlocked']);
  const saved = await workflow.get(r.id);
  assert.equal(saved.termination.it.signInBlocked, true);
  assert.equal(saved.termination.it.licenseReclaimed, false);
  assert.equal(saved.termination.it.assignedTo, 'tech@noitgroup.com');
  const ev = (await workflow.events(r.id)).find(e => e.action === 'techtools_update');
  assert.equal(ev.byName, 'Tech One (Tech Tools)');
  assert.match(ev.note, /Done: Block sign-in/);
  assert.match(ev.note, /Failed: Remove licenses/);
  const person = await people.get(saved.personId);
  assert.equal(person.status, 'terminating');
  // A later update keeps the stage and does not untick earlier checks.
  const again = await post(`service/requests/${r.id}/techtools`, { actor: { upn: 'tech@noitgroup.com' }, items: [{ text: 'Phone vendor notice sent', ok: true }], itChecks: [] }, 'test-service-key');
  assert.equal(again.body.stage, 'it_in_progress');
  assert.equal((await workflow.get(r.id)).termination.it.signInBlocked, true);
});

test('the termination link to Tech Tools carries the tenant and endpoint', async () => {
  const r = await termination();
  const res = await routes.dispatch('GET', new URL(`http://x/api/requests/${r.id}`), null, {
    'x-ms-client-principal': Buffer.from(JSON.stringify({ userDetails: 'tammy@noitgroup.com', claims: [{ typ: 'preferred_username', val: 'tammy@noitgroup.com' }, { typ: 'tid', val: '00000000-0000-4000-8000-0000000a0017' }] })).toString('base64'),
  });
  const links = JSON.parse(res.body).links;
  assert.ok(links.removeUser, 'demo profile links Tech Tools')
  const q = new URL(links.removeUser).searchParams;
  assert.equal(q.get('ref'), r.id);
  assert.equal(q.get('endpoint'), 'BD-NORTH-PC1');
  assert.ok(q.get('tenant'));
});
