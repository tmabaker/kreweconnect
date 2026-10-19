const test = require("node:test");
const assert = require("node:assert/strict");
const { config } = require("../dist/src/lib/config.js");

test("kreweworks portals: default, app setting, and bad entries dropped", () => {
  delete process.env.KREWEWORKS_PORTALS;
  assert.equal(config.kreweworksPortals.length, 1);
  process.env.KREWEWORKS_PORTALS = JSON.stringify({
    "AAAAAAAA-0000-4000-8000-000000000001": "https://portal.example.test/",
    "aaaaaaaa-0000-4000-8000-000000000002": "http://not-https.example.test",
    "aaaaaaaa-0000-4000-8000-000000000003": 42,
  });
  assert.deepEqual(config.kreweworksPortals, [
    { tenantId: "aaaaaaaa-0000-4000-8000-000000000001", url: "https://portal.example.test" },
  ]);
  process.env.KREWEWORKS_PORTALS = "not json";
  assert.equal(config.kreweworksPortals.length, 1);
  delete process.env.KREWEWORKS_PORTALS;
});
