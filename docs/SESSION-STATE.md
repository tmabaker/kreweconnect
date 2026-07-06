# Session Handoff / State — pick up exactly where we left off

**Last updated:** 2026-06-18. Read this first in any new session, then the
files it points to. `main` holds the latest deployed work — `git fetch && git
checkout main`.

> ⚠️ **This repo is PUBLIC.** No secret values or the client-tenant roster live
> here. Full **credential notes + access paths** are in the private
> **SharePoint handoff**: `sites/tabcc → Shared Documents → KreweConnect → docs
> → SESSION-HANDOFF-2026-06-18.md` (and Linear). Make the repo private — NOC-51.

---

## 0Z. ACCESS PATHS (2026-06-18) — identities only; secrets/roster in SharePoint

- **Taila delegated** (`taila@noitgroup.com`) — primary agent identity, headless.
  Refresh token in SharePoint `Agent Workspace/Taila/kc-claude-auth.json`;
  bootstrap = read it via the M365 connector → refresh against public client
  `14d82eec-204b-4c2f-b7e8-296a70dab67e` → re-store rotated token. Scopes incl.
  `Sites/Files.ReadWrite.All`, `Application.Read/ReadWrite.All`,
  `Policy.ReadWrite.ConditionalAccess`. (Steps in the `noit-ops` skill.) No ARM.
- **MS Claude Agent / "Taila Agent"** app `90f52d62-…` (secret `noit/0626_MSClaudeAgent`)
  — app-only Graph (NOIT) **and Azure ARM Contributor** on subs
  `e9251b04…` + `567260a7…` (RGs: CIPP, cipp-swa-orq6j, noit-techportal,
  **krewesuite**). Use for SWA app settings (read/set `CLIENT_TENANTS`, read the
  live `AZURE_CLIENT_SECRET`).
- **eaeafccb** (KreweConnect app): `User.Read.All` **[App, READ-ONLY]** — cannot
  PATCH users. Live secret only in the **`krewesuite` SWA** app settings (read via
  ARM). AWS `noit/azure-taila-agent` copy is dead.
- **KreweConnect SWA** = `krewesuite` · RG `krewesuite_group` · sub `567260a7…` ·
  host `red-dune-0b9e42210`. `witty-coast-02d8d4d0f` = the unrelated `noit-techportal`
  SWA. **CIPP** `cipporq6j` (RG `cipp`, sub `e9251b04…`) — API 503s from the agent
  egress; healthy via browser. AWS: `GetSecretValue` only, prefix `noit/`.
- **Client tenant IDs** (real, 12 clients): in SharePoint handoff + Linear NOC-52.
  `CLIENT_TENANTS` (SWA app setting) currently has 6 consented tenants.

## 0Y. SHIPPED THIS SESSION (2026-06-18) — PRs #3–#8, all live on `main`

1. MSAL v4 `initialize()` white-screen fix (awaited before render).
2. Multi-tenant authority `/organizations` (client users keep their own `tid`).
3. Consent `/status` now does a real `/users` read (no false "authorized").
4. Post-login **redirect loop** fix (`handleRedirectPromise` before render +
   `navigateToLoginRequestUrl:false`); login copy → "Enter your Microsoft username…".
5. **Real tenant list:** `GET /api/tenants` from `CLIENT_TENANTS`; removed fake
   placeholder GUIDs from `tenantConfig.ts` (they made broken consent URLs + leaked
   the roster). Set `CLIENT_TENANTS` on the SWA (6 tenants).
6. **Photos:** all users, progressive, and in the All-Tenants view (per-user tenant).
   Reality: few users have photos (~6/199 at Geaux).
7. **Filters:** dropped phone-number "Location" (officeLocation); "Company" → "Location"
   (`companyName`); **licensed non-guest users only** (server-side).
8. Entra: added Web redirect URI to `eaeafccb` for `/adminconsent`.

**In progress:** Geaux directory remediation (normalize company/dept/title/phone/
address from an admin spreadsheet). Dry-run files in SharePoint. **Write blocked**
— eaeafccb is read-only in Geaux; needs `User.ReadWrite.All` via GDAP/remediation
identity. Open: GDAP expansion (CIPP + partner.microsoft.com), make repo private,
rotate `noit/0626_MSClaudeAgent`, CIPP egress.

---

## (historical below — 2026-06-16)


## 0. One-paragraph status (2026-06-16)

KreweConnect is live and being onboarded to real clients. A **critical
client-isolation bug was fixed and deployed** (MSAL authority was the NOIT single
tenant → every user looked like an MSP admin; now `/organizations` +
`MspAdminRoute` guards). The directory gained **per-employee `companyName`
filtering, click-to-contact links (email/Teams/office/mobile), and work
anniversary + birthday (MM/DD)** sourced from a configurable custom extension
attribute (12/31 = opt-out). Org-chart crash + app-blanking fixed (cycle guard +
error boundaries). **Onboarding is in progress**; tenant-ID/domain resolution by
guessing proved unreliable, so **wiring CIPP `ListTenants` is the key unblock**
(still pending env config + a fresh session). All frontend/api work is on `main`
and auto-deploys via SWA.

## 0a. 2026-06-16 — deployed this session

- **SECURITY (deployed):** client users no longer see the MSP dashboard /
  cross-client switcher / other tenants' data. Root cause + fix in
  LESSONS-LEARNED (single-tenant MSAL authority).
- **Directory UX (deployed):** filters open by default; **Company filter uses
  Graph `companyName`** (per-employee location, not org name); contact links
  (mailto / Teams deep link / `tel:` office+mobile); **work anniversary +
  birthday MM/DD** rendered only when populated; tenant-GUID label removed.
- **Birthday/anniversary source:** app settings **`BIRTHDAY_ATTRIBUTE`** /
  **`ANNIVERSARY_ATTRIBUTE`** name the Graph attribute (directory extension or
  `extensionAttributeN`); empty → standard `birthday`/`employeeHireDate`.
  **OPEN:** Tammy to provide the exact attribute name + set the app setting.
- **Resilience:** `/users` falls back to base `$select` on 400/404; Graph errors
  now surface code+message+request-id. Org-chart cycle guard + top-level &
  per-route ErrorBoundary.

## 0b. OPEN / next (2026-06-16)

1. **CIPP access** — still not connected (no AWS creds in-session; env changes
   need a new session). Runbook `docs/cipp-access-setup.md` + `scripts/
   verify_cipp.py` ready. Unblocks authoritative domain↔tenant lookups.
2. **Level BR / Engquist directory 404** — freshly consented tenant returns
   "Graph 404"; redeployed with detailed error surfacing — get the real error
   line; likely consent-propagation (retry after ~15 min).
3. **Set `BIRTHDAY_ATTRIBUTE`** once Tammy supplies the attribute name.
4. **Finish onboarding** the remaining consented clients (consent + add to the
   `CLIENT_TENANTS` SWA app setting). Tenant roster kept OUT of the public repo —
   it's in Linear (NOC-52) + the SharePoint handoff doc.
5. Cosmetic: friendly "consent complete" landing for the `?admin_consent=True`
   redirect (currently blank).

---
## 1. Key identifiers

| Thing | Value |
|---|---|
| App registration (shared by everything) | `eaeafccb-5190-48b6-863d-9e13f449acbb` |
| NOIT (MSP/home) tenant | `7fb15bf6-9cea-4c72-89bd-1ab9f16eec8e` |
| Pilot tenant — Geaux Automotive | `4ceb1a80-7fd3-4760-a827-aedf07b8d4fa` |
| Frontend (deployed) | `https://krewesuite.noitgroup.com/app/kreweconnect/` |
| API health (anon) | `https://krewesuite.noitgroup.com/api/health` |
| .NET portal | `https://techtools.noitgroup.com` |
| Repo | `tmabaker/kreweconnect` (work branch `claude/brave-feynman-g2j9v5`) |
| AWS Secrets region | `us-east-1`, prefix `noit/` |

## 2. Decisions locked (2026-06-11)

1. **Home backend = the .NET "NOIT Client Tools" backend.** Port the Functions
   API's per-tenant token logic into its `GdapService` (replaces the
   `NotImplementedException`).
2. **Auth = per-tenant admin consent** (Apps365-style). **GDAP is OFF** the
   auth path; used only for **tenant discovery**.
3. Single secret store → AWS Secrets Manager (confirm at execution).
4. Keep `techtools` and `krewesuite` as separate domains for now.

Full rationale: `docs/architecture-reset.md`.

## 3. What is DEPLOYED / live right now

- SWA deploys from THIS repo via `.github/workflows/azure-static-web-apps.yml`
  on push to `main` (landing pages pulled from `tmabaker/krewesuite` + SPA in
  backend mode + `api/` Functions). Deployment authorization policy was changed
  to **deployment token** (not GitHub OIDC).
- Last good deploy: run #8 (tenant-context fix). To check state without creds:
  `GET /api/health` → expect `apiVersion 0.3.0`; `AZURE_CLIENT_ID` and
  `MSP_TENANT_ID` may show `false` (they have safe code defaults), the others
  `true`.
- Frontend fixes live: MSAL redirect URI, `X-KreweConnect-Auth` header (SWA
  overwrites `Authorization`), tenant-context React Context fix, client-tenant
  pinning.
- **Directory enhancements live:** Job Title filter, Location filter, company
  name on cards (run #11).
- **NOIT "all clients" aggregated view live:** selecting "All Tenants" (MSP
  admins only) merges employees across every configured client tenant, each
  card tagged with its company; clients still see only their own. To add more
  clients to the aggregate, set the **`CLIENT_TENANTS`** app setting in the SWA
  (JSON: `[{"id":"<tenantGuid>","name":"<Company>"}]`); defaults to Geaux. Each
  added tenant must also have granted admin consent (use the consent URL).

## 4. The credential situation (DEFINITIVE — don't re-litigate)

- **Agent identity (NEW 2026-06-15):** dedicated app **"MS Claude Agent"**,
  client ID **`90f52d62-9133-47e0-a6a1-45c9bec69558`**, in the NOIT tenant
  (`7fb15bf6…`). Secret stored at AWS **`noit/0626_MSClaudeAgent`**. **Verified
  valid** — acquires app-only tokens against the NOIT tenant.
  - **App permissions consented (from token `roles`):** `Device.Read.All`,
    `DeviceManagementConfiguration.ReadWrite.All` (Intune *write*),
    `Calendars.ReadBasic.All`, `APIConnectors.Read.All`,
    `MultiTenantOrganization.Read.All`. **NO `User.Read.All`/`Directory.Read.All`**
    → it CANNOT read users/the directory yet.
  - **Single-tenant** — Geaux returns `AADSTS700016` (app not in client tenants),
    so it acts in NOIT only, not client tenants.
  - **Two blockers before it's usable from a session:** (a) network policy must
    allow `graph.microsoft.com` (tokens work, but Graph calls return "Host not
    in allowlist"); (b) add `User.Read.All`/`Directory.Read.All` + consent if
    directory read is wanted. **OPEN DECISION (Tammy):** what should this
    identity do? → determines which perms to add.
  - **Storage fix needed:** the value was stored as the JSON *key*
    (`{"<secret>": ""}`); read code recovers it via the single key, but please
    re-store as `{"clientId","clientSecret","tenantId"}`. **Also: the secret
    value leaked into the chat transcript via the key/value mixup — ROTATE it
    once setup is settled.**

- **KreweConnect product app `eaeafccb` (separate, unchanged):** its client
  secret was rotated; the **only valid copy is in the SWA app settings**, which
  the deployed app uses (the live pilot works). The old AWS `noit/azure-taila-agent`
  (`6~j…`) and SharePoint `appsettings.json` (`PIO8Q…`) copies are dead but were
  init-time secrets already rotated out — hygiene cleanup, not active exposure.
  "Taila"/OpenClaw authenticates to this app via **device-code** (interactive),
  not via a stored app secret. Don't brute-force user passwords (lockout risk).

## 5. Access / environment state (NOT in git)

- **AWS:** an access key for IAM user `claude_agent` (account `898774460279`,
  scoped read to `noit/*`) was pasted into chat earlier — **must be rotated**;
  then set `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`AWS_DEFAULT_REGION`
  in the Claude environment config (not in repo).
- **Network policy:** this environment only allows GitHub + AWS +
  `login.microsoftonline.com`. **Confirmed 2026-06-15:** `graph.microsoft.com`
  is BLOCKED ("Host not in allowlist") — so the agent can mint tokens but call
  no Graph/Azure. To enable direct agent work, add `graph.microsoft.com` (+
  `management.azure.com` for ARM) under the environment's **Custom** network
  access (see the `noit-ops` skill for the full list).
- **M365 connector:** attached and working (SharePoint/mail/Teams/calendar/
  OneDrive as Tammy) — bypasses the network allowlist.
- **Connection matrix (2026-06-11):** GitHub PAT ✅; everything else under
  `noit/` blocked only by the network allowlist; `noit/azure-taila-agent`
  secret dead; `noit/anthropic` key returned 401; `noit/myitprocess` host
  doesn't resolve; `noit/kaseya-quote-manager` missing base URL. Proposed
  `noit/_index` was delivered to Tammy as a file (write to AWS was denied —
  read-only policy).

## 6. Repo map (what's where)

- `src/` — KreweConnect React frontend (recovered).
- `api/` — Azure Functions backend: working per-tenant client-credentials
  token logic + tenant isolation (`api/src/lib/`). The piece to port into .NET.
- `noit-client-tools-backend/` — preserved .NET backend. **All 45 files
  surfaced by SharePoint search are now captured** (full
  Controllers/Interfaces/Services/Models/DTOs/Enums tree). Still missing,
  and the only things blocking a clean build (must be exported from the dev
  env, not in SharePoint search): a second `Enums` file
  (TenantStatus/AppUserRole/AccessLevel), `Middleware/TenantContextMiddleware.cs`,
  and `.sln`/`.csproj`/EF `Migrations/`. See its `PRESERVATION-MANIFEST.md`.
- `docs/` — `architecture-reset.md` (the plan), `app-registration-setup.md`.
- `.claude/skills/` — `azure-ops` (KreweConnect Azure runbook), `noit-ops`
  (AWS Secrets bootstrap + connection verification).

## 7. NEXT STEPS (priority order)

> **PRODUCT STATUS 2026-06-15:** Both halves of the north star are LIVE and
> verified — clients see only their own tenant; NOIT "All Tenants" merges
> across consented clients. Geaux pilot loads real data. Remaining work is
> onboarding/ops + the agent-enablement + the optional .NET consolidation,
> NOT core product gaps.

0. **OPEN DECISION (Tammy) — agent identity intent.** The new `90f52d62`
   "MS Claude Agent" credential is valid but (a) Graph is network-blocked and
   (b) it lacks directory-read perms + is single-tenant. Decide what it should
   do → then open `graph.microsoft.com` in the network policy and (if directory
   read is wanted) add `User.Read.All`/`Directory.Read.All` + consent. Rotate
   the secret (leaked in transcript) and re-store in proper JSON shape. See §4.

1. **DONE on branch `claude/brave-feynman-g2j9v5` (UNVERIFIED — no .NET SDK
   here; not merged to main):** the whole .NET backend was made build-ready:
   - `GdapService` port — real per-tenant token + GDAP discovery (`9a7f7c1`)
   - `EmployeeSyncService` port — real Graph `/users` fetch (`dfc0cf4`)
   - Reconstructed the 3 build gaps: `Enums/AppEnums.cs`,
     `Middleware/TenantContextMiddleware.cs`, single `NOIT.ClientTools.csproj`
   - New `Middleware/ExceptionHandlingMiddleware.cs`: maps
     `TenantNotAuthorizedException` → 401 `consent_required` + `consentUrl`
   See `noit-client-tools-backend/GDAPSERVICE-PORT-NOTES.md`. Remaining to
   build: `dotnet restore/build` (verify package versions), export real
   `appsettings.Development.json` + EF `Migrations` if using SQL Server.
   **Agent work is blocked here pending the frontend↔backend consolidation
   decision (below) and a deploy target for the .NET backend.**
2. **(Tammy, dev env)** Export the 3 non-search items the build needs:
   second `Enums` file, `TenantContextMiddleware.cs`, and
   `.sln`/`.csproj`/`Migrations/`. Then a fresh session can build/run it.
3. **(Tammy)** Onboard more clients: send each the admin-consent URL, then add
   to the `CLIENT_TENANTS` SWA app setting so they appear in the NOIT all-clients
   view. This is how the multi-client vision is realized in practice.
4. **(Tammy, browser) — DONE:** Geaux pilot verified (directory + org chart load
   real data in incognito). Org-chart gaps = managers not set in Geaux's Entra.
5. **(Tammy, hygiene — not urgent)** Scrub the historical plaintext secrets
   from the SharePoint `appsettings.json`. These were init-time values already
   rotated out when AWS Secrets Manager was adopted, so they're dead — cleanup
   only, no active exposure.

## 8. Linear (team "NO SE IT Client", project KreweConnect)

NOC-40 (GDAP/backend — has architecture-discovery + credential comments),
NOC-44 (pilot = Geaux), NOC-50 (source recovery — Done), NOC-51 (repo
privacy — accepted public), NOC-52 (tenant GUIDs — Geaux added, others
placeholder).
