# KreweReview live backend — run spec

Goal: KreweReview at `krewesuite.noitgroup.com/app/kreweconnect/contracts` reads and
writes real, persisted agreements (starting empty), lets staff upload a new or renewed
contract and have most fields inferred from the document, and only accepts values from
fixed lists for category, location, department and tags.

## Requested by Tammy (2026-10-17)

1. Start with fresh data, connected to a backend that works.
2. Categories are a defined list. No ad lib values.
3. Upload a new contract or a renewed contract; infer most fields from the upload.
4. Location selection bound to a predetermined per-tenant list, plus department selection.
   - Geaux and Level: location = Entra Company Name, department = Entra Department.
   - Fishman Haygood: FH Baton Rouge, FH New Orleans.
   - True Title: True Title Gretna, True Title Metairie, True Title Hammond.
   - Provident: Provident Baton Rouge, Provident Raleigh.
5. (Earlier) A way to remove agreements.

## Design

- Backend: the deployed Azure Functions API in `api/` (the .NET backend has no host).
- Storage: Azure Blob, container `krewereview`, connection `CONTRACTS_STORAGE_CONNECTION`
  falling back to `CDK_STORAGE_CONNECTION` (same pattern as vendor jobs).
  - `contracts/{tenantId}/{contractId}.json` one document per agreement, ETag guarded.
  - `files/{tenantId}/{fileId}` original uploads (never served cross-tenant).
  - `config/picklists.json` per-tenant location and department lists.
- Extraction: Claude API (`ANTHROPIC_API_KEY` app setting), PDF and images as document or
  image blocks, DOCX converted to text. Structured JSON output whose enums are the locked
  lists, so the model cannot return a value outside them. Split from the upload call so a
  slow or failed extraction never loses the file.
- Pick lists: defaults matched by tenant name (no tenant IDs in this public repo). Geaux
  and Level read distinct `companyName` / `department` from Entra; the others use the lists
  above. MSP admins can edit any tenant's lists from KreweReview.
- Authorization: reads follow the existing tenant isolation (`withAuth`). Writes, uploads,
  archive and delete are MSP admin only and require one concrete tenant.
- Remove: Archive (hidden, recoverable) and Delete permanently (MSP admin, confirm dialog,
  removes the record and its files).
- Demo mode keeps the mock data; production never shows it.

## Acceptance criteria (status 2026-10-17)

- [x] `cd api && npm test` passes, including new contract store, validation, pick list,
      and isolation tests run against Azurite.
- [x] `npm run build` and `npm test` (frontend) pass.
- [x] No production page imports `useMockContracts` outside demo mode.
- [x] A value outside the category, location, department, or tag lists is rejected with 400.
- [x] A client caller cannot read another tenant's contracts or files (403).
- [x] `/api/health` reports `features.contractsStorage` and `features.contractExtraction`
      without making either a deploy gate.

## Non-goals

- Migrating the .NET backend or SQL.
- E-signature, approval workflows, renewal alert emails.
- Client users editing contracts (read only for now).

## Constraints

- Keep `main` deployable; tenant isolation enforced server side.
- No secrets, tenant IDs, or client roster in the repo.

## Rollback

Revert the merge commit on `main`; stored blobs are inert without the routes.

## Not verifiable from the build session

- The deployed site, Azure app settings, and Graph are outside the session's
  network allowlist, so the live deploy is verified by the SWA workflow's
  health check and by signing in, not from here.
- A real Claude API call was not made. The request shape is covered by a
  stubbed test; the first real upload after `ANTHROPIC_API_KEY` is set is the
  live check.

## Settings to add in Azure (krewesuite SWA → Environment variables)

- `ANTHROPIC_API_KEY` (required for automatic reading of uploads)
- `CONTRACTS_STORAGE_CONNECTION` (optional; falls back to `CDK_STORAGE_CONNECTION`)
- `CONTRACT_EXTRACTION_MODEL` (optional; defaults to `claude-opus-5-5`)
