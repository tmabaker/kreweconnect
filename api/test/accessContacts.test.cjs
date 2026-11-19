const test = require("node:test");
const assert = require("node:assert/strict");
const { config } = require("../dist/src/lib/config.js");

function withSetting(value, fn) {
  const prev = process.env.ACCESS_CONTACTS;
  if (value === undefined) delete process.env.ACCESS_CONTACTS;
  else process.env.ACCESS_CONTACTS = value;
  try { fn(); } finally {
    if (prev === undefined) delete process.env.ACCESS_CONTACTS;
    else process.env.ACCESS_CONTACTS = prev;
  }
}

test("accessContacts: unset means no contacts", () => {
  withSetting(undefined, () => assert.deepEqual(config.accessContacts, {}));
});

test("accessContacts: keyed by lowercase tenant id, name defaults to email", () => {
  withSetting(JSON.stringify({
    "AAAA-1111": { name: "Help Desk", email: "help@example.com" },
    "bbbb-2222": { email: "it@example.org" },
  }), () => {
    assert.deepEqual(config.accessContacts, {
      "aaaa-1111": { name: "Help Desk", email: "help@example.com" },
      "bbbb-2222": { name: "it@example.org", email: "it@example.org" },
    });
  });
});

test("accessContacts: invalid emails and malformed JSON are ignored", () => {
  withSetting(JSON.stringify({ x: { name: "No", email: "not-an-email" } }), () =>
    assert.deepEqual(config.accessContacts, {}));
  withSetting("{not json", () => assert.deepEqual(config.accessContacts, {}));
  withSetting("[1,2]", () => assert.deepEqual(config.accessContacts, {}));
});
