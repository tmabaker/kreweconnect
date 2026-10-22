const test = require("node:test");
const assert = require("node:assert/strict");

// Stub the app token so graphClient never reaches Entra.
const tokenService = require("../dist/src/lib/tokenService.js");
tokenService.getAppToken = async () => "test-token";
const { fetchAimMembers, fetchAimMembersAllTenants } = require("../dist/src/lib/graphClient.js");

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

test("all tenants view skips unreachable tenants", async () => {
  global.fetch = async (url) => {
    if (url.includes("bad")) throw new Error("unreachable");
    return json({ value: [] });
  };
  const r = await fetchAimMembersAllTenants([{ id: "bad", name: "x" }, { id: "ok", name: "y" }], "KreweAIM Members");
  assert.deepEqual(r, { groupFound: false, memberIds: [] });
});
