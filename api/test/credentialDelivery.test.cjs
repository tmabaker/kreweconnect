const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { constants, generateKeyPairSync, privateDecrypt } = require("node:crypto");

// Tammy, 2026-11-05: password texts go through the CallRail API from the Geaux
// support number 504-285-9030, not through the managed browser.
function loadDelivery() {
  process.env.CALLRAIL_API_KEY = "test-key";
  process.env.CALLRAIL_ACCOUNT_ID = "506137064";
  delete process.env.CALLRAIL_TRACKING_NUMBER;
  delete process.env.CALLRAIL_COMPANY_ID;
  process.env.CREDENTIAL_DELIVERY_RETRY_MS = "0";
  for (const name of ["credentialDelivery", "config"]) {
    delete require.cache[require.resolve(`../dist/src/lib/${name}.js`)];
  }
  return require("../dist/src/lib/credentialDelivery.js");
}

test("CallRail text goes through the API with company id, support number and approved message", async () => {
  const { sendCallRailPassword } = loadDelivery();
  const calls = [];
  const original = global.fetch;
  global.fetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, json: async () => ({ id: "MSG123" }) };
  };
  try {
    const result = await sendCallRailPassword("+12255550123", "Abcd1234!");
    assert.equal(result.status, "sent");
    assert.equal(result.messageId, "MSG123");
  } finally {
    global.fetch = original;
  }
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /^https:\/\/api\.callrail\.com\/v3\/a\/506137064\/text-messages\.json$/);
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.company_id, "COM33d5bce50ba54d8798a69fb1b10486f6");
  assert.equal(body.tracking_number, "+15042859030");
  assert.equal(body.customer_phone_number, "+12255550123");
  assert.equal(
    body.content,
    "Welcome to Geaux Automotive! Your temporary password is Abcd1234!. You'll need this to access your email and information. Please check your welcome email for information about your dealership groups and support contacts. For IT help, email support@geauxautomotive.com."
  );
});

test("CallRail rejection is not resent, so a password never goes out twice", async () => {
  const { sendCallRailPassword } = loadDelivery();
  let count = 0;
  const original = global.fetch;
  global.fetch = async () => { count += 1; return { ok: false, status: 500, json: async () => ({}) }; };
  try {
    const result = await sendCallRailPassword("+12255550123", "Abcd1234!");
    assert.equal(result.status, "failed");
    assert.match(result.error, /HTTP 500/);
  } finally {
    global.fetch = original;
  }
  assert.equal(count, 1);
});

test("CallRail queue payload is RSA OAEP encrypted", () => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  process.env.CALLRAIL_WORKER_PUBLIC_KEY = Buffer.from(publicKey).toString("base64");
  const modulePath = require.resolve("../dist/src/lib/vendorQueue.js");
  delete require.cache[modulePath];
  const { encryptCallRailPayload } = require(modulePath);
  const encrypted = encryptCallRailPayload("+12255550123", "Abcd1234!");
  assert.doesNotMatch(encrypted, /Abcd1234/);
  const plain = privateDecrypt({
    key: privateKey,
    padding: constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: "sha256",
  }, Buffer.from(encrypted, "base64"));
  const value = JSON.parse(plain.toString("utf8"));
  assert.deepEqual(value, { mobilePhone: "+12255550123", password: "Abcd1234!" });
  plain.fill(0);
});

test("CallRail fails closed before contacting CallRail for a nonapproved password", async () => {
  const { sendCallRailPassword } = loadDelivery();
  const original = global.fetch;
  global.fetch = async () => { throw new Error("CallRail must not be contacted"); };
  let result;
  try {
    result = await sendCallRailPassword("+12255550123", "Abcdef1!");
  } finally {
    global.fetch = original;
  }
  assert.equal(result.status, "failed");
  assert.match(result.error, /exactly four letters/);
});
