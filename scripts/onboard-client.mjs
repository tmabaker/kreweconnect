#!/usr/bin/env node
/**
 * KreweConnect client onboarding helper.
 *
 * Turns the two error-prone manual steps of onboarding a client tenant into one
 * command:
 *   1. Resolve the client's domain -> Entra tenant ID (no portal hunting).
 *   2. Emit the ready-to-send admin-consent URL.
 *   3. Emit the merged CLIENT_TENANTS JSON to paste into the SWA app setting
 *      (so the client shows up in the NOIT "All Tenants" view).
 *   4. (optional) Verify whether the tenant has already consented.
 *
 * Network: only talks to login.microsoftonline.com (allowed by the env policy).
 * Secrets: never printed. Consent check reads AZURE_CLIENT_SECRET from the
 * environment if --check is passed; if it's absent the check is skipped, not
 * blocked.
 *
 * Usage:
 *   node scripts/onboard-client.mjs --domain geauxautomotive.com --name "Geaux Automotive"
 *   node scripts/onboard-client.mjs --tenant 4ceb1a80-... --name "Geaux Automotive"
 *
 * Merge into the existing setting (so you don't drop the clients already there):
 *   node scripts/onboard-client.mjs --domain acme.com --name "Acme" \
 *     --current '[{"id":"4ceb1a80-7fd3-4760-a827-aedf07b8d4fa","name":"Geaux Automotive"}]'
 *   # or set CLIENT_TENANTS in the environment instead of --current
 *
 * Verify consent (needs AZURE_CLIENT_SECRET in env):
 *   node scripts/onboard-client.mjs --tenant 4ceb1a80-... --name Geaux --check
 */

// These mirror api/src/lib/config.ts defaults; override via env if they ever change.
const CLIENT_ID = process.env.AZURE_CLIENT_ID || "eaeafccb-5190-48b6-863d-9e13f449acbb";
const REDIRECT_URI =
  process.env.CONSENT_REDIRECT_URI || "https://krewesuite.noitgroup.com/app/kreweconnect/";

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--check") {
      args.check = true;
    } else if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

function die(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

/** Resolve a verified domain to its tenant ID via the OIDC discovery doc. */
async function resolveTenantId(domain) {
  const url = `https://login.microsoftonline.com/${encodeURIComponent(domain)}/v2.0/.well-known/openid-configuration`;
  const res = await fetch(url);
  if (!res.ok) {
    die(`could not resolve domain "${domain}" (HTTP ${res.status}). Is it a verified Entra domain?`);
  }
  const doc = await res.json();
  const m = /login\.microsoftonline\.com\/([0-9a-f-]+)\/v2\.0/i.exec(doc.issuer || "");
  if (!m) die(`unexpected discovery document for "${domain}"`);
  return m[1];
}

function buildConsentUrl(tenantId) {
  const params = new URLSearchParams({ client_id: CLIENT_ID, redirect_uri: REDIRECT_URI });
  return `https://login.microsoftonline.com/${tenantId}/adminconsent?${params.toString()}`;
}

/** True if the app can already mint an app-only token against the tenant. */
async function checkConsent(tenantId) {
  const secret = process.env.AZURE_CLIENT_SECRET;
  if (!secret) {
    return { skipped: true, reason: "AZURE_CLIENT_SECRET not set in environment" };
  }
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: secret,
      grant_type: "client_credentials",
      scope: "https://graph.microsoft.com/.default",
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.ok && body.access_token) return { authorized: true };
  return { authorized: false, error: body.error, description: (body.error_description || "").split("\n")[0] };
}

function mergeClientTenants(current, entry) {
  let list = [];
  if (current) {
    try {
      const parsed = JSON.parse(current);
      if (Array.isArray(parsed)) list = parsed.filter((t) => t && typeof t.id === "string");
    } catch {
      die("--current / CLIENT_TENANTS is not valid JSON");
    }
  }
  const idx = list.findIndex((t) => t.id.toLowerCase() === entry.id.toLowerCase());
  if (idx >= 0) list[idx] = entry; // update name if re-onboarding
  else list.push(entry);
  return list;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || (!args.domain && !args.tenant)) {
    console.log(
      [
        "KreweConnect client onboarding helper",
        "",
        "  --domain <d>     client's verified domain (resolved to a tenant ID)",
        "  --tenant <guid>  client's tenant ID (skip domain resolution)",
        "  --name <name>    company display name for the directory card tag",
        "  --current <json> existing CLIENT_TENANTS value to merge into",
        "                   (or set the CLIENT_TENANTS env var)",
        "  --check          verify consent (needs AZURE_CLIENT_SECRET in env)",
        "",
        "Example:",
        '  node scripts/onboard-client.mjs --domain acme.com --name "Acme Corp"',
      ].join("\n")
    );
    process.exit(args.help ? 0 : 1);
  }

  let tenantId = args.tenant;
  if (tenantId && !GUID_RE.test(tenantId)) die(`--tenant "${tenantId}" is not a GUID`);
  if (!tenantId) {
    process.stderr.write(`resolving ${args.domain} ... `);
    tenantId = await resolveTenantId(args.domain);
    process.stderr.write(`${tenantId}\n`);
  }

  const name = typeof args.name === "string" ? args.name : "";
  if (!name) die("--name is required (the company display name)");

  const consentUrl = buildConsentUrl(tenantId);
  const merged = mergeClientTenants(args.current || process.env.CLIENT_TENANTS, { id: tenantId, name });

  let consentStatus = null;
  if (args.check) consentStatus = await checkConsent(tenantId);

  console.log("\n=== KreweConnect onboarding: " + name + " ===\n");
  console.log("Tenant ID:   " + tenantId);
  console.log("App (client) ID: " + CLIENT_ID);
  console.log("");
  console.log("1) Send this admin-consent URL to the client's Global Admin");
  console.log("   (or open it yourself if your GDAP grants GA in their tenant):\n");
  console.log("   " + consentUrl + "\n");
  console.log("2) Set this as the SWA app setting CLIENT_TENANTS (replaces current value):\n");
  console.log("   " + JSON.stringify(merged) + "\n");
  console.log("   (then the client appears in the NOIT \"All Tenants\" view)\n");

  if (consentStatus) {
    if (consentStatus.skipped) {
      console.log("3) Consent check skipped: " + consentStatus.reason);
    } else if (consentStatus.authorized) {
      console.log("3) Consent check: AUTHORIZED ✓  (app-only token acquired)");
    } else {
      console.log(
        "3) Consent check: NOT yet authorized" +
          (consentStatus.error ? ` (${consentStatus.error})` : "") +
          " — have them complete step 1."
      );
    }
  }
}

main().catch((e) => die(e?.message || String(e)));
