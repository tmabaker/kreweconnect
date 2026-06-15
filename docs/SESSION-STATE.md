# Session Handoff / State — pick up exactly where we left off

**Last updated:** 2026-06-11. Read this first in any new session, then the
files it points to. Everything below is committed to git (branch `main` and
`claude/brave-feynman-g2j9v5`) unless explicitly marked "not in git".

---

## 0. One-paragraph status

KreweConnect frontend is recovered, deployed, and the foundational
tenant-switching bug is fixed (live). A working per-tenant GDAP backend exists
as Azure Functions (`api/`). We discovered the *real* product backend — a .NET
app ("NOIT Client Tools") that lived only in SharePoint — and began preserving
it into git. Decisions are locked to consolidate onto the .NET backend on the
Apps365 admin-consent model. The one hard blocker is a **rotated app secret**
that only Tammy can refresh from a keyboard; it blocks agent-side Graph testing
but NOT the deployed app.

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

> **PRODUCT STATUS 2026-06-15:** ⚠️ **SECURITY** — a client user
> (guest in NOIT) was being treated as an MSP admin and could see the
> cross-client dashboard/switcher + reach other tenants' directory data. Root
> cause: MSAL authority was pinned to the NOIT single tenant, so every token's
> `tid` was NOIT. **Fix is committed on branch `claude/determined-archimedes-wor91s`
> (commit `798aaac`) but STAGED — not yet on `main`/deployed** (Tammy's call,
> pending the client-consent rollout). The NOIT "All Tenants" merge works; the
> .NET consolidation is optional. See item 0 below before anything else.

0. **⚠️ STAGED SECURITY FIX — deploy once clients are consented.** Client users
   were seeing the MSP dashboard + cross-client switcher + other tenants' data
   because the SPA's MSAL authority was the NOIT single tenant (→ every token
   `tid`=NOIT → `isMspAdmin=true` for everyone, defeating the API's tid
   isolation too). Fix (branch `claude/determined-archimedes-wor91s`, `798aaac`):
   authority → `/organizations` (each user auths in their own tenant) + frontend
   `MspAdminRoute` guards + role-filtered nav so clients see only Directory +
   Org Chart. **Verified 2026-06-15:** product app `eaeafccb` is already
   multi-tenant and the redirect URI is registered (probe returned AADSTS50058,
   not 50194), so the fix won't break sign-in mechanics. **To go live:** (1) send
   each active client its admin-consent URL (Geaux already consented; see the
   onboarding helper `scripts/onboard-client.mjs`); (2) merge the branch → `main`
   to deploy. Client login fails *closed* until a tenant consents (no leak).

1. **DECIDED (Tammy 2026-06-15) — agent identity intent: directory/users read
   + MSP device/Intune ops (cross-tenant).** Full step-by-step in
   `docs/agent-identity-runbook.md`. Remaining (all Tammy portal/env actions):
   (A) add Graph app perms `User.Read.All` + `Directory.Read.All` and — for
   Intune *managed-device inventory* — `DeviceManagementManagedDevices.Read.All`
   (the existing `Device.Read.All` is Entra device objects, not Intune devices),
   then grant NOIT admin consent; (B) make the app multi-tenant + per-client
   consent so ops reach client tenants (today it's single-tenant →
   `AADSTS700016`); (C) open `graph.microsoft.com` in the network policy;
   (D) rotate the leaked secret + re-store as `{clientId,clientSecret,tenantId}`.

2. **DONE on branch `claude/brave-feynman-g2j9v5` (UNVERIFIED — no .NET SDK
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
3. **(Tammy, dev env)** Export the 3 non-search items the build needs:
   second `Enums` file, `TenantContextMiddleware.cs`, and
   `.sln`/`.csproj`/`Migrations/`. Then a fresh session can build/run it.
4. **(Tammy)** Onboard more clients: send each the admin-consent URL, then add
   to the `CLIENT_TENANTS` SWA app setting so they appear in the NOIT all-clients
   view. This is how the multi-client vision is realized in practice. **8 clients
   staged this session** (tenant IDs resolved, consent URLs + merged
   `CLIENT_TENANTS` generated; roster kept out of git per Tammy). Level Homes
   domain still needed. Helper: `scripts/onboard-client.mjs`.
5. **(Tammy, browser) — DONE:** Geaux pilot verified (directory + org chart load
   real data in incognito). Org-chart gaps = managers not set in Geaux's Entra.
6. **(Tammy, hygiene — not urgent)** Scrub the historical plaintext secrets
   from the SharePoint `appsettings.json`. These were init-time values already
   rotated out when AWS Secrets Manager was adopted, so they're dead — cleanup
   only, no active exposure.

## 8. Linear (team "NO SE IT Client", project KreweConnect)

NOC-40 (GDAP/backend — has architecture-discovery + credential comments),
NOC-44 (pilot = Geaux), NOC-50 (source recovery — Done), NOC-51 (repo
privacy — accepted public), NOC-52 (tenant GUIDs — Geaux added, others
placeholder).
