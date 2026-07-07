# MS Claude Agent — identity runbook

The dedicated app-only identity that lets Claude sessions do live Microsoft
Graph / MSP work (separate from the KreweConnect product app `eaeafccb`).

| Thing | Value |
|---|---|
| App display name | **MS Claude Agent** |
| Client ID | `90f52d62-9133-47e0-a6a1-45c9bec69558` |
| Home tenant | NOIT `7fb15bf6-9cea-4c72-89bd-1ab9f16eec8e` |
| Secret (AWS) | `noit/0626_MSClaudeAgent` |

## Decision (2026-06-15, Tammy) — what this identity is for

1. **Read directory / users** — read NOIT users + org data for live testing of
   KreweConnect's Graph code paths.
2. **MSP device / Intune ops** — endpoint/Intune automation, intended to reach
   **client tenants**, not just NOIT.

This resolves the open decision in `docs/SESSION-STATE.md` §0/§4.

## What's already true

- Token acquisition against NOIT works (app-only client credentials).
- App permissions already consented (from token `roles`): `Device.Read.All`,
  `DeviceManagementConfiguration.ReadWrite.All`, `Calendars.ReadBasic.All`,
  `APIConnectors.Read.All`, `MultiTenantOrganization.Read.All`.
- **Single-tenant** (Geaux returns `AADSTS700016`) and **no directory read**.
- `graph.microsoft.com` is **blocked** by the environment network policy
  (tokens mint, but Graph calls fail "Host not in allowlist").

## To-do to realize the decision (all are Tammy's portal/env actions)

### A. Add Graph application permissions (Entra → App registrations → MS Claude Agent → API permissions → Microsoft Graph → Application)
For **directory/users read**:
- `User.Read.All`
- `Directory.Read.All`

For **Intune/device ops** — note the distinction, the existing perms aren't enough:
- `Device.Read.All` (already) reads **Entra device objects**, *not* Intune
  enrolled devices. To enumerate **managed (Intune) devices**, add
  **`DeviceManagementManagedDevices.Read.All`** (or `.ReadWrite.All` to act on
  them). `DeviceManagementConfiguration.ReadWrite.All` (already) covers Intune
  *configuration/policies*, not the managed-device inventory.

Then **Grant admin consent for NOIT** (the portal button — no redirect URI needed).

### B. Make it multi-tenant + consent per client (needed for ops beyond NOIT)
1. Authentication blade → *Supported account types* → **Accounts in any
   organizational directory** (or set `signInAudience: AzureADMultipleOrgs` in
   the Manifest).
2. For each client tenant, have a Global Admin there grant consent:
   ```
   https://login.microsoftonline.com/<CLIENT_TENANT_ID>/adminconsent?client_id=90f52d62-9133-47e0-a6a1-45c9bec69558&redirect_uri=<a registered redirect URI>
   ```
   (Register a redirect URI on the app first, or use Partner Center / CIPP to
   push consent.) Without this, client tenants keep returning `AADSTS700016`.

### C. Open the network egress (Claude environment → network policy → Custom)
- Add **`graph.microsoft.com`** (required for any Graph call).
- Add `management.azure.com` only if ARM/subscription ops are later wanted (not
  part of this decision).

### D. Rotate + re-store the secret (the current value leaked in a transcript)
1. Entra → MS Claude Agent → Certificates & secrets → **new client secret**,
   note expiry; delete the old one.
2. Re-store in AWS `noit/0626_MSClaudeAgent` in the proper shape (it's currently
   stored as a JSON *key* with an empty value):
   ```json
   {"clientId":"90f52d62-9133-47e0-a6a1-45c9bec69558","clientSecret":"<new>","tenantId":"7fb15bf6-9cea-4c72-89bd-1ab9f16eec8e"}
   ```
   (Matches the `oauth2_client_credentials` shape the `noit-ops` skill expects,
   modulo key casing — keep one convention.)

## Verify once A–D are done (from a session, after the network opens)
- `GET https://graph.microsoft.com/v1.0/users?$top=1&$select=id,displayName`
  with an app-only NOIT token → 200 (proves directory read).
- `GET https://graph.microsoft.com/v1.0/deviceManagement/managedDevices?$top=1`
  → 200 (proves Intune read; 403 ⇒ missing `DeviceManagementManagedDevices.Read.All`).
- App-only token against a consented client tenant → no `AADSTS700016`
  (proves multi-tenant + client consent).

## Standing rules
Never print/commit the secret. Honor least privilege — add only the scopes the
two intents need. Destructive Intune writes (wipe/retire) are out of scope unless
Tammy explicitly authorizes per-action.
