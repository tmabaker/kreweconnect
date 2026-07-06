# GdapService port — review notes

**Status:** UNVERIFIED. Written 2026-06-11 by porting the working logic from
the KreweConnect Functions API (`api/src/lib/tokenService.ts`). It has **not
been compiled** (this environment has no .NET SDK and the project still lacks
`.csproj`/`.sln`/Migrations + the second Enums file + TenantContextMiddleware).
Review and build before relying on it. Committed to branch
`claude/brave-feynman-g2j9v5` only — **not merged to main**.

## What changed

`Services/GdapService.cs` — the two stubs that threw `NotImplementedException`
are now real, behind the existing `Gdap:UseMockData` toggle:

1. **`AcquireTokenForTenantAsync`** — app-only client-credentials token against
   the *customer tenant's* authority
   (`https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token`,
   scope `https://graph.microsoft.com/.default`). In-memory per-tenant cache
   with a 5-min expiry margin. On `AADSTS7000215` → throws "rotate the secret";
   on consent-missing codes (`700016/65001/90002`) → throws
   `TenantNotAuthorizedException` carrying the admin-consent URL.
2. **`GetActiveRelationshipsAsync`** — real GDAP discovery via
   `GET /v1.0/tenantRelationships/delegatedAdminRelationships?$filter=status eq 'active'`
   (paged), using an app-only token for the partner (NOIT) tenant. **Discovery
   only** — not on the auth path, per the locked decision.

`SyncTenantRegistryAsync` and `ValidateTenantAccessAsync` are unchanged (they
already work against whatever `GetActiveRelationshipsAsync` returns / the local
registry).

`Program.cs` — added `builder.Services.AddHttpClient();` (GdapService now needs
`IHttpClientFactory`).

## To go live (config)

- Set `Gdap:UseMockData=false`.
- Ensure `AzureAd:ClientSecret` holds a **valid** secret (the rotated one — see
  `docs/SESSION-STATE.md`; do not commit it; use app settings / Key Vault).
- Optionally set `Gdap:ConsentRedirectUri` (defaults to
  `https://techtools.noitgroup.com`) — must be a registered redirect URI.
- App registration needs Graph **application** permissions consented:
  `User.Read.All` (employee sync) and, for GDAP discovery,
  `DelegatedAdminRelationship.Read.All`.

## Also ported (2026-06-11, same UNVERIFIED status)

- **`EmployeeSyncService.SyncTenantAsync`** real path is now implemented:
  acquires an app-only token via `GdapService.AcquireTokenForTenantAsync`,
  calls `GET /v1.0/users` (paged, `$select`+`$expand=manager`, eventual
  consistency for the `accountEnabled` filter), maps into the existing
  upsert/deactivate/manager-resolution path. Behind `Gdap:UseMockData`.
  Requires Graph **`User.Read.All`** application permission consented per tenant.
  Not yet fetched: photos (per-user call) and `HireDate` (`employeeHireDate`
  needs extra perms) — left null, a later pass. Needs `IHttpClientFactory`
  (already added to DI via `AddHttpClient()`).

## Still stubbed (next pieces, out of scope for this change)

- **Controllers** should catch `TenantNotAuthorizedException` and return its
  `ConsentUrl` to the SPA (mirror the Functions API's `consent_required`
  response) so the UI can prompt for admin consent.
- Reconcile the SPA's API base/routes with this backend (`/api/v1/...`,
  `X-Tenant-Id` header) when consolidating onto it.
