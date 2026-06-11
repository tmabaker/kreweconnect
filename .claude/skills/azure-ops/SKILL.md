---
name: azure-ops
description: Verify, configure, and test the KreweConnect Azure/Microsoft Graph environment without Tammy's manual involvement — credential discovery, per-tenant consent checks, live-site smoke tests, SWA settings verification, and deploy watching. Use when asked to verify Azure/Graph settings, test the deployed app/API, check tenant consent, or diagnose KreweConnect production issues.
---

# KreweConnect Azure Operations

Operational runbook for autonomous verification and testing of the
KreweConnect stack (Azure Static Web App + managed Functions API +
Microsoft Graph multi-tenant access).

## Key identifiers

| Thing | Value |
|---|---|
| App registration (client ID) | `eaeafccb-5190-48b6-863d-9e13f449acbb` |
| MSP (NOIT) tenant | `7fb15bf6-9cea-4c72-89bd-1ab9f16eec8e` |
| Pilot tenant (Geaux Automotive) | `4ceb1a80-7fd3-4760-a827-aedf07b8d4fa` |
| Production site | `https://krewesuite.noitgroup.com/app/kreweconnect/` |
| API base | `https://krewesuite.noitgroup.com/api` |
| SWA default hostname | `calm-grass-0e7911e0f.7.azurestaticapps.net` |
| Deploy workflow | `.github/workflows/azure-static-web-apps.yml` (push to `main`) |

## Step 0 — Credential discovery (run first, degrade gracefully)

Check in this order; use the first that works and note which level of
access is available this session:

1. **Env vars (preferred):** `KC_AZURE_CLIENT_SECRET` (+ optional
   `KC_AZURE_CLIENT_ID`, `KC_MSP_TENANT_ID` — default to the table above).
   ARM access: `KC_ARM_CLIENT_ID` / `KC_ARM_CLIENT_SECRET` /
   `KC_ARM_SUBSCRIPTION_ID`.
2. **AWS Secrets Manager fallback:** if `AWS_ACCESS_KEY_ID` is set,
   `pip install boto3` and fetch the secret named in `KC_AWS_SECRET_NAME`
   (JSON object with the keys above).
3. **Neither present:** report which checks below are possible without
   credentials (health endpoint, deploy status, unauthenticated API
   behavior) and which are blocked. Never ask the user to paste a secret
   into chat.

Also probe network reach before promising anything (the environment's
allowlist governs): `login.microsoftonline.com`, `graph.microsoft.com`,
`management.azure.com`, `krewesuite.noitgroup.com`. A proxy 403 or
"Host not in allowlist" means the domain must be added in the Claude
environment's network policy — tell the user; do not retry around it.

## Verification procedures

### A. Tenant consent check (needs client secret + login.microsoftonline.com)

Client-credentials token against the *target tenant's* authority proves
admin consent. Per tenant:

```bash
curl -s -X POST "https://login.microsoftonline.com/<TENANT_ID>/oauth2/v2.0/token" \
  -d "client_id=<CLIENT_ID>&client_secret=<SECRET>&grant_type=client_credentials&scope=https://graph.microsoft.com/.default"
```

- `access_token` returned → consent in place.
- `AADSTS700016` / `65001` → tenant has not consented; consent URL:
  `https://login.microsoftonline.com/<TENANT_ID>/adminconsent?client_id=<CLIENT_ID>&redirect_uri=https://krewesuite.noitgroup.com/app/kreweconnect/`
- `AADSTS7000215` → the client secret is wrong/expired → rotate in the
  app registration and update the SWA app setting `AZURE_CLIENT_SECRET`.

### B. Graph data check (needs token from A + graph.microsoft.com)

```bash
curl -s "https://graph.microsoft.com/v1.0/users?\$top=5&\$select=id,displayName" \
  -H "Authorization: Bearer <TOKEN>"
```
A 403 with a valid token → `User.Read.All` application permission
missing or not consented in that tenant.

### C. Live deployment health (no credentials needed)

- `GET https://krewesuite.noitgroup.com/api/health` → `apiVersion` +
  booleans for each backend app setting (booleans report raw env vars;
  client ID and MSP tenant ID have safe code defaults, the secret does not).
- `GET https://krewesuite.noitgroup.com/api/tenants/home/users` without
  auth → expect JSON `auth_error` (proves API routing + code execute).
- `GET https://krewesuite.noitgroup.com/app/kreweconnect/` → page should
  reference the current `assets/index-*.js` hash from the latest build.

### D. SWA configuration via ARM (needs ARM service principal + management.azure.com)

Token: same client-credentials call as A but against the MSP tenant with
`scope=https://management.azure.com/.default` and the ARM SP's ID/secret.
Then `GET /subscriptions/<SUB>/providers/Microsoft.Web/staticSites?api-version=2024-04-01`
to find the site, and `POST .../listAppSettings?api-version=2024-04-01`
to verify (names only — never echo values into chat or commits).

### E. Deploy watch (GitHub)

Deploys trigger on push to `main`. Poll
`https://api.github.com/repos/tmabaker/kreweconnect/actions/runs?branch=main&per_page=1`
in a background loop (20s interval). Typical durations: ~2-4 min;
first-ever Functions provisioning can exceed the deploy action's 10-min
polling window and report failure ("Upload Timed Out") even though Azure
finishes server-side — verify via procedure C before re-running.

## Known failure modes (encountered 2026-06-10)

| Symptom | Cause | Fix |
|---|---|---|
| Deploy: "No matching Static Web App was found or the api key was invalid" | SWA deployment authorization policy was GitHub-OIDC, not token | SWA → Settings → Configuration → Deployment configuration → "Deployment token"; refresh token into repo secret `AZURE_STATIC_WEB_APPS_API_TOKEN` |
| API always answers "Token missing tid claim" | SWA overwrites `Authorization` before managed functions | SPA sends token in `X-KreweConnect-Auth`; API reads it first (already implemented) |
| Login lands on marketing page | `VITE_REDIRECT_URI` missing from build env | Set in workflow `Build SPA` step (already implemented) |
| Health shows settings `false` despite portal entries | Values saved in wrong environment or name typo | Code defaults cover client ID + MSP tenant ID; the secret must exist as `AZURE_CLIENT_SECRET` in the SWA's Production environment variables |

## Standing rules

- Secrets: never print values, never commit them, never relay them in chat.
- Push code to `claude/...` working branch first, then fast-forward `main`
  to deploy (Tammy authorized direct `main` pushes for deployment on 2026-06-10).
- Update Linear (team "NO SE IT Client", project KreweConnect) when a
  milestone changes state: NOC-40 (GDAP/backend), NOC-44 (pilot), NOC-52
  (tenant GUIDs), NOC-51 (repo privacy).
