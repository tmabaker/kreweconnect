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
  CDK_INITIAL_PASSWORD: "configured",
  CALLRAIL_API_KEY: "callrail-secret",
  CALLRAIL_ACCOUNT_ID: "account",
  CALLRAIL_TRACKING_NUMBER: "+15045550100",
  GEAUX_MANAGER_MAIL_SUBJECT: "established encrypted subject",
  GEAUX_MANAGER_MAIL_TRIGGER_HEADER: "X-NOIT-Credential-Delivery",
  GEAUX_MANAGER_MAIL_TRIGGER_VALUE: "geaux-manager-password",
  GEAUX_MANAGER_MAIL_APPLIED_HEADER: "X-NOIT-Encryption-Applied",
  GEAUX_MANAGER_MAIL_APPLIED_VALUE: "true",
  GEAUX_MAIL_CLIENT_ID: "mail-client",
  GEAUX_MAIL_CLIENT_SECRET: "mail-secret",
};

test("deployment readiness includes every lifecycle dependency", () => {
  const settings = deploymentSettings(complete);
  assert.equal(settings.CDK_STORAGE_CONNECTION, true);
  assert.equal(settings.VENDOR_STORAGE_CONNECTION, true);
  assert.equal(settings.CALLRAIL_API_KEY, true);
  assert.equal(deploymentReady(settings), true);
});

test("deployment is not ready when the CDK initial password is absent", () => {
  const settings = deploymentSettings({ ...complete, CDK_INITIAL_PASSWORD: "" });
  assert.equal(settings.CDK_INITIAL_PASSWORD, false);
  assert.equal(deploymentReady(settings), false);
});

test("deployment is not ready when CDK lifecycle storage is absent", () => {
  const settings = deploymentSettings({ ...complete, CDK_STORAGE_CONNECTION: "" });
  assert.equal(settings.CDK_STORAGE_CONNECTION, false);
  assert.equal(deploymentReady(settings), false);
});

test("vendor lifecycle storage can use its dedicated setting", () => {
  const settings = deploymentSettings({ ...complete, VENDOR_STORAGE_CONNECTION: "vendor-storage" });
  assert.equal(settings.VENDOR_STORAGE_CONNECTION, true);
  assert.equal(deploymentReady(settings), true);
});

test("deployment is not ready when shared lifecycle storage is absent", () => {
  const settings = deploymentSettings({ ...complete, CDK_STORAGE_CONNECTION: "", VENDOR_STORAGE_CONNECTION: "" });
  assert.equal(settings.VENDOR_STORAGE_CONNECTION, false);
  assert.equal(deploymentReady(settings), false);
});

test("deployment is not ready when CallRail delivery is absent", () => {
  const settings = deploymentSettings({ ...complete, CALLRAIL_API_KEY: "" });
  assert.equal(settings.CALLRAIL_API_KEY, false);
  assert.equal(deploymentReady(settings), false);
});

test("deployment readiness accepts the production Azure setting aliases", () => {
  const settings = deploymentSettings({
    ...complete,
    Azure_Client_ID: "client",
    MSP_Tenant_ID: "tenant",
    AZURE_CLIENT_ID: "",
    MSP_TENANT_ID: "",
  });
  assert.equal(deploymentReady(settings), true);
});
