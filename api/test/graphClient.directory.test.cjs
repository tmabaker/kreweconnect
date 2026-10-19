const test = require("node:test");
const assert = require("node:assert/strict");

// Stub the app token so graphClient never reaches Entra.
const tokenService = require("../dist/src/lib/tokenService.js");
tokenService.getAppToken = async () => "test-token";
const { fetchUsers } = require("../dist/src/lib/graphClient.js");

const person = {
  id: "11111111-1111-4111-8111-111111111111",
  displayName: "Pat Manager",
  surname: "Manager",
  jobTitle: "Sales Manager",
  userPrincipalName: "pat@example.test",
  accountEnabled: true,
  userType: "Member",
  assignedLicenses: [{ skuId: "sku" }],
};

function stubGraph(rejectBirthdayWith) {
  const urls = [];
  global.fetch = async (url) => {
    urls.push(url);
    if (rejectBirthdayWith && url.includes("birthday")) {
      return new Response(
        JSON.stringify({ error: { code: "UnknownError", message: "403 FORBIDDEN" } }),
        { status: rejectBirthdayWith, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(JSON.stringify({ value: [person] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  return urls;
}

test("directory falls back to base fields when Graph answers birthday with 403", async () => {
  const urls = stubGraph(403);
  const users = await fetchUsers("tenant");
  assert.equal(users.length, 1);
  assert.equal(users[0].displayName, "Pat Manager");
  assert.equal(urls.length, 2);
  assert.ok(!urls[1].includes("birthday"));
});

test("directory still throws when the base fields are forbidden too", async () => {
  global.fetch = async () =>
    new Response(JSON.stringify({ error: { code: "Authorization_RequestDenied", message: "denied" } }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  await assert.rejects(fetchUsers("tenant"), (err) => err.status === 403);
});
