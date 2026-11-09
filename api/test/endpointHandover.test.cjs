const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");

const GEAUX = "4ceb1a80-7fd3-4760-a827-aedf07b8d4fa";

function load() {
  process.env.GEAUX_INTUNE_CLIENT_ID = "intune-app";
  process.env.GEAUX_INTUNE_CLIENT_SECRET = "intune-secret";
  process.env.VSAX_API_KEY = "k";
  process.env.VSAX_API_SECRET = "s";
  process.env.ENDPOINT_POLL_MS = "0";
  process.env.PHONE_NOTICE_VERIFY_MS = "0";
  process.env.GEAUX_MAIL_CLIENT_ID = "mail-app";
  process.env.GEAUX_MAIL_CLIENT_SECRET = "mail-secret";
  process.env.KREWEWORKS_SERVICE_KEY = "svc-key";
  // Fictional contacts: the real ones live only in the app setting (this repo is public).
  process.env.GEAUX_PHONE_VENDORS = JSON.stringify({
    default: { vendor: "Vendor B", email: "b@vendor-b.example" },
    overrides: [{ vendor: "Vendor A", email: "a@vendor-a.example", locations: ["Volvo - Baton Rouge", "Geaux SuperCenter - Baton Rouge", "Geaux CDJR - Denham Springs", "Geaux Ford - Denham Springs"] }],
  });
  for (const n of ["endpointHandover", "phoneVendor", "kreweworksRelay", "credentialDelivery", "config"]) {
    delete require.cache[require.resolve(`../dist/src/lib/${n}.js`)];
  }
  const eh = require("../dist/src/lib/endpointHandover.js");
  eh.resetEndpointTokenCache();
  return { eh, pv: require("../dist/src/lib/phoneVendor.js"), relay: require("../dist/src/lib/kreweworksRelay.js") };
}

// A fake capture: 2 chunks of base64, fingerprint over the whole hash.
const HASH = Buffer.from(Array.from({ length: 1500 }, (_, i) => (i * 7919) % 251)).toString("base64");
const FP = createHash("sha256").update(HASH).digest("hex").slice(0, 16);
function captureFields(extra = []) {
  return [
    { Name: "CFAutopilotMeta", Value: `v1|SER123|PID-1|2|${FP}|2026-11-01` },
    { Name: "CFAutopilotHash1", Value: HASH.slice(0, 1000) },
    { Name: "CFAutopilotHash2", Value: HASH.slice(1000) },
    { Name: "CFAutopilotHash3", Value: "" },
    ...extra,
  ];
}

/** Route table fake for Graph + VSA X. Each handler returns [status, body]. */
function fakeFetch(world) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const method = init.method || "GET";
    calls.push({ url: String(url), method, body: init.body });
    const u = String(url);
    const reply = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => (body === undefined ? "" : JSON.stringify(body)) });
    if (u.includes("/oauth2/v2.0/token")) return reply(200, { access_token: "tok", expires_in: 3600 });
    if (u.includes("vsax.net/api/v3/devices") && u.endsWith("/customFields")) return reply(200, { Data: world.fields || [] });
    if (u.includes("vsax.net/api/v3/devices")) return reply(200, { Data: world.vsaxDevices || [] });
    if (u.includes("/managedDevices?")) return reply(200, { value: world.managed || [] });
    if (/\/managedDevices\/[^/?]+\/wipe$/.test(u)) { world.wiped = (world.wiped || 0) + 1; return reply(204); }
    if (/\/managedDevices\/[^/?]+\?/.test(u)) return reply(200, { id: "md1", deviceActionResults: world.wiped ? [{ actionName: "wipe", actionState: "pending", startDateTime: "2026-11-09T12:00:00Z" }] : (world.actions || []) });
    if (u.includes("windowsAutopilotDeviceIdentities")) {
      if (world.autopilotError) return reply(403, { error: { code: "Forbidden", message: "no" } });
      return reply(200, { value: world.autopilot || [] });
    }
    if (u.endsWith("/importedWindowsAutopilotDeviceIdentities") && method === "POST") return reply(201, { id: "imp1", state: { deviceImportStatus: "pending" } });
    if (u.includes("/importedWindowsAutopilotDeviceIdentities/imp1")) return reply(200, { state: { deviceImportStatus: "complete" } });
    if (u.endsWith("/windowsAutopilotSettings/sync")) return reply(204);
    throw new Error(`unexpected fetch ${method} ${u}`);
  };
  return { fn, calls };
}

async function withFetch(world, body) {
  const original = global.fetch;
  const f = fakeFetch(world);
  global.fetch = f.fn;
  try { return await body(f.calls); } finally { global.fetch = original; }
}

const managedDevice = { id: "md1", deviceName: "GA-BTRC-PC2", serialNumber: "SER123", userPrincipalName: "fparkin@geauxautomotive.com" };
const vsaxDevice = { Identifier: "abc", Name: "GA-BTRC-PC2", OrganizationId: 89 };

test("hash reassembly verifies the fingerprint and refuses truncated or stale captures", () => {
  const { eh } = load();
  const ok = eh.reassembleHash(captureFields());
  assert.equal(ok.hardwareHash, HASH);
  assert.equal(ok.serialNumber, "SER123");
  assert.throws(() => eh.reassembleHash(captureFields([{ Name: "CFAutopilotHash4", Value: "stale" }])), /earlier capture/);
  const swapped = captureFields();
  [swapped[1].Value, swapped[2].Value] = [swapped[2].Value, swapped[1].Value];
  assert.throws(() => eh.reassembleHash(swapped), /fingerprint/);
  assert.throws(() => eh.reassembleHash([]), /never run/);
});

test("managed and registered device: wipe is offered and needs the typed name", async () => {
  const { eh } = load();
  const world = { managed: [managedDevice], autopilot: [{ id: "ap1", serialNumber: "SER123", groupTag: "Geaux Corporate" }], vsaxDevices: [vsaxDevice], fields: captureFields() };
  await withFetch(world, async (calls) => {
    const state = await eh.lookupEndpoint(GEAUX, "ga-btrc-pc2");
    assert.equal(state.recommended, "wipe");
    assert.equal(state.canWipe, true);
    assert.equal(state.canRegister, false);
    assert.doesNotMatch(JSON.stringify(state), new RegExp(HASH.slice(0, 40)));
    await assert.rejects(eh.wipeEndpoint(GEAUX, "GA-BTRC-PC2", "GA-BTRC-PC"), /Type the device name exactly/);
    assert.equal(world.wiped, undefined);
    const result = await eh.wipeEndpoint(GEAUX, "GA-BTRC-PC2", "ga-btrc-pc2");
    assert.equal(world.wiped, 1);
    assert.equal(result.verified, true);
    assert.equal(result.actionState, "pending");
    const wipe = calls.find((c) => c.url.endsWith("/wipe"));
    assert.deepEqual(JSON.parse(wipe.body), { keepEnrollmentData: false, keepUserData: false });
    // A second wipe while one is pending is refused.
    await assert.rejects(eh.wipeEndpoint(GEAUX, "GA-BTRC-PC2", "GA-BTRC-PC2"), /already pending/);
    assert.equal(world.wiped, 1);
  });
});

test("not in Intune or Autopilot: the VSA X hash is registered and never returned", async () => {
  const { eh } = load();
  const world = { managed: [], autopilot: [], vsaxDevices: [vsaxDevice], fields: captureFields() };
  await withFetch(world, async (calls) => {
    const state = await eh.lookupEndpoint(GEAUX, "GA-BTRC-PC2");
    assert.equal(state.recommended, "register");
    assert.equal(state.canWipe, false);
    await assert.rejects(eh.wipeEndpoint(GEAUX, "GA-BTRC-PC2", "GA-BTRC-PC2"), /Wipe refused/);
    const result = await eh.registerEndpoint(GEAUX, "GA-BTRC-PC2", "GA-BTRC-PC2");
    assert.equal(result.verified, true);
    assert.equal(result.groupTag, "Geaux Corporate");
    assert.doesNotMatch(JSON.stringify(result), new RegExp(HASH.slice(0, 40)));
    const imp = calls.find((c) => c.url.endsWith("/importedWindowsAutopilotDeviceIdentities"));
    const body = JSON.parse(imp.body);
    assert.equal(body.hardwareIdentifier, HASH);
    assert.equal(body.serialNumber, "SER123");
    assert.ok(calls.some((c) => c.url.endsWith("/windowsAutopilotSettings/sync")));
  });
});

test("an unreadable Autopilot list blocks both actions instead of reading as absent", async () => {
  const { eh } = load();
  const world = { managed: [managedDevice], autopilotError: true, vsaxDevices: [vsaxDevice], fields: captureFields() };
  await withFetch(world, async () => {
    const state = await eh.lookupEndpoint(GEAUX, "GA-BTRC-PC2");
    assert.equal(state.autopilot.readable, false);
    assert.equal(state.recommended, "blocked");
    assert.equal(state.canWipe, false);
    assert.equal(state.canRegister, false);
    await assert.rejects(eh.registerEndpoint(GEAUX, "GA-BTRC-PC2", "GA-BTRC-PC2"), /refused/);
  });
});

test("managed but not registered: register first, then wipe", async () => {
  const { eh } = load();
  await withFetch({ managed: [managedDevice], autopilot: [], vsaxDevices: [vsaxDevice], fields: captureFields() }, async () => {
    const state = await eh.lookupEndpoint(GEAUX, "GA-BTRC-PC2");
    assert.equal(state.recommended, "register_then_wipe");
    assert.equal(state.canWipe, false);
    assert.equal(state.canRegister, true);
  });
});

test("other tenants are refused", async () => {
  const { eh } = load();
  await assert.rejects(eh.lookupEndpoint("1956762f-5c5f-41e7-a8dc-ea000d40d2ab", "PC1"), /Geaux Automotive only/);
});

test("phone vendor routing: four stores go to one vendor, everything else to the default", () => {
  const { pv } = load();
  for (const loc of ["Volvo - Baton Rouge", "Geaux SuperCenter - Baton Rouge", "Geaux CDJR - Denham Springs", "Geaux Ford - Denham Springs"]) {
    assert.equal(pv.routeVendor(loc).email, "a@vendor-a.example", loc);
  }
  assert.equal(pv.routeVendor("Geaux Chevrolet - Laplace").email, "b@vendor-b.example");
  assert.equal(pv.routeVendor("Geaux Chevrolet - Laplace").confirmLocation, false);
  const odd = pv.routeVendor("Remote");
  assert.equal(odd.email, "b@vendor-b.example");
  assert.equal(odd.confirmLocation, true);
});

test("phone routing refuses to guess when the vendor setting is missing", () => {
  const { pv } = load();
  delete process.env.GEAUX_PHONE_VENDORS;
  assert.throws(() => pv.routeVendor("Volvo - Baton Rouge"), /GEAUX_PHONE_VENDORS/);
});

test("phone notice names the person, the status and the voicemail reset, and nothing else", () => {
  const { pv } = load();
  const n = pv.buildNotice({ personName: "Frank Parkin", location: "Geaux Ford - Denham Springs", extension: "2007", status: "departure", effectiveDate: "2026-11-07" });
  assert.equal(n.to, "a@vendor-a.example");
  assert.equal(n.from, "support@geauxautomotive.com");
  assert.match(n.body, /Frank Parkin is no longer with Geaux Automotive as of November 7, 2026/);
  assert.match(n.body, /reset the voicemail password on extension 2007 to the extension number/);
  assert.doesNotMatch(n.body, / — | – /);
  assert.throws(() => pv.buildNotice({ personName: "A B", location: "Volvo - Baton Rouge", extension: "20a7", status: "departure" }), /2 to 6 digits/);
  assert.throws(() => pv.buildNotice({ personName: "A B", location: "Volvo - Baton Rouge", extension: "2007", status: "reassign" }), /new user name is required/);
});

test("phone notice send is verified in Sent Items", async () => {
  const { pv } = load();
  const notice = pv.buildNotice({ personName: "Frank Parkin", location: "Geaux Chevrolet - Laplace", extension: "2007", status: "departure" });
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("/oauth2/")) return { ok: true, status: 200, json: async () => ({ access_token: "t", expires_in: 3600 }) };
    if (String(url).endsWith("/sendMail")) return { ok: true, status: 202, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ value: [{ id: "m1", toRecipients: [{ emailAddress: { address: "b@vendor-b.example" } }] }] }) };
  };
  try {
    const r = await pv.sendNotice(GEAUX, notice);
    assert.equal(r.sent, true);
    assert.equal(r.verified, true);
  } finally { global.fetch = original; }
  const send = calls.find((c) => c.url.endsWith("/sendMail"));
  assert.match(send.url, /users\/support%40geauxautomotive\.com\/sendMail$/);
  assert.equal(JSON.parse(send.init.body).message.toRecipients[0].emailAddress.address, "b@vendor-b.example");
});

test("KreweWorks relay sends the service key and the tech's name", async () => {
  const { relay } = load();
  const original = global.fetch;
  let seen;
  global.fetch = async (url, init) => { seen = { url: String(url), init }; return { ok: true, status: 200, json: async () => ({ stage: "it_in_progress", checksSet: ["signInBlocked"] }) }; };
  try {
    const r = await relay.relayToKreweWorks(GEAUX, { upn: "tech@noitgroup.com", name: "tech@noitgroup.com" }, { requestId: "T-20261109-ABC123", items: [{ text: "Block sign-in", ok: true }], itChecks: ["signInBlocked", "bad key!"] });
    assert.equal(r.recorded, true);
  } finally { global.fetch = original; }
  assert.equal(seen.url, "https://yellow-mud-05c042d10.4.azurestaticapps.net/api/service/requests/T-20261109-ABC123/techtools");
  assert.equal(seen.init.headers["X-KreweWorks-Service-Key"], "svc-key");
  const body = JSON.parse(seen.init.body);
  assert.deepEqual(body.itChecks, ["signInBlocked"]);
  assert.equal(body.actor.upn, "tech@noitgroup.com");
  assert.throws(() => relay.normalizeRelay({ requestId: "../../x", items: [{ text: "a" }] }), /request reference/);
});
