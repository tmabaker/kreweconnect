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
npm test        # unit tests (vitest) for the contract date and value helpers
```

## KreweReview data model (schema v2)

Full design: [`docs/krewereview-schema-v2.md`](docs/krewereview-schema-v2.md).
Every addition is nullable or defaulted, so existing records stay valid.
`contractType`, `autoRenew` and `value` are kept for compatibility
(`autoRenew` is now derived from `renewalType`; `value` mirrors `totalValue`).

**On `Contract`**

- Classification: `agreementCategory` (20 values), `renewalType`
  (MonthToMonth, AutoRenew, ExpireUnlessRenewed, Evergreen,
  FixedTermNoRenewal, Unknown), `riskClass`, `department`,
  `clientInternalOwner`, `counterpartyName`, `policyOrAccountNumber`,
  `coverageOrScopeSummary`
- Renewal terms: `renewalTermMonths`, `noticePeriodDays`,
  `earliestRenewalDecisionDate`, `latestRenewalDecisionDate`,
  `terminationTerms`
- Money: `totalValue`, `recurringAmount`, `billingFrequency` (adds Usage and
  Unknown), `annualizedValue` (computed, read only)
- Review state: `confidenceTier` (A, B, C), `needsReview`, `reviewQuestions`
- Provenance: `sourceSystem`, `sourceTenantId`, `sourceContainer`,
  `sourcePath`, `sourceItemId`, `sourceWebUrl`, `sourceFileHash`,
  `extractedAt`, `extractionModel`
- Status adds `PendingRenewalDecision` and `Unknown`; renewal alerts add
  `DecisionDeadline` and `DecisionWindowOpens`

**New entities:** `ContractContact` (one row per role: ExternalServicer,
Support, Payable, InternalOwner, Broker, Other) and `ContractObligation`
(description, due date, recurrence, owner, Open/Done/Waived).

**Decision window.** `latest = endDate - noticePeriodDays` (the end date
itself for ExpireUnlessRenewed); `earliest = latest - 90 days`. The form's
"Compute decision dates" button and the backend both use this rule.

**Import.** `POST /api/v1/contracts/import` (MSP admin only, one batch per
client via `X-Tenant-Id`) accepts an array of import records, creates them as
Draft with `needsReview` honored, and is idempotent on
`(tenant, sourceSystem, sourceItemId)`. The frontend mock data uses the same
shape so the UI can be reviewed before the backend is deployed.
Databases created by `EnsureCreated` before this change need a migration or
re-seed to pick up the new columns and tables.

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
