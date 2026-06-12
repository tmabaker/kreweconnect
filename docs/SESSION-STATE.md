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

## 4. The credential situation (DEFINITIVE — don't re-litigate)

- App `eaeafccb`'s **client secret was rotated**. Verified dead (Entra
  `AADSTS7000215`) in BOTH reachable copies: AWS `noit/azure-taila-agent`
  (value `6~j…`) and the SharePoint `appsettings.json` (value `PIO8Q~…`).
  NOTE (per Tammy): the two SharePoint plaintext values were **init-time
  secrets, already rotated out** when AWS Secrets Manager was adopted — dead
  strings, not an active exposure. Scrubbing them is hygiene, not urgent.
- The **only valid** secret is the one in the **SWA app settings** (created
  during the app-registration update). The deployed app uses it, so the app
  works even though agent sessions cannot mint Graph tokens from here.
- "Taila" is the agent identity (OpenClaw). It authenticates via **device-code
  flow** (interactive, satisfies conditional access) — NOT via the AWS secret
  as a password/app-secret. Repeated agent attempts to reuse that secret fail
  by design. Do not brute-force user passwords (lockout risk to OpenClaw).
- **Unblock = Tammy mints a fresh client secret on `eaeafccb` and stores it
  where the agent can read it (e.g. `noit/azure-taila-agent`).** Until then,
  agent-side Graph/Azure testing is blocked; use the M365 connector for
  home-tenant data.

## 5. Access / environment state (NOT in git)

- **AWS:** an access key for IAM user `claude_agent` (account `898774460279`,
  scoped read to `noit/*`) was pasted into chat earlier — **must be rotated**;
  then set `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`AWS_DEFAULT_REGION`
  in the Claude environment config (not in repo).
- **Network policy:** this environment only allows GitHub + AWS +
  `login.microsoftonline.com`. To let the agent reach Graph/Azure/MSP tools,
  add domains under the environment's **Custom** network access (see the
  `noit-ops` skill for the list). Until then those hosts return
  "Host not in allowlist".
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

1. **DONE (pending review/build):** `GdapService` port — real per-tenant token
   acquisition + GDAP discovery, on branch `claude/brave-feynman-g2j9v5`
   (commit `9a7f7c1`), NOT merged to main, UNVERIFIED (no .NET SDK here). See
   `noit-client-tools-backend/GDAPSERVICE-PORT-NOTES.md`.
   **Next agent task:** port `EmployeeSyncService.SyncTenantAsync` real path —
   call `AcquireTokenForTenantAsync` then `GET /v1.0/users` (paged) → `Employee`.
2. **(Tammy, dev env)** Export the 3 non-search items the build needs:
   second `Enums` file, `TenantContextMiddleware.cs`, and
   `.sln`/`.csproj`/`Migrations/`. Then a fresh session can build/run it.
3. **(Tammy, keyboard)** Mint a fresh client secret on `eaeafccb`; store in
   AWS `noit/azure-taila-agent`. Rotate the pasted AWS key. Optionally widen
   the environment network policy.
4. **(Tammy, browser)** Pilot verification: sign in → switch to Geaux →
   Directory should load real employees (3 prior blockers cleared).
5. **(Tammy, hygiene — not urgent)** Scrub the historical plaintext secrets
   from the SharePoint `appsettings.json`. These were init-time values already
   rotated out when AWS Secrets Manager was adopted, so they're dead — cleanup
   only, no active exposure.

## 8. Linear (team "NO SE IT Client", project KreweConnect)

NOC-40 (GDAP/backend — has architecture-discovery + credential comments),
NOC-44 (pilot = Geaux), NOC-50 (source recovery — Done), NOC-51 (repo
privacy — accepted public), NOC-52 (tenant GUIDs — Geaux added, others
placeholder).
