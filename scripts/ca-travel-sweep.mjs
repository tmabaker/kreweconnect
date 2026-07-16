// Daily CAP Config sweep: activates travel CA plans whose start date has
// arrived and tears down plans past their end date, across every tenant the
// backend knows about (CLIENT_TENANTS + the NOIT home tenant).
//
// Runs from .github/workflows/ca-travel-sweep.yml. Authenticates as the
// KreweConnect app itself (client credentials for its own API audience) —
// the backend accepts app tokens from the MSP tenant as MSP-admin callers.
//
// Env:
//   KC_CLIENT_SECRET  (required) — app client secret (Actions secret)
//   KC_CLIENT_ID      (default: the KreweConnect app id)
//   MSP_TENANT_ID     (default: the NOIT tenant id)
//   API_BASE          (default: https://krewesuite.noitgroup.com)

const CLIENT_ID = process.env.KC_CLIENT_ID || "eaeafccb-5190-48b6-863d-9e13f449acbb";
const TENANT_ID = process.env.MSP_TENANT_ID || "7fb15bf6-9cea-4c72-89bd-1ab9f16eec8e";
const API_BASE = (process.env.API_BASE || "https://krewesuite.noitgroup.com").replace(/\/$/, "");
const SECRET = process.env.KC_CLIENT_SECRET;

if (!SECRET) {
  console.error("KC_CLIENT_SECRET is not set — add it as a repository Actions secret.");
  process.exit(1);
}

const tokenResp = await fetch(
  `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
  {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: SECRET,
      grant_type: "client_credentials",
      scope: `api://${CLIENT_ID}/.default`,
    }),
  }
);
if (!tokenResp.ok) {
  console.error(`Token request failed: ${tokenResp.status} ${await tokenResp.text()}`);
  process.exit(1);
}
const { access_token: token } = await tokenResp.json();

const api = (path, init = {}) =>
  fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-KreweConnect-Auth": `Bearer ${token}`,
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });

const tenantsResp = await api("/api/tenants");
if (!tenantsResp.ok) {
  console.error(`GET /api/tenants failed: ${tenantsResp.status} ${await tenantsResp.text()}`);
  process.exit(1);
}
const tenants = (await tenantsResp.json()).value ?? [];
tenants.push({ id: TENANT_ID, name: "NOIT (home)" });

let activated = 0;
let removed = 0;
let skipped = 0;

for (const t of tenants) {
  try {
    const resp = await api(`/api/tenants/${t.id}/travelPlans/sweep`, { method: "POST" });
    if (!resp.ok) {
      // Tenants without admin consent (or with no CA access) can't have
      // plans staged through this tool — log and move on.
      const body = await resp.text();
      console.log(`~ ${t.name}: sweep skipped (${resp.status}) ${body.slice(0, 120)}`);
      skipped++;
      continue;
    }
    const { actions } = await resp.json();
    for (const a of actions ?? []) {
      if (a.action === "activated") activated++;
      if (a.action === "removed") removed++;
      const suffix = a.detail ? ` — ${a.detail}` : "";
      console.log(`  ${t.name}: [${a.action}] ${a.policyName}${suffix}`);
    }
    if (!actions?.length) console.log(`  ${t.name}: no travel plans`);
  } catch (err) {
    console.log(`~ ${t.name}: sweep error — ${err.message}`);
    skipped++;
  }
}

console.log(
  `Done: ${activated} activated, ${removed} removed, ${skipped} tenant(s) skipped, ${tenants.length} tenant(s) checked.`
);
