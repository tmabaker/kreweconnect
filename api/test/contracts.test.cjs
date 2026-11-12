// KreweReview routes end to end against Azurite (local Blob storage).
// Auth and the Claude call are stubbed; storage, validation, isolation, and
// the route wiring are real.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const net = require('node:net');
const Module = require('node:module');

const MSP = '11111111-1111-4111-8111-111111111111';
const FH = '22222222-2222-4222-8222-222222222222';
const GEAUX = '33333333-3333-4333-8333-333333333333';
const OTHER = '44444444-4444-4444-8444-444444444444';

process.env.MSP_TENANT_ID = MSP;
process.env.CLIENT_TENANTS = JSON.stringify([
  { id: FH, name: 'Fishman Haygood' },
  { id: GEAUX, name: 'Geaux Automotive' },
  { id: OTHER, name: 'Unlisted Client' },
]);
process.env.NO_PROXY = '127.0.0.1,localhost';
process.env.no_proxy = '127.0.0.1,localhost';
delete process.env.ANTHROPIC_API_KEY;

// Capture route registrations instead of starting the Functions host.
const routes = {};
const realLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === '@azure/functions') {
    return { app: { http: (name, opts) => { routes[opts.route] = opts; } } };
  }
  return realLoad.apply(this, arguments);
};

const auth = require('../dist/src/lib/authMiddleware.js');
let currentCaller = null;
auth.authenticate = async () => {
  if (!currentCaller) throw new auth.AuthError('no caller');
  return currentCaller;
};
const staff = { tenantId: MSP, isMspAdmin: true, canManageUsers: true, userObjectId: 'o1', userPrincipalName: 'tech@noit.test' };
const fhUser = { tenantId: FH, isMspAdmin: false, canManageUsers: false, userObjectId: 'o2', userPrincipalName: 'pat@fh.test' };

require('../dist/src/functions/contracts.js');
const picklists = require('../dist/src/lib/picklists.js');
const store = require('../dist/src/lib/contractStore.js');

function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

// Azurite lives in the repo root's devDependencies so it never ships in the
// deployed API bundle. Run `npm ci` at the repo root before `npm test` here.
const AZURITE = join(__dirname, '..', '..', 'node_modules', '.bin', 'azurite-blob');
let azurite;
let dataDir;
test.before(async () => {
  const port = await freePort();
  dataDir = mkdtempSync(join(tmpdir(), 'azurite-'));
  azurite = spawn(
    AZURITE,
    ['--blobHost', '127.0.0.1', '--blobPort', String(port), '--location', dataDir, '--silent', '--skipApiVersionCheck'],
    { stdio: 'ignore' }
  );
  process.env.CONTRACTS_STORAGE_CONNECTION =
    'DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;' +
    'AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;' +
    `BlobEndpoint=http://127.0.0.1:${port}/devstoreaccount1;`;
  store.resetContractStoreForTests();
  for (let i = 0; i < 50; i++) {
    const ok = await new Promise((resolve) => {
      const sock = net.connect(port, '127.0.0.1', () => { sock.end(); resolve(true); });
      sock.on('error', () => resolve(false));
    });
    if (ok) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  picklists.setEntraValuesForTests(GEAUX, ['Geaux Ford - Waveland', 'Volvo - Baton Rouge'], ['Service', 'Sales']);
});

test.after(async () => {
  if (azurite && azurite.exitCode === null) {
    const exited = new Promise((resolve) => azurite.once('exit', resolve));
    azurite.kill();
    await exited;
  }
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

async function call(route, { method = 'GET', caller = staff, params = {}, query = {}, body, raw, headers = {} } = {}) {
  currentCaller = caller;
  const h = new Headers(headers);
  const request = {
    method,
    params,
    query: new URLSearchParams(query),
    headers: h,
    json: async () => {
      if (body === undefined) throw new Error('no body');
      return body;
    },
    arrayBuffer: async () => raw ?? new ArrayBuffer(0),
  };
  const res = await routes[route].handler(request, { error(...a) { if (process.env.DEBUG_TESTS) console.error(...a); }, log() {} });
  return { status: res.status ?? 200, body: res.jsonBody, raw: res.body, headers: res.headers };
}

const base = {
  title: 'Microsoft 365 Business Premium',
  vendorName: 'Microsoft',
  agreementCategory: 'SaaSSubscription',
  location: 'FH New Orleans',
  status: 'Active',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  renewalType: 'AutoRenew',
  noticePeriodDays: 30,
  totalValue: 12000,
  tags: ['Productivity', 'Cloud'],
  confidenceTier: 'A',
};

test('fresh storage starts with no agreements', async () => {
  const res = await call('tenants/{tenantId}/contracts', { params: { tenantId: FH } });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.contracts, []);
  const all = await call('tenants/{tenantId}/contracts', { params: { tenantId: 'all' } });
  assert.deepEqual(all.body.contracts, []);
});

test('pick list defaults come from the tenant name and Entra', async () => {
  const fh = await call('tenants/{tenantId}/contract-picklist', { params: { tenantId: FH } });
  assert.deepEqual(fh.body.locations, ['FH Baton Rouge', 'FH New Orleans']);
  assert.equal(fh.body.locationSource, 'list');
  const geaux = await call('tenants/{tenantId}/contract-picklist', { params: { tenantId: GEAUX } });
  assert.deepEqual(geaux.body.locations, ['Geaux Ford - Waveland', 'Volvo - Baton Rouge']);
  assert.deepEqual(geaux.body.departments, ['Service', 'Sales']);
  assert.equal(geaux.body.locationSource, 'entra');
  const other = await call('tenants/{tenantId}/contract-picklist', { params: { tenantId: OTHER } });
  assert.deepEqual(other.body.locations, []);
});

test('values outside the locked lists are rejected', async () => {
  const route = 'tenants/{tenantId}/contracts';
  const bad = [
    { agreementCategory: 'Gym Membership' },
    { location: 'FH Lafayette' },
    { location: undefined },
    { tags: ['Critical', 'Made Up'] },
    { renewalType: 'Sometimes' },
    { endDate: '2025-01-01' },
    { department: 'Legal' },
  ];
  for (const change of bad) {
    const res = await call(route, { method: 'POST', params: { tenantId: FH }, body: { ...base, ...change } });
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(change)}`);
  }
  const caseInsensitive = await call(route, { method: 'POST', params: { tenantId: FH }, body: { ...base, location: 'fh new orleans' } });
  assert.equal(caseInsensitive.status, 201);
  assert.equal(caseInsensitive.body.contract.location, 'FH New Orleans');
  await call('tenants/{tenantId}/contracts/{contractId}', {
    method: 'DELETE',
    params: { tenantId: FH, contractId: caseInsensitive.body.contract.id },
    query: { confirm: caseInsensitive.body.contract.id },
  });
});

test('an agreement can cover several sites, including a closed one', async () => {
  const route = 'tenants/{tenantId}/contracts';
  // Geaux's live list comes from Entra; the closed store lives on the former list.
  const put = await call('tenants/{tenantId}/contract-picklist', {
    method: 'PUT',
    params: { tenantId: GEAUX },
    body: {
      locations: { source: 'entra', values: [] },
      departments: { source: 'entra', values: [] },
      formerLocations: ['Express Chevrolet Covington', ' Express Chevrolet Covington ', 'Volvo - Baton Rouge'],
    },
  });
  assert.equal(put.status, 200);
  // A former site that is still current is listed once, as current.
  assert.deepEqual(put.body.formerLocations, ['Express Chevrolet Covington']);

  const created = await call(route, {
    method: 'POST',
    params: { tenantId: GEAUX },
    body: { ...base, location: undefined, department: 'Sales', locations: ['express chevrolet covington', 'Volvo - Baton Rouge', 'Volvo - Baton Rouge'] },
  });
  assert.equal(created.status, 201);
  const c = created.body.contract;
  assert.deepEqual(c.locations, ['Express Chevrolet Covington', 'Volvo - Baton Rouge']);
  assert.equal(c.location, 'Express Chevrolet Covington', 'location mirrors the first site for older readers');

  const unknown = await call(route, { method: 'POST', params: { tenantId: GEAUX }, body: { ...base, location: undefined, department: 'Sales', locations: ['Nowhere Motors'] } });
  assert.equal(unknown.status, 400);
  const none = await call(route, { method: 'POST', params: { tenantId: GEAUX }, body: { ...base, location: undefined, department: 'Sales', locations: [] } });
  assert.equal(none.status, 400);

  // Take the closed store off every list: the agreement still saves with it.
  await call('tenants/{tenantId}/contract-picklist', {
    method: 'PUT',
    params: { tenantId: GEAUX },
    body: { locations: { source: 'entra', values: [] }, departments: { source: 'entra', values: [] } },
  });
  const one = await call('tenants/{tenantId}/contracts/{contractId}', { params: { tenantId: GEAUX, contractId: c.id } });
  const edit = await call('tenants/{tenantId}/contracts/{contractId}', {
    method: 'PUT',
    params: { tenantId: GEAUX, contractId: c.id },
    body: { ...base, location: undefined, department: 'Sales', locations: c.locations, title: 'Kept', etag: one.body.etag },
  });
  assert.equal(edit.status, 200, JSON.stringify(edit.body));
  assert.deepEqual(edit.body.contract.locations, ['Express Chevrolet Covington', 'Volvo - Baton Rouge']);

  await call('tenants/{tenantId}/contracts/{contractId}', { method: 'DELETE', params: { tenantId: GEAUX, contractId: c.id }, query: { confirm: c.id } });
});

test('records saved before multi-site read back with a locations list', async () => {
  const { BlobServiceClient } = require('@azure/storage-blob');
  const c = BlobServiceClient.fromConnectionString(process.env.CONTRACTS_STORAGE_CONNECTION).getContainerClient('krewereview');
  const made = (await call('tenants/{tenantId}/contracts', { method: 'POST', params: { tenantId: FH }, body: { ...base, title: 'Legacy shape' } })).body.contract;
  const path = `contracts/${FH}/${made.id}.json`;
  const rec = JSON.parse((await c.getBlobClient(path).downloadToBuffer()).toString());
  delete rec.locations;
  const old = JSON.stringify(rec);
  await c.getBlockBlobClient(path).upload(old, Buffer.byteLength(old));
  store.resetContractStoreForTests();
  const one = await call('tenants/{tenantId}/contracts/{contractId}', { params: { tenantId: FH, contractId: made.id } });
  assert.deepEqual(one.body.contract.locations, ['FH New Orleans']);
  const listed = (await call('tenants/{tenantId}/contracts', { params: { tenantId: FH } })).body.contracts.find((x) => x.id === made.id);
  assert.deepEqual(listed.locations, ['FH New Orleans']);
  await call('tenants/{tenantId}/contracts/{contractId}', { method: 'DELETE', params: { tenantId: FH, contractId: made.id }, query: { confirm: made.id } });
});

test('create, read, edit, archive, restore, and permanently delete', async () => {
  const created = await call('tenants/{tenantId}/contracts', { method: 'POST', params: { tenantId: FH }, body: base });
  assert.equal(created.status, 201);
  const c = created.body.contract;
  assert.equal(c.tenantDisplayName, 'Fishman Haygood');
  assert.equal(c.versions.length, 1);

  const one = '/tenants/{tenantId}/contracts/{contractId}'.slice(1);
  const read = await call(one, { params: { tenantId: FH, contractId: c.id } });
  assert.equal(read.body.contract.title, base.title);

  const edited = await call(one, {
    method: 'PATCH',
    params: { tenantId: FH, contractId: c.id },
    body: { ...base, totalValue: 15000, etag: read.body.etag },
  });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.contract.totalValue, 15000);
  assert.match(edited.body.contract.versions.at(-1).changeNotes, /totalValue/);

  const stale = await call(one, {
    method: 'PATCH',
    params: { tenantId: FH, contractId: c.id },
    body: { ...base, totalValue: 1, etag: read.body.etag },
  });
  assert.equal(stale.status, 409);

  const archived = await call('tenants/{tenantId}/contracts/{contractId}/archive', {
    method: 'POST',
    params: { tenantId: FH, contractId: c.id },
    body: { archived: true },
  });
  assert.equal(archived.body.contract.isArchived, true);
  let list = await call('tenants/{tenantId}/contracts', { params: { tenantId: FH } });
  assert.equal(list.body.contracts.length, 0);
  list = await call('tenants/{tenantId}/contracts', { params: { tenantId: FH }, query: { includeArchived: 'true' } });
  assert.equal(list.body.contracts.length, 1);

  await call('tenants/{tenantId}/contracts/{contractId}/archive', {
    method: 'POST',
    params: { tenantId: FH, contractId: c.id },
    body: { archived: false },
  });
  list = await call('tenants/{tenantId}/contracts', { params: { tenantId: FH } });
  assert.equal(list.body.contracts.length, 1);

  const noConfirm = await call(one, { method: 'DELETE', params: { tenantId: FH, contractId: c.id } });
  assert.equal(noConfirm.status, 400);
  const del = await call(one, { method: 'DELETE', params: { tenantId: FH, contractId: c.id }, query: { confirm: c.id } });
  assert.equal(del.status, 200);
  const gone = await call(one, { params: { tenantId: FH, contractId: c.id } });
  assert.equal(gone.status, 404);
});

test('upload, create from upload, renew, and download the document', async () => {
  const pdf = Buffer.from('%PDF-1.4 fake agreement');
  const up = await call('tenants/{tenantId}/contract-files', {
    method: 'POST',
    params: { tenantId: FH },
    headers: { 'content-type': 'application/pdf', 'x-file-name': encodeURIComponent('MSA signed.pdf') },
    raw: pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.length),
  });
  assert.equal(up.status, 201);
  const fileId = up.body.file.id;

  // No API key configured: extraction says so instead of failing silently.
  const ex = await call('tenants/{tenantId}/contract-files/{fileId}/extract', {
    method: 'POST',
    params: { tenantId: FH, fileId },
  });
  assert.equal(ex.status, 503);
  assert.match(ex.body.message, /ANTHROPIC_API_KEY/);

  const created = await call('tenants/{tenantId}/contracts', {
    method: 'POST',
    params: { tenantId: FH },
    body: { ...base, fileId },
  });
  assert.equal(created.status, 201);
  const c = created.body.contract;
  assert.equal(c.documents.length, 1);
  assert.equal(c.documents[0].fileName, 'MSA signed.pdf');

  const doc = await call('tenants/{tenantId}/contracts/{contractId}/documents/{fileId}', {
    params: { tenantId: FH, contractId: c.id, fileId },
  });
  assert.equal(doc.status, 200);
  assert.equal(Buffer.compare(doc.raw, pdf), 0);

  const up2 = await call('tenants/{tenantId}/contract-files', {
    method: 'POST',
    params: { tenantId: FH },
    headers: { 'content-type': 'application/pdf', 'x-file-name': 'renewal-2027.pdf' },
    raw: pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.length),
  });
  const renewed = await call('tenants/{tenantId}/contracts/{contractId}/renew', {
    method: 'POST',
    params: { tenantId: FH, contractId: c.id },
    body: { ...base, startDate: '2027-01-01', endDate: '2027-12-31', fileId: up2.body.file.id, etag: created.body.etag },
  });
  assert.equal(renewed.status, 200);
  assert.equal(renewed.body.contract.endDate, '2027-12-31');
  assert.equal(renewed.body.contract.documents.length, 2);
  assert.equal(renewed.body.contract.documents[1].kind, 'renewal');
  assert.match(renewed.body.contract.versions.at(-1).changeNotes, /2026-01-01 to 2026-12-31/);

  // An amendment joins the same record: both documents stay, sites combine.
  const up3 = await call('tenants/{tenantId}/contract-files', {
    method: 'POST',
    params: { tenantId: FH },
    headers: { 'content-type': 'application/pdf', 'x-file-name': 'amendment-1.pdf' },
    raw: pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.length),
  });
  const noFile = await call('tenants/{tenantId}/contracts/{contractId}/amend', {
    method: 'POST',
    params: { tenantId: FH, contractId: c.id },
    body: { ...base, etag: renewed.body.etag },
  });
  assert.equal(noFile.status, 400);
  const amended = await call('tenants/{tenantId}/contracts/{contractId}/amend', {
    method: 'POST',
    params: { tenantId: FH, contractId: c.id },
    body: {
      ...base, location: undefined, locations: ['FH New Orleans', 'FH Baton Rouge'],
      startDate: '2027-01-01', endDate: '2027-12-31', fileId: up3.body.file.id, etag: renewed.body.etag,
    },
  });
  assert.equal(amended.status, 200, JSON.stringify(amended.body));
  assert.deepEqual(amended.body.contract.locations, ['FH New Orleans', 'FH Baton Rouge']);
  assert.deepEqual(amended.body.contract.documents.map((d) => d.kind), ['original', 'renewal', 'amendment']);
  const v = amended.body.contract.versions.at(-1);
  assert.equal(v.summary, 'Amended');
  assert.match(v.changeNotes, /amendment-1\.pdf/);
  assert.match(v.changeNotes, /sites added: FH Baton Rouge/);
  const again = await call('tenants/{tenantId}/contracts/{contractId}/amend', {
    method: 'POST',
    params: { tenantId: FH, contractId: c.id },
    body: { ...base, fileId: up3.body.file.id, etag: amended.body.etag },
  });
  assert.equal(again.status, 400, 'the same file cannot be attached twice');

  const badType = await call('tenants/{tenantId}/contract-files', {
    method: 'POST',
    params: { tenantId: FH },
    headers: { 'content-type': 'application/x-msdownload' },
    raw: new ArrayBuffer(4),
  });
  assert.equal(badType.status, 400);
});

test('clients are isolated and read only', async () => {
  const created = await call('tenants/{tenantId}/contracts', { method: 'POST', params: { tenantId: FH }, body: base });
  const id = created.body.contract.id;
  await call('tenants/{tenantId}/contracts', {
    method: 'POST',
    params: { tenantId: GEAUX },
    body: { ...base, location: 'Volvo - Baton Rouge', department: 'Sales' },
  });

  const own = await call('tenants/{tenantId}/contracts', { caller: fhUser, params: { tenantId: FH } });
  assert.equal(own.status, 200);
  assert.ok(own.body.contracts.every((c) => c.tenantId === FH));

  const other = await call('tenants/{tenantId}/contracts', { caller: fhUser, params: { tenantId: GEAUX } });
  assert.equal(other.status, 403);
  const all = await call('tenants/{tenantId}/contracts', { caller: fhUser, params: { tenantId: 'all' } });
  assert.equal(all.status, 403);

  const write = await call('tenants/{tenantId}/contracts', { caller: fhUser, method: 'POST', params: { tenantId: FH }, body: base });
  assert.equal(write.status, 403);
  const del = await call('tenants/{tenantId}/contracts/{contractId}', {
    caller: fhUser,
    method: 'DELETE',
    params: { tenantId: FH, contractId: id },
    query: { confirm: id },
  });
  assert.equal(del.status, 403);
  const upload = await call('tenants/{tenantId}/contract-files', {
    caller: fhUser,
    method: 'POST',
    params: { tenantId: FH },
    headers: { 'content-type': 'application/pdf' },
    raw: new ArrayBuffer(4),
  });
  assert.equal(upload.status, 403);

  // An id from one tenant is not found under another tenant's prefix.
  const crossRead = await call('tenants/{tenantId}/contracts/{contractId}', { params: { tenantId: GEAUX, contractId: id } });
  assert.equal(crossRead.status, 404);

  const staffAll = await call('tenants/{tenantId}/contracts', { params: { tenantId: 'all' } });
  assert.ok(staffAll.body.contracts.some((c) => c.tenantId === GEAUX));
  assert.ok(staffAll.body.contracts.some((c) => c.tenantId === FH));
});

test('NOIT staff can replace a tenant pick list', async () => {
  const put = await call('tenants/{tenantId}/contract-picklist', {
    method: 'PUT',
    params: { tenantId: OTHER },
    body: { locations: { source: 'list', values: ['Main Office', 'Main Office', ' Annex '] }, departments: { source: 'list', values: ['Accounting'] } },
  });
  assert.equal(put.status, 200);
  assert.deepEqual(put.body.locations, ['Main Office', 'Annex']);
  const denied = await call('tenants/{tenantId}/contract-picklist', {
    caller: fhUser,
    method: 'PUT',
    params: { tenantId: FH },
    body: { locations: { source: 'list', values: ['X'] }, departments: { source: 'list', values: [] } },
  });
  assert.equal(denied.status, 403);
});

// The list is served from a per-tenant snapshot (index/{tenant}.json). It must
// still follow changes made straight to the record blobs, in this instance and
// after a cold start that only has the stored snapshot to go on.
test('the list snapshot follows direct record changes and cold starts', async () => {
  const { BlobServiceClient } = require('@azure/storage-blob');
  const c = BlobServiceClient.fromConnectionString(process.env.CONTRACTS_STORAGE_CONNECTION).getContainerClient('krewereview');
  const list = async () => (await call('tenants/{tenantId}/contracts', { params: { tenantId: GEAUX }, query: { includeArchived: 'true' } })).body.contracts;

  const a = (await call('tenants/{tenantId}/contracts', { method: 'POST', params: { tenantId: GEAUX }, body: { ...base, location: 'Volvo - Baton Rouge', department: 'Sales', title: 'Snapshot A' } })).body.contract;
  const b = (await call('tenants/{tenantId}/contracts', { method: 'POST', params: { tenantId: GEAUX }, body: { ...base, location: 'Volvo - Baton Rouge', department: 'Sales', title: 'Snapshot B' } })).body.contract;
  assert.deepEqual((await list()).map((x) => x.title).filter((t) => t.startsWith('Snapshot')).sort(), ['Snapshot A', 'Snapshot B']);
  assert.ok(await c.getBlobClient(`index/${GEAUX}.json`).exists(), 'snapshot written');

  // Edit A and delete B behind the API's back.
  const pathA = `contracts/${GEAUX}/${a.id}.json`;
  const recA = JSON.parse((await c.getBlobClient(pathA).downloadToBuffer()).toString());
  const edited = JSON.stringify({ ...recA, title: 'Snapshot A edited' });
  await c.getBlockBlobClient(pathA).upload(edited, Buffer.byteLength(edited));
  await c.getBlobClient(`contracts/${GEAUX}/${b.id}.json`).delete();

  const titles = async () => (await list()).map((x) => x.title).filter((t) => t.startsWith('Snapshot')).sort();
  assert.deepEqual(await titles(), ['Snapshot A edited']);

  // Cold start: drop the in-memory cache; the stored snapshot must agree.
  store.resetContractStoreForTests();
  assert.deepEqual(await titles(), ['Snapshot A edited']);

  // A corrupt snapshot is ignored and rebuilt, never served.
  await c.getBlockBlobClient(`index/${GEAUX}.json`).upload('not json', 8);
  store.resetContractStoreForTests();
  assert.deepEqual(await titles(), ['Snapshot A edited']);

  // Snapshots sit outside contracts/, so they never show up as agreements, and
  // another tenant's list is untouched.
  const fh = (await call('tenants/{tenantId}/contracts', { params: { tenantId: FH } })).body.contracts;
  assert.ok(fh.every((x) => x.tenantId === FH));
});
