# KREWE Governance — Recovery Package

**What happened:** Linear **NOC-19** reports KREWE Governance "Phase 3 complete"
(policy template engine, variable-collection wizard, assembly engine, MyITProcess
integration, EF Core + Azure SQL with 9 tables). The **database is live and real**
(`noit-krwgov-0628` / `krewe-governance-db`, DNS- and query-confirmed), but the
**application source code was not found in any repository** — it appears to have
been built in a prior ephemeral session and never pushed to a durable remote.

**What this package is:** the data layer, recovered directly from the live database
on 2026-07-06 and reconstructed as runnable EF Core code, so the app can be rebuilt
against the **existing** database with zero data loss.

## Contents
- `SCHEMA.md` — the full recovered schema (9 tables, exact columns/types/nullability, FKs, ERD) + how it maps to NOC-19.
- `src/` — a self-contained .NET 8 web API (R2 reconstruction, started 2026-07-06):
  - `Domain/Entities.cs` — the 9 entity classes.
  - `Data/KreweGovernanceDbContext.cs` — the `DbContext` (Fluent config matching the live DB).
  - `Services/TemplateEngine.cs` — `{{variable_key}}` substitution + missing-variable tracking.
  - `Services/AssemblyService.cs` — merges client answers into templates → `AssembledPolicies`.
  - `Api/Endpoints.cs` — policy library, wizard (questions + prefill + answer upsert), assemble, acknowledgment.
  - `Program.cs` / `NOIT.KreweGovernance.csproj` — entry point (connection via `KREWE_GOVERNANCE_SQL`).

> **Build status: VERIFIED** — `dotnet build` (SDK 8.0, 2026-07-07) succeeds with
> 0 warnings / 0 errors, no changes required.
>
> **Smoke test: PASSED 15/15 (2026-07-08, live DB)** — run from an ephemeral
> Azure VM (`tools/smoke/`): DB connect → seed (3 NIST/CMMC policies) → health
> → policy library → wizard round-trip → assemble (0 missing variables, full
> {{token}} substitution) → acknowledge. Test rows live under the ZZ-TEST
> client `d1000000-0000-4000-8000-000000000001` (safe to delete).
> Note: the server is **Entra-only auth** (`azureADOnlyAuthentication: true`);
> the SQL login in AWS `noit/krewe-governance-sql` only works while that flag
> is off (it was toggled off for the test and restored). Decide at R5 deploy
> time: managed-identity auth (keep Entra-only) vs. SQL auth (turn it off).

## Repo decision (2026-07-06, Tammy)
The Krewe Suite consolidates into **one operational monorepo: `tmabaker/kreweconnect`**
(modules as folders — `apps/connect`, `apps/review`, `apps/governance`, later `apps/catch` —
over one shared .NET backend), with `tmabaker/krewesuite` remaining the separate
marketing/demo repo. **This `apps/governance/` folder IS that transplant** (copied verbatim
from `noit-client-tools/krewe-governance/` on 2026-07-07, after the build was verified).
Still to do here: wire the Entra auth/tenant middleware from the consolidated backend
(`noit-client-tools-backend/`) in front of `Endpoints.cs`. The `noit-client-tools` copy is
now the historical/recovery record; develop here.

> **Deploy note:** this backend is NOT deployed yet (that's milestone R5). The SWA
> workflow is untouched; `apps/**` is not in its `paths-ignore`, so a `main` push
> touching this folder triggers an SWA run — harmless (it doesn't build this folder),
> but worth adding to `paths-ignore` when R5 decides the real deploy target.

## Auth & tenant scoping (NOC-55)

Entra JWT bearer on the shared app registration `eaeafccb…` (audience
`api://eaeafccb…`, `/organizations` multi-tenant authority — config in
`appsettings.json`, no secrets needed server-side). Scoping is schema-faithful
(`ClientCompanies` has no tenant column):

- **NOIT staff** — token `tid` == NOIT tenant (`7fb15bf6…`): full access + all writes.
- **Client user** — `Users` row matched on token `oid` (`EntraObjectId`), scoped to
  its `ClientCompanyId`; no active row → 403 `not_provisioned`. Clients can use the
  wizard, save answers, view/acknowledge their assembled policies — not the raw
  template library or any write endpoint.
- `KREWE_AUTH_DISABLED=true` bypasses auth and runs every request as staff —
  **local dev + `tools/smoke` only**, never on a deployed instance.

Library writes (staff-only): `POST/PUT /api/categories`, `POST/PUT /api/policies`
(content change ⇒ `PolicyVersions` snapshot + `CurrentVersion` bump),
`PUT /api/policies/{id}/variables` (replace wizard definitions),
`GET /api/policies/{id}/versions`.

## Connect to the live DB
Credentials are in AWS Secrets Manager `noit/krewe-governance-sql`
(server `noit-krwgov-0628.database.windows.net`, db `krewe-governance-db`).
Treat as **database-first**: don't add migrations against it — `InitialCreate` is
already applied.

> Network note: reaching the DB requires `*.database.windows.net:1433` egress and
> the client IP on the SQL firewall. From a locked-down Claude session this is
> blocked; use the Azure Portal Query editor, or run from an environment with SQL
> egress allowed.

## Rebuild path (recommended order)
1. **Backend** — drop these entities + `DbContext` into a .NET 8 API project (or the
   `noit-client-tools-backend` consolidation home in `tmabaker/kreweconnect`). Point
   the connection string at the live DB. `dotnet ef dbcontext info` should bind clean.
2. **Template engine** — `{{variable_key}}` substitution over `Policy.Content` using
   `PolicyVariables` (definitions) + `ClientVariables` (a client's answers).
3. **Variable wizard** — render `PolicyVariables` (universal first, then policy-specific)
   as a form; persist answers to `ClientVariables`.
4. **Assembly engine** — merge → write `AssembledPolicies.AssembledContent`; track any
   unfilled keys as the "missing variables" list.
5. **MyITProcess** — pull findings, match to `FindingPolicyMaps` (label/keyword →
   Policy), surface recommended policies per `ClientCompanies.MitpClientId`.
6. **Phase 3d (NOC-53)** — client portal + acknowledgment (`AssembledPolicies.Acknowledged*`
   columns already exist) + PDF export; distribution/acknowledgment via PhinSec.

## Seed content already written this session
The three NIST/CMMC control-mapped policy drafts and the client intake questionnaire
(in `policy-templates/` on the `claude/policy-hub-*` branches) map directly onto this
schema: policy bodies → `Policies.Content`; their `{{tokens}}` → `PolicyVariables`;
intake answers → `ClientVariables`.
