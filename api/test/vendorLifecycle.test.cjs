const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

test('vendor lifecycle API accepts only the governed operations and Geaux tenant', () => {
  const source = readFileSync(join(__dirname, '..', 'src', 'functions', 'vendorJobs.ts'), 'utf8');
  assert.match(source, /\["add", "modify", "disable"\]\.includes\(operation\)/);
  assert.match(source, /GEAUX_TENANT_ID/);
  assert.match(source, /Vendor disable requires a NOIT technician/);
});

test('vendor lifecycle jobs initialize both provider states before queueing', () => {
  const source = readFileSync(join(__dirname, '..', 'src', 'lib', 'vendorQueue.ts'), 'utf8');
  assert.match(source, /driveCentric: \{ state: "queued" \}/);
  assert.match(source, /routeOne: \{ state: "queued" \}/);
  assert.match(source, /sendMessage\(Buffer\.from\(JSON\.stringify\(job\)\)\.toString\("base64"\)\)/);
  assert.match(source, /VENDOR_STORAGE_CONNECTION \|\| process\.env\.CDK_STORAGE_CONNECTION/);
  assert.match(source, /submitLifecycleFailureAlert/);
  assert.match(source, /kind: "failure_alert"/);
});

test('vendor lifecycle API exposes submit and authoritative status routes', () => {
  const source = readFileSync(join(__dirname, '..', 'src', 'functions', 'vendorJobs.ts'), 'utf8');
  assert.match(source, /route: "tenants\/\{tenantId\}\/vendor-lifecycle\/jobs"/);
  assert.match(source, /route: "tenants\/\{tenantId\}\/vendor-lifecycle\/jobs\/\{jobId\}"/);
  assert.match(source, /getVendorJobStatus\(jobId\)/);
});

test('vendor lifecycle API passes forceRouteOne through for NOIT technicians only', () => {
  const source = readFileSync(join(__dirname, '..', 'src', 'functions', 'vendorJobs.ts'), 'utf8');
  assert.match(source, /const forceRouteOne = body\.forceRouteOne === true;/);
  assert.match(source, /Forcing RouteOne requires a NOIT technician/);
  assert.match(source, /Forcing RouteOne applies only to a change or a removal/);
  assert.match(source, /\.\.\.\(forceRouteOne \? \{ forceRouteOne: true \} : \{\}\)/);
  const queue = readFileSync(join(__dirname, '..', 'src', 'lib', 'vendorQueue.ts'), 'utf8');
  assert.match(queue, /forceRouteOne\?: boolean;/);
});
