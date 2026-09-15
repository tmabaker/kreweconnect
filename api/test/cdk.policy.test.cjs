const test = require("node:test");
const assert = require("node:assert/strict");
const {
  deriveDmsUserId,
  resolveCDK,
  temporaryPassword,
} = require("../dist/src/lib/cdkMatrix.js");

test("stable matrix rows authorize deterministic CDK provisioning", () => {
  const result = resolveCDK("Geaux Chevrolet - West", "Service", "Service Advisor");
  assert.equal(result.state, "ok");
  assert.equal(result.cdkRequired, true);
  assert.equal(result.reviewRequired, false);
  assert.equal(result.store.storeId, "S100187469");
  assert.equal(result.profile, "SADV");
  assert.deepEqual(result.accounts, ["GCW-S"]);
});

test("working matrix rows pause for NOIT review", () => {
  const result = resolveCDK("Geaux Chevrolet - West", "Accounting", "Controller");
  assert.equal(result.cdkRequired, true);
  assert.equal(result.reviewRequired, true);
});

test("no access titles never queue CDK", () => {
  const result = resolveCDK("Geaux Chevrolet - West", "Sales", "Sales Advisor");
  assert.equal(result.state, "no-access");
  assert.equal(result.cdkRequired, false);
});

test("DMS user ids are derived without manager input", () => {
  assert.equal(deriveDmsUserId("Charles", "Landry"), "clandry");
  assert.equal(deriveDmsUserId("Jean", "D'Arcy-Smith"), "jdarcysm");
});

test("CDK temporary passwords are generated in memory", () => {
  const first = temporaryPassword();
  const second = temporaryPassword();
  assert.equal(first.length, 18);
  assert.notEqual(first, second);
  assert.match(first, /^[A-Za-z0-9!@#$]+$/);
});
