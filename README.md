# KreweConnect

Multi-tenant **Employee Directory** (and bundled **KreweReview** Contract
Lifecycle Management pages) for MSP-managed Microsoft 365 client tenants.
Built with React + TypeScript + Vite, Fluent UI v9, MSAL (Entra ID), and
Microsoft Graph. Deployed as part of KreweSuite at
`krewesuite.noitgroup.com/app/kreweconnect/`.

## Features

- **Directory** — searchable/filterable employee cards backed by Microsoft
  Graph (pagination, caching, batched photo fetch), employee detail pages,
  org chart
- **Multi-tenant** — tenant switcher with per-tenant branding config,
  designed for GDAP delegated access to client tenants
- **Custom fields** — per-tenant custom field definitions (settings UI)
- **KreweReview (CLM)** — contract list/detail/form, renewals dashboard,
  approvals, versions, documents (currently mock-data backed)
- **Demo mode** — `VITE_DEMO_MODE=true` runs the full UI on realistic mock
  data with no login

## Development

```bash
npm install
cp .env.example .env   # fill in your Entra app registration
npm run dev
```

## Provenance note

The original source tree was lost from version control; the 27 files under
`src/` were recovered verbatim from the production build's source maps
(May 2025 build). The build scaffolding (`package.json`, Vite/TS configs,
`index.html`), `src/shared/types.ts`, and `src/shared/auth/index.ts` were
not embedded in the maps and have been reconstructed from usage — dependency
versions are best-effort, not the original lockfile.

## Known gaps (tracked in Linear)

- GDAP tenant switching: `fetchUsers()` ignores the tenant ID — tokens are
  only acquired from the home tenant authority (NOC-40)
- Tenant GUIDs in `src/config/tenantConfig.ts` are placeholders (NOC-52)
- CLM pages are mock-backed; persistence layer not yet built
