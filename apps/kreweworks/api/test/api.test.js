'use strict';
const test = require('node:test');
const assert = require('node:assert');
// Tests always run against the fictional demo profile, even inside a client package.
process.env.KREWEWORKS_PROFILE_PATH = require('path').join(__dirname, '../src/profiles/demo.json');
process.env.PORTAL_MAIL_ENABLED = 'false';
process.env.PORTAL_BOOTSTRAP_ADMINS = 'tammy@noitgroup.com';
process.env.PORTAL_DEV_PRINCIPAL = '';
const { app } = require('@azure/functions');
const { collect } = require('./harness');
const { resetStore, MemoryStore } = require('../src/lib/store');
const routes = collect(app, () => require('../src/index'));

function principal(upn, tid, name) {
  return Buffer.from(JSON.stringify({ identityProvider: 'aad', userId: 'u', userDetails: upn, userRoles: ['authenticated'], claims: [{ typ: 'preferred_username', val: upn }, { typ: 'tid', val: tid || '00000000-0000-4000-8000-00000000d3e0' }, { typ: 'name', val: name || upn }] })).toString('base64');
}
async function call(method, path, body, upn, tid) {
  const headers = { 'content-type': 'application/json' };
  if (upn) headers['x-ms-client-principal'] = principal(upn, tid);
  const res = await routes.dispatch(method, new URL(`http://x/api/${path}`), body ? Buffer.from(JSON.stringify(body)) : null, headers);
  let json = null; try { json = JSON.parse(res.body); } catch (e) { json = res.body; }
  return { status: res.status, body: json };
}

test.beforeEach(() => resetStore(new MemoryStore('')));

test('roles: unknown users get nothing, bootstrap admin gets portal+admin, foreign tenant is refused', async () => {
  let r = await call('POST', 'roles', { userDetails: 'nobody@bayoudemo.example', claims: [{ typ: 'preferred_username', val: 'nobody@bayoudemo.example' }, { typ: 'tid', val: '00000000-0000-4000-8000-00000000d3e0' }] });
  assert.deepEqual(r.body.roles, []);
  r = await call('POST', 'roles', { userDetails: 'tammy@noitgroup.com', claims: [{ typ: 'preferred_username', val: 'tammy@noitgroup.com' }, { typ: 'tid', val: '00000000-0000-4000-8000-0000000a0017' }] });
  assert.deepEqual(r.body.roles, ['portal', 'admin']);
  r = await call('POST', 'roles', { userDetails: 'tammy@noitgroup.com', claims: [{ typ: 'preferred_username', val: 'tammy@noitgroup.com' }, { typ: 'tid', val: '00000000-0000-0000-0000-000000000000' }] });
  assert.deepEqual(r.body.roles, []);
});

test('access management and scoped request flow over HTTP', async () => {
  assert.equal((await call('GET', 'dashboard')).status, 401);
  assert.equal((await call('GET', 'dashboard', null, 'nobody@bayoudemo.example')).status, 403);
  // admin grants HR and a manager scoped to the North Shore office
  let r = await call('PUT', 'access', { upn: 'hrlead@bayoudemo.example', role: 'hr', displayName: 'Pat Hebert' }, 'tammy@noitgroup.com', '00000000-0000-4000-8000-0000000a0017');
  assert.equal(r.status, 200);
  r = await call('PUT', 'access', { upn: 'mgr1@bayoudemo.example', role: 'manager', stores: ['north'] }, 'hrlead@bayoudemo.example');
  assert.equal(r.status, 200);
  r = await call('PUT', 'access', { upn: 'x@bayoudemo.example', role: 'it' }, 'hrlead@bayoudemo.example');
  assert.equal(r.status, 403);
  // manager out of scope cannot create for another store
  r = await call('POST', 'requests', { type: 'hire', firstName: 'New', lastName: 'Hire', mobile: '2255550199', storeId: 'south', department: 'Sales', title: 'Sales Associate', managerUpn: 'mgr1@bayoudemo.example' }, 'mgr1@bayoudemo.example');
  assert.equal(r.status, 403);
  r = await call('POST', 'requests', { type: 'hire', firstName: 'New', lastName: 'Hire', mobile: '2255550199', storeId: 'north', department: 'Sales', title: 'Sales Associate', managerUpn: 'mgr1@bayoudemo.example' }, 'mgr1@bayoudemo.example');
  assert.equal(r.status, 201);
  const id = r.body.request.id;
  r = await call('GET', `requests/${id}`, null, 'mgr1@bayoudemo.example');
  assert.equal(r.status, 200); assert.ok(r.body.links.addUser.includes('usersetup.html?'));
  assert.deepEqual(r.body.actions.map(a => a.key).sort(), ['manager_section', 'packet_invite', 'packet_sent', 'withdraw']);
  r = await call('POST', `requests/${id}/actions/packet_sent`, {}, 'mgr1@bayoudemo.example');
  assert.equal(r.status, 200); assert.equal(r.body.request.stage, 'packet_sent'); assert.equal(r.body.notification.sent, false);
  r = await call('GET', 'dashboard', null, 'hrlead@bayoudemo.example');
  assert.equal(r.body.counts.queue, 1);
  r = await call('GET', 'people?q=hire', null, 'hrlead@bayoudemo.example');
  assert.equal(r.body.count, 1);
  r = await call('POST', `requests/${id}/comments`, { text: 'hello', hrOnly: true }, 'hrlead@bayoudemo.example');
  assert.equal(r.status, 201);
  r = await call('GET', `requests/${id}`, null, 'mgr1@bayoudemo.example');
  assert.equal(r.body.events.filter(e => e.action === 'comment').length, 0);
  r = await call('GET', `requests/${id}`, null, 'hrlead@bayoudemo.example');
  assert.equal(r.body.events.filter(e => e.action === 'comment').length, 1);
  r = await call('GET', 'export/requests.csv', null, 'hrlead@bayoudemo.example');
  assert.equal(r.status, 200); assert.ok(String(r.body).includes(id));
  r = await call('GET', 'export/people.csv', null, 'mgr1@bayoudemo.example');
  assert.equal(r.status, 403);
});

test('attachments round-trip through the store', async () => {
  await call('PUT', 'access', { upn: 'hrlead@bayoudemo.example', role: 'hr' }, 'tammy@noitgroup.com', '00000000-0000-4000-8000-0000000a0017');
  let r = await call('POST', 'requests', { type: 'hire', firstName: 'Att', lastName: 'Ach', mobile: '2255550198', storeId: 'north', department: 'Sales', title: 'Sales Associate', managerUpn: 'hrlead@bayoudemo.example' }, 'hrlead@bayoudemo.example');
  const id = r.body.request.id;
  r = await call('POST', `requests/${id}/attachments`, { name: 'packet.pdf', contentType: 'application/pdf', dataBase64: Buffer.from('%PDF-1.4 test').toString('base64') }, 'hrlead@bayoudemo.example');
  assert.equal(r.status, 201);
  const res = await routes.dispatch('GET', new URL(`http://x/api/requests/${id}/attachments/0`), null, { 'x-ms-client-principal': principal('hrlead@bayoudemo.example') });
  assert.equal(res.status, 200); assert.equal(res.body.toString(), '%PDF-1.4 test');
});

test('initialAccess in the profile seeds an empty access table once, then the portal owns the list', async () => {
  const profile = require('../src/lib/profile');
  const saved = profile.load();
  const raw = JSON.parse(JSON.stringify(saved));
  raw.initialAccess = [
    { upn: 'HRLead@bayoudemo.example', displayName: 'Pat Hebert', role: 'hr' },
    { upn: 'helpdesk@bayoudemo.example', displayName: 'Help Desk', role: 'it' }
  ];
  try {
    profile.use(raw);
    let r = await call('POST', 'roles', { userDetails: 'hrlead@bayoudemo.example', claims: [{ typ: 'preferred_username', val: 'hrlead@bayoudemo.example' }, { typ: 'tid', val: '00000000-0000-4000-8000-00000000d3e0' }] });
    assert.deepEqual(r.body.roles, ['portal', 'hr']);
    r = await call('GET', 'access', null, 'tammy@noitgroup.com', '00000000-0000-4000-8000-0000000a0017');
    assert.deepEqual(r.body.value.map(e => [e.upn, e.role]), [['helpdesk@bayoudemo.example', 'it'], ['hrlead@bayoudemo.example', 'hr']]);
    // a removal in the portal sticks: the table is no longer empty, so nothing is re-seeded
    assert.equal((await call('DELETE', 'access/helpdesk%40bayoudemo.example', null, 'tammy@noitgroup.com', '00000000-0000-4000-8000-0000000a0017')).status, 200);
    r = await call('GET', 'access', null, 'tammy@noitgroup.com', '00000000-0000-4000-8000-0000000a0017');
    assert.deepEqual(r.body.value.map(e => e.upn), ['hrlead@bayoudemo.example']);
  } finally {
    profile.use(JSON.parse(JSON.stringify(saved)));
  }
});
