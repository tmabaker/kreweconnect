# KreweReview: bring-your-own storage (per-tenant data residency)

A client can host its KreweReview data in **its own Azure storage account**, in its
own subscription and region, while still using the shared KreweSuite front end. This
gives the client data residency and continuity: the resource is theirs, and if NOIT
stops operating the front end they are left with their own contract records (plain
JSON) and uploaded originals in their own account.

## How it works

The storage layer (`api/src/lib/contractStore.ts`) resolves the storage connection
**per tenant** via `contractsConnection(tenantId)`:

1. If `CONTRACTS_STORAGE_MAP` (a JSON object `{ "<tenantId>": "<connection string>" }`)
   names this tenant, that connection is used — the client's own store.
2. Otherwise it falls back to the shared NOIT store (`CONTRACTS_STORAGE_CONNECTION`,
   then `CDK_STORAGE_CONNECTION`).

The per-tenant blob layout (`contracts/{tenantId}/…`) is unchanged, so a client's own
store simply holds that one tenant's data. Container clients are cached per distinct
connection string, so the shared store and each client store are each opened once.

## Onboarding a client to their own store

1. Provision a Storage account (StorageV2, `allowBlobPublicAccess=false`) in the
   **client's** subscription and region.
2. Obtain a scoped connection for it (a Key Vault reference is preferred over a literal
   key in app settings).
3. Add the tenant to `CONTRACTS_STORAGE_MAP` on the `krewesuite` static web app:
   `{ "<client-tenant-guid>": "<connection string or Key Vault reference>" }`.
4. Nothing else changes: the front end, the Entra app, and the per-tenant paths are the
   same. Tenants not listed keep using the shared store.

## Notes

- `listAllContracts(tenantIds)` (the MSP "all tenants" view) fans out across each
  tenant's store, so bring-your-own-storage tenants appear alongside shared-store ones.
- Pick lists are read and written in the tenant's own store.
- Production should store each connection as a Key Vault reference, never a literal
  account key in configuration.
