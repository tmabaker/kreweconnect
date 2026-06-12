# NOIT Client Tools — .NET Backend (preserved snapshot)

ASP.NET Core (.NET) backend for the NOIT tech portal (`techtools.noitgroup.com`)
that powers **KreweConnect** (employee directory) and **KreweReview** (contract
lifecycle management). This is the real backend the recovered KreweConnect
frontend was built against.

## ⚠️ Provenance & status

This source previously existed **only in TABCC SharePoint**
(`Projects/NOIT-Client-Tools/backend/`) — not in version control, the same
fragility that lost the frontend source (NOC-50). This directory is a
**partial preservation snapshot** captured 2026-06-11 to get the
highest-value, hardest-to-reconstruct files into git immediately.

**Captured so far (logic/schema/config core):**
- `Program.cs` — startup, DI, auth (Microsoft.Identity.Web), CORS, EF Core
  wiring, dev seed
- `Infrastructure/Data/AppDbContext.cs` — the complete EF Core schema
- `Services/EmployeeSyncService.cs` — per-tenant employee sync (Graph→DB)
- `Services/GdapService.cs` — GDAP relationships + per-tenant token
  acquisition (**currently stubbed / mock** — this is the integration point)
- `appsettings.json` — **client secret redacted** (the original committed a
  plaintext secret; do not restore it — use app settings / Key Vault)

**Not yet captured** — see `PRESERVATION-MANIFEST.md` for the full file list
(45 source files) with SharePoint IDs so the remainder can be pulled
deterministically, plus the build files (`.csproj`/`.sln`/Migrations) which
SharePoint search does not surface and must be exported directly.

This snapshot is **not yet buildable on its own** (missing project files and
~40 model/DTO/interface/controller files). It is preserved for safety and
reference, not as a compile target yet.

## Key architectural facts (see `/docs/architecture-reset.md`)

- Same app registration as KreweConnect: `eaeafccb-5190-48b6-863d-9e13f449acbb`.
- **GDAP/Graph is entirely mocked** (`Gdap:UseMockData: true`). The mock
  tenant GUIDs (`aaaaaaaa-1111-…`) are the placeholders that propagated into
  the frontend `tenantConfig`.
- This backend has the **persistence + CLM** the product needs; the
  KreweConnect `api/` Functions project has the **working per-tenant token
  logic** this backend stubbed. The plan (decided 2026-06-11) is to make this
  .NET backend the home and port that token logic into `GdapService`.
