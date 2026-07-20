# Graph-direct user-admin endpoints (v0.4.0)

Replaces the CIPP middleman for the techtools Users / OOO / Vacation pages.
Each endpoint is one app-only Graph call via the cached per-tenant token
(`tokenService.ts`) — no PowerShell function app, no CIPP schema drift.

## Routes

All under `/api/tenants/{tenantId}/…`; `{tenantId}` may be `home`.
Reads follow the existing isolation rule (MSP staff → any tenant, client
callers → own tenant). **Writes additionally require an MSP (NOIT-tenant)
caller and a concrete tenant** — client self-service can be layered on
later with role checks.

| Method | Route | Purpose |
|---|---|---|
| POST | `…/users` | Create user; optional `licenseSkuIds`, `managerId`; returns generated password |
| PATCH | `…/users/{userId}` | Update profile fields (whitelisted), `managerId` |
| POST | `…/users/{userId}/password` | Reset password; generates one if not supplied |
| POST | `…/users/{userId}/revokeSessions` | Sign the user out everywhere |
| POST | `…/users/{userId}/licenses` | `{add: [skuId], remove: [skuId]}` |
| GET/PATCH | `…/users/{userId}/mailboxSettings` | Read / set OOO auto-reply (`status`, messages, schedule) |
| GET | `…/licenses` | Subscribed SKUs (replaces CIPP `ListLicenses`) |
| GET | `…/caPolicies` | CA policies with current `excludedUsers` |
| POST | `…/caPolicies/{policyId}/exclusions` | `{userId, action: "add"\|"remove"}` |

Create/reset responses include the plaintext password once; it is never
stored. `forceChangePasswordNextSignIn` defaults to true.

## Graph application permissions required

The app registration (`eaeafccb-…`) needs these **application** permissions
granted, then **each client tenant must re-consent** (the token service's
consent URL). Least-privilege set:

- `User.Read.All` — directory reads (already in use)
- `User.ReadWrite.All` — create/update users
- `User-PasswordProfile.ReadWrite.All` — password resets (cannot reset
  admins/privileged-role holders — Entra blocks app-only resets upward)
- `User.RevokeSessions.All` — revoke sessions
- `Organization.Read.All` — subscribed SKUs
- `LicenseAssignment.ReadWrite.All` — assign/remove licenses
- `MailboxSettings.ReadWrite` — OOO auto-reply
- `Policy.Read.All` + `Policy.ReadWrite.ConditionalAccess` — CA exclusions

## Known limits (kept on CIPP for now)

Exchange-only operations Graph cannot do app-only: convert mailbox to
shared, mailbox/calendar permission grants, inbox-rule cleanup, hide from
GAL for on-prem-synced users. The offboarding wizard stays on CIPP until
those are ported (EXO REST/PowerShell with the same app identity).
