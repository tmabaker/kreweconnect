const test = require("node:test");
const assert = require("node:assert/strict");
const {
  deploymentReady,
  deploymentSettings,
} = require("../dist/src/lib/readiness.js");

const complete = {
  AZURE_CLIENT_ID: "client",
  AZURE_CLIENT_SECRET: "secret",
  MSP_TENANT_ID: "tenant",
  CONSENT_REDIRECT_URI: "https://example.test/consent",
  CDK_STORAGE_CONNECTION: "storage",
};

test("deployment readiness includes CDK lifecycle storage", () => {
  const settings = deploymentSettings(complete);
  assert.equal(settings.CDK_STORAGE_CONNECTION, true);
  assert.equal(deploymentReady(settings), true);
});

test("deployment is not ready when CDK lifecycle storage is absent", () => {
  const settings = deploymentSettings({ ...complete, CDK_STORAGE_CONNECTION: "" });
  assert.equal(settings.CDK_STORAGE_CONNECTION, false);
  assert.equal(deploymentReady(settings), false);
});
