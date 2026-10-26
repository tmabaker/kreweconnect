const test = require("node:test");
const assert = require("node:assert/strict");

// Stub the app token so graphClient never reaches Entra.
const tokenService = require("../dist/src/lib/tokenService.js");
tokenService.getAppToken = async () => "test-token";
const { fetchAimMembers, fetchAimMembersAllTenants, isAimMember } = require("../dist/src/lib/graphClient.js");

const json = (body) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

test("tenant without the KreweAIM group has no members and is not an error", async () => {
  global.fetch = async () => json({ value: [] });
  assert.deepEqual(await fetchAimMembers("tenant", "KreweAIM Members"), { groupFound: false, memberIds: [] });
});

test("members are read transitively and paged", async () => {
  const urls = [];
  global.fetch = async (url) => {
    urls.push(url);
    if (url.includes("/groups?")) return json({ value: [{ id: "g1" }] });
    if (url.includes("skiptoken")) return json({ value: [{ id: "u2" }] });
    return json({ value: [{ id: "u1" }], "@odata.nextLink": "https://graph.microsoft.com/v1.0/next?skiptoken=x" });
  };
  const r = await fetchAimMembers("tenant", "KreweAIM Members");
  assert.deepEqual(r, { groupFound: true, memberIds: ["u1", "u2"] });
  assert.ok(urls[0].includes(encodeURIComponent("displayName eq 'KreweAIM Members'")));
  assert.ok(urls[1].includes("/groups/g1/transitiveMembers/microsoft.graph.user"));
});

test("group name quotes are escaped for OData", async () => {
  const urls = [];
  global.fetch = async (url) => {
    urls.push(url);
    return json({ value: [] });
  };
  await fetchAimMembers("tenant", "O'Brien AIM");
  assert.ok(urls[0].includes(encodeURIComponent("displayName eq 'O''Brien AIM'")));
});

test("all tenants view skips unreachable tenants and counts them", async () => {
  // The tenant travels in the token, not the URL, so key the failure on the token.
  const original = tokenService.getAppToken;
  tokenService.getAppToken = async (tenantId) => `token-${tenantId}`;
  global.fetch = async (_url, init) => {
    if (String(init?.headers?.Authorization ?? init?.headers?.authorization ?? "").includes("token-bad")) {
      throw new Error("unreachable");
    }
    return json({ value: [] });
  };
  try {
    const r = await fetchAimMembersAllTenants([{ id: "bad", name: "x" }, { id: "ok", name: "y" }], "KreweAIM Members");
    assert.deepEqual(r, { groupFound: false, memberIds: [], failedTenants: 1 });
  } finally {
    tokenService.getAppToken = original;
  }
});

test("enrollment asks Graph about the caller only", async () => {
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url, method: init?.method ?? "GET", body: init?.body });
    if (url.includes("/groups?")) return json({ value: [{ id: "g1" }] });
    if (url.includes("/checkMemberGroups")) return json({ value: JSON.parse(init.body).groupIds.includes("g1") ? ["g1"] : [] });
    throw new Error("unexpected " + url);
  };
  assert.equal(await isAimMember("tenant", "KreweAIM Members", "u1"), true);
  assert.equal(calls.length, 2);
  assert.match(calls[1].url, /directoryObjects\/u1\/checkMemberGroups/);
  assert.equal(calls[1].method, "POST");
});

test("enrollment falls back to the member list when the targeted check is not permitted", async () => {
  global.fetch = async (url) => {
    if (url.includes("/groups?")) return json({ value: [{ id: "g1" }] });
    if (url.includes("/checkMemberGroups")) return new Response(JSON.stringify({ error: { code: "Authorization_RequestDenied" } }), { status: 403 });
    return json({ value: [{ id: "u1" }] });
  };
  assert.equal(await isAimMember("tenant", "KreweAIM Members", "u1"), true);
  assert.equal(await isAimMember("tenant", "KreweAIM Members", "u2"), false);
});

test("no KreweAIM group means not enrolled", async () => {
  global.fetch = async () => json({ value: [] });
  assert.equal(await isAimMember("tenant", "KreweAIM Members", "u1"), false);
});
