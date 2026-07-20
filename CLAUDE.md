# KreweConnect / NOIT Client Tools

Multi-tenant **Employee Directory** (KreweConnect) + **Contract Lifecycle
Manager** (KreweReview) for NO & SE IT Group (an MSP) and its client tenants.

## Read these first (orientation)

A new session should read, in order:

1. **`docs/SESSION-STATE.md`** — current state, locked decisions, what's
   deployed, the credential situation, and prioritized next steps. The canonical
   "pick up where we left off" doc.
2. **`docs/LESSONS-LEARNED.md`** — obstacles already solved (SWA, MSAL/Entra,
   credentials, React Context, cloud-session limits). Don't re-hit these.
3. **`docs/architecture-reset.md`** — the target architecture and the confirmed
   decisions (one .NET backend, Apps365-style per-tenant admin consent, GDAP for
   discovery only).
4. **For KREWE Governance work:** `docs/SESSION-2026-07-08-governance.md` —
   R2/NOC-55 shipped state, the live-DB verification harness (ephemeral Azure
   VM — the container CANNOT reach SQL on 1433), where AWS creds actually live
   (agent process env, not the shell), and the open items (next: NOC-56).

## Core requirement (the north star)

One app, behaving two ways by who logs in: **NOIT staff see all client
tenants; a client sees only its own.** Isolation is keyed to the caller's
token (`tid`) and enforced server-side.

## Repo layout

- `src/` — KreweConnect React/Vite/Fluent frontend (recovered). Deployed to
  `krewesuite.noitgroup.com/app/kreweconnect/` via the SWA workflow.
- `api/` — Azure Functions backend: the working per-tenant client-credentials
  token logic + tenant isolation.
- `apps/governance/` — **KREWE Governance** .NET 8 API (policy template engine,
  variable wizard, assembly, acknowledgment, Entra auth + tenant scoping,
  library write endpoints), reconstructed from the live `krewe-governance-db`
  Azure SQL database (database-first — never migrate it). Live-verified 21/21
  on 2026-07-08; DB seeded with the 3 NIST/CMMC policies; not deployed yet
  (milestone R5). See its `README.md`, `SCHEMA.md`, and
  `docs/SESSION-2026-07-08-governance.md`.
- `noit-client-tools-backend/` — the preserved .NET backend (techtools portal):
  EF Core persistence + full CLM + the GDAP/token logic ported from `api/`.
  Chosen as the consolidation home. Not yet buildable here (missing build
  files); see its `README.md` / `PRESERVATION-MANIFEST.md`.
- `docs/` — orientation + plan + app-registration setup.
- `.claude/skills/` — `azure-ops` (KreweConnect Azure runbook), `noit-ops`
  (AWS Secrets bootstrap + connection verification), `long-horizon-coding`
  (spec-first autonomous run loop), `model-routing` (per-phase model
  assignment), `reverse-engineer-api` (headless-browser capture/replay for
  API-less platforms).

## Conventions

- Develop on the assigned feature branch; keep `main` deployable. Docs/skills/
  the .NET backend dir are `paths-ignore`d from the SWA deploy.
- Commit recovered/at-risk source to git **before** building on it.
- Never paste secrets into chat or commit them; use env vars / Secrets Manager.
- Key IDs: app registration `eaeafccb-5190-48b6-863d-9e13f449acbb`; NOIT tenant
  `7fb15bf6-9cea-4c72-89bd-1ab9f16eec8e`; pilot tenant (Geaux Automotive)
  `4ceb1a80-7fd3-4760-a827-aedf07b8d4fa`.
