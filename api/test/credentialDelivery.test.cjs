const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { constants, generateKeyPairSync, privateDecrypt } = require("node:crypto");

test("CallRail delivery uses only the encrypted worker queue", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/lib/credentialDelivery.ts"), "utf8");
  assert.match(source, /submitCallRailDelivery/);
  assert.match(source, /encryptCallRailPayload/);
  assert.doesNotMatch(source, /api\.callrail\.com/);
  assert.doesNotMatch(source, /CALLRAIL_API_KEY/);
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

test("CallRail fails closed before queue contact for a nonapproved password", async () => {
  process.env.CALLRAIL_WORKER_PUBLIC_KEY = "configured";
  const modulePath = require.resolve("../dist/src/lib/credentialDelivery.js");
  delete require.cache[modulePath];
  const { sendCallRailPassword } = require(modulePath);
  const result = await sendCallRailPassword("+12255550123", "Abcdef1!");
  assert.equal(result.status, "failed");
  assert.match(result.error, /exactly four letters/);
});
