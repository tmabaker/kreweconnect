const test = require("node:test");
const assert = require("node:assert/strict");

function loadModule() {
  const path = require.resolve("../dist/src/lib/credentialDelivery.js");
  delete require.cache[path];
  return require(path);
}

test("CallRail delivery uses the approved sender, recipient, and fleet template", async () => {
  process.env.CALLRAIL_API_KEY = "unit-test-key";
  process.env.CALLRAIL_ACCOUNT_ID = "account-id";
  process.env.CALLRAIL_TRACKING_NUMBER = "+15042859030";
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ id: "message-123" }), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const { sendCallRailPassword } = loadModule();
    const result = await sendCallRailPassword("+12255550123", "Abcdef1!");
    assert.deepEqual(result, {
      status: "sent",
      destinationLast4: "0123",
      messageId: "message-123",
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.callrail.com/v3/a/account-id/text-messages.json");
    assert.equal(calls[0].options.headers.Authorization, "Token token=unit-test-key");
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.tracking_number, "+15042859030");
    assert.equal(body.customer_phone_number, "+12255550123");
    assert.match(body.content, /^Welcome to Geaux Automotive!/);
    assert.match(body.content, /support@geauxautomotive\.com\.$/);
  } finally {
    global.fetch = originalFetch;
  }
});

test("CallRail failure returns a scrubbed component result", async () => {
  process.env.CALLRAIL_API_KEY = "unit-test-key";
  process.env.CALLRAIL_ACCOUNT_ID = "account-id";
  process.env.CALLRAIL_TRACKING_NUMBER = "+15042859030";
  const originalFetch = global.fetch;
  global.fetch = async () => new Response("provider details", { status: 503 });
  try {
    const { sendCallRailPassword } = loadModule();
    const result = await sendCallRailPassword("+12255550123", "Abcdef1!");
    assert.equal(result.status, "failed");
    assert.equal(result.destinationLast4, "0123");
    assert.match(result.error, /HTTP 503/);
    assert.doesNotMatch(result.error, /Abcdef1!/);
    assert.doesNotMatch(result.error, /provider details/);
  } finally {
    global.fetch = originalFetch;
  }
});
