# KreweReview schema v2

_Target: the KreweConnect frontend (types, mock hook, form, list, detail) and
`noit-client-tools-backend` (EF model, enums, DTOs). This document and the code it
describes contain no client data._

## Why the current shape is not enough

Today a contract has: vendor, type (7 values), title, start, end, one renewal date, an
auto renew flag, one value, status (6 values), SLA terms, notes, tags, documents,
versions, approvals, 30/60/90 alerts. It cannot express month to month, a notice
period, a decision window, who to call, how the value is billed, where the record came
from, or how confident the extraction is. Apps365 CLM 365 (the model KreweReview follows)
tracks party information, payment terms, duration, obligations, department, risk
class, stakeholders, and amendments as linked history. The additions below close that
gap without breaking existing records (every new column is nullable or defaulted).

## Field additions on `Contract`

| Field | Type | Notes |
|---|---|---|
| `agreementCategory` | enum `AgreementCategory` | Replaces `contractType` as the primary classifier; `contractType` kept for compatibility and mapped (Software→SoftwareLicense, Subscription→SaaSSubscription, Lease→Lease, Service→VendorService, Hardware→Maintenance or Warranty, Consulting→ProfessionalServices, Other→Other). |
| `renewalType` | enum `RenewalType` | MonthToMonth, AutoRenew, ExpireUnlessRenewed, Evergreen, FixedTermNoRenewal, Unknown. `autoRenew` becomes derived (`renewalType == AutoRenew`). |
| `renewalTermMonths` | int? | Length of each renewal period (12 for annual auto renew, 1 for month to month). |
| `noticePeriodDays` | int? | Days of notice required to cancel or opt out. |
| `earliestRenewalDecisionDate` | date? | Earliest date a renewal decision can be made (vendor will quote, early renewal allowed). Default: 90 days before the latest date. |
| `latestRenewalDecisionDate` | date? | Last safe day to act: `endDate - noticePeriodDays`, or `endDate` for ExpireUnlessRenewed. Computed when null, stored when the document states it. |
| `totalValue` | decimal? | Total contract value over the full term. The existing `value` is kept and treated as `totalValue` on migration. |
| `recurringAmount` | decimal? | Amount per billing cycle. |
| `billingFrequency` | enum `BillingFrequency` | Monthly, Quarterly, SemiAnnual, Annual, OneTime, Usage, Unknown. (Enum exists in the backend already; add Usage and Unknown.) |
| `annualizedValue` | decimal? (computed) | From recurringAmount × frequency, else totalValue ÷ term years. Read only in the API. |
| `counterpartyName` | string | The other party as written on the paper (may differ from the vendor brand). |
| `clientInternalOwner` | string? | The person at the client who owns the relationship. |
| `department` | string? | Apps365 parity. |
| `riskClass` | enum? `RiskClass` | Low, Medium, High, Critical. Apps365 parity; defaults null. |
| `policyOrAccountNumber` | string? | Policy number, license key id, account number, membership number. |
| `coverageOrScopeSummary` | string? | For insurance: limits and coverage lines. For software: seats and edition. For services: scope sentence. |
| `terminationTerms` | string? | How either side can exit. |
| `confidenceTier` | enum `ConfidenceTier` | A = verified from the executed document, B = partly inferred, C = evidence only. |
| `needsReview` | bool | True when any key field is inferred or missing. |
| `reviewQuestions` | string? (JSON array) | Questions for the client POC. |
| `sourceSystem` | enum `SourceSystem` | SharePoint, OneDrive, Mail, FileServer, Egnyte, AccountingExport, VendorPortal, Manual, M365Licensing, EntraApps. |
| `sourceTenantId` | string? | Entra tenant GUID the record was pulled from. |
| `sourceContainer` | string? | Site name or user UPN. |
| `sourcePath` | string? | Folder path. |
| `sourceItemId` | string? | Graph item id (or message id). |
| `sourceWebUrl` | string? | Open the original in place. |
| `sourceFileHash` | string? | SHA 256 of the document at extraction time. |
| `extractedAt` | datetime? | When the record was machine extracted. |
| `extractionModel` | string? | Which model or rule set produced the fields. |

## New entity: `ContractContact`

One row per contact role per contract.

| Field | Type |
|---|---|
| `id` | guid |
| `contractId` | guid |
| `role` | enum `ContactRole`: ExternalServicer, Support, Payable, InternalOwner, Broker, Other |
| `name`, `company`, `title`, `email`, `phone`, `portalUrl` | string? |
| `notes` | string? |
| `sourceRef` | string? (where the contact was found) |

The three roles the form shows map to ExternalServicer, Support, and Payable. A single
vendor rep often fills all three; store three rows anyway so each can change
independently.

## New entity: `ContractObligation` (Apps365 parity, optional for the first import)

`id, contractId, description, dueDate, recurrence, owner, status (Open, Done, Waived)`.
Used for "send cancellation notice by", "annual true up", "COI renewal due from vendor".

## Status enum

Keep the six values and add `PendingRenewalDecision` (inside the decision window) and
`Unknown` (evidence only). The list view already colors by status; two new colors.

## Renewal alerts

Keep 30/60/90 as they are, add an alert anchored on `latestRenewalDecisionDate`
(`AlertType.DecisionDeadline`) and one on `earliestRenewalDecisionDate`
(`AlertType.DecisionWindowOpens`). These two are the ones that save money.

## Import format

The ingestion pipeline emits one JSON object per agreement, with embedded
`contacts[]`, `documents[]` and `obligations[]`. The backend mirrors that shape as
`ContractImportRecord` and exposes `POST /api/v1/contracts/import`, which accepts an
array, creates records as `Draft` with `needsReview` honored, and is idempotent on
`(tenantId, sourceSystem, sourceItemId)` (a filtered unique index where
`sourceItemId` is not null). The frontend mock hook uses the same field names so the UI
can be reviewed before the .NET backend is deployed.

Import behavior worth knowing:

- Send one batch per client with the `X-Tenant-Id` header set to that client. Caller must
  be an MSP administrator. At most 500 records per call.
- Each record succeeds or fails on its own; the response lists every outcome
  (Created, Updated, Skipped, Failed).
- A record whose existing row is still `Draft` is refreshed. A row a person has already
  moved past `Draft` (or archived) is left untouched.
- `inScope = "No"` records are skipped. `inScope = "Unsure"` forces `needsReview`.
- If `startDate` is missing the executed date, else the import date, is used, and the
  record is flagged with a review question, because the column is required.
- Documents become metadata rows; `storagePath` holds the link back to the original.

## UI changes (kreweconnect `src/apps/contracts`)

- Form: category and renewal type dropdowns; notice period; decision dates with a
  "compute from end date" helper; billing frequency and recurring amount; contacts
  section with the three fixed roles; provenance panel (read only).
- List: columns for category, renewal type, latest decision date, confidence tier, a
  Needs Review filter.
- Detail: contacts card, provenance card with "Open original" link, review questions.
- Renewals page: sort by latest decision date, not end date.

## Migration notes

All new columns nullable or defaulted; `value` copied to `totalValue`; `autoRenew`
true → `renewalType=AutoRenew`, false with an end date → `ExpireUnlessRenewed`, false
with no end date → `Evergreen`. Existing enums extended, never renumbered. The
governance database is database first and untouched; this is the client tools
database only.
