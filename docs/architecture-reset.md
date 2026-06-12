# KreweConnect / NOIT Client Tools — Reset & Integration Architecture

Status: draft for review (2026-06-11). Author: agent session. This is the
blueprint for consolidating the moving parts into one coherent stack on the
Apps365 model, and resetting the credentialing that caused stagnation.

---

## 1. The core product requirement (the north star)

One app, two behaviors based on **who logs in**:

- **NOIT staff** (MSP admins, home tenant `7fb15bf6-…`) → can see **all
  client tenants** and switch between them.
- **Client users** → see **only their own tenant**, their own directory.

Isolation is keyed to the caller's identity (the `tid` claim in their token),
enforced server-side, never trusted from the client.

---

## 2. What exists today (verified this session)

| Piece | Where | State |
|---|---|---|
| **KreweConnect frontend** | `tmabaker/kreweconnect` repo, deployed at `krewesuite.noitgroup.com/app/kreweconnect/` | Recovered from source maps; React/Vite/Fluent; tenant-context bug fixed; in backend-mode |
| **Functions API** (`api/`) | same repo | Real per-tenant app-only token acquisition + isolation. The *only* working GDAP/Graph code. No persistence. |
| **.NET backend** "NOIT Client Tools" | TABCC SharePoint only (**not in git**) | Full EF Core persistence + CLM (contracts, approvals, docs, tags, audit) + employee sync + GDAP service — but **all Graph/GDAP is mocked/stubbed** (`UseMockData: true`, `NotImplementedException`). Serves `techtools.noitgroup.com`. |
| **App registration** | Entra, `eaeafccb-…` | Multi-tenant. Used by frontend (OIDC), Functions API (client-credentials), and the .NET backend. Client **secret was rotated**; only the SWA copy is valid. |

**Key realization:** the two backends are complementary halves of one product.
The .NET backend has the **data layer** the product needs; the Functions API
has the **working tenant-token logic** the .NET backend left as a stub. Neither
is complete alone.

---

## 3. Target architecture (Apps365 model)

```
                 ┌─────────────────────────────────────────────┐
   Browser ──────│  KreweConnect SPA (React)                   │
   (NOIT staff   │  krewesuite.noitgroup.com/app/kreweconnect  │
    or client)   └───────────────┬─────────────────────────────┘
                                 │ user's MSAL token (api://eaeafccb)
                                 ▼
                 ┌─────────────────────────────────────────────┐
                 │  ONE backend API                            │
                 │  - validates caller token, reads tid claim  │
                 │  - isolation: NOIT tid ⇒ any tenant;        │
                 │               else ⇒ own tenant only        │
                 │  - EF Core persistence (contracts, custom   │
                 │    fields, audit, tenant registry)          │
                 │  - per-tenant Graph via app-only client     │
                 │    credentials against {customerTenantId}   │
                 └───────────────┬─────────────────────────────┘
                                 │ client_credentials, scope=.default
                                 ▼
                 ┌─────────────────────────────────────────────┐
                 │  Microsoft Graph, per customer tenant       │
                 │  (each tenant has granted admin consent)    │
                 └─────────────────────────────────────────────┘
```

**Consent model (the Apps365 behavior):** each customer tenant's admin grants
one-time admin consent to the multi-tenant app via the `/adminconsent`
endpoint. It persists until revoked. **No GDAP brokering required** for the
directory product — direct per-tenant admin consent gives the same "authorize
once, lasts ~a year" behavior with far less complexity. (GDAP relationship
enumeration can stay as an *optional* convenience for auto-discovering which
tenants to offer, but it is not on the critical auth path.)

**Recommendation — one backend:** adopt the **.NET backend** as the home (it
has the persistence the product can't ship without) and port the Functions
API's working `client_credentials`-per-tenant logic into its `GdapService`,
replacing the `NotImplementedException` in `AcquireTokenForTenantAsync` and
the mock in `GetActiveRelationshipsAsync`. Retire the standalone Functions API
once ported, OR keep the Functions API as the backend and add a database — but
the .NET side already has far more built, so porting *into* it is less work.

---

## 4. Credential reset (the part that caused stagnation)

Decisions to standardize on:

1. **One app, one secret, one source of truth.** App `eaeafccb` currently has
   its secret in **three** places — two dead (AWS `noit/azure-taila-agent`,
   SharePoint `appsettings.json`) and one live (SWA settings). Collapse to a
   single authoritative store (recommend AWS Secrets Manager) and delete the
   rest. Every consumer reads from there.
2. **Scrub the plaintext secret** committed in the SharePoint
   `appsettings.json` — it must never live in a config file. Use app settings /
   Key Vault / Secrets Manager references only.
3. **Separate the agent identity from the product.** "Taila"/OpenClaw is an
   automation account for *making changes*; it should not be the mechanism by
   which the **product** reaches customer tenants. The product uses app-only
   client credentials (above). Taila's broad-reader access is a separate
   concern for admin/automation, not the directory data path.
4. **Decide GDAP's role explicitly:** OUT of the product auth path (recommended)
   — keep it only for optional tenant discovery.

---

## 5. Isolation design (requirement #1, concretely)

- Backend reads the caller's `tid` from their validated token.
- If `tid == NOIT home tenant` → caller may request any `{tenantId}`; the
  tenant switcher is shown; "all tenants" aggregates.
- Else → caller is forced to their own `tid`; switcher hidden; any request for
  another tenant returns 403.
- This is **already implemented** in the Functions API's `authorizeTenant()`
  and now mirrored in the frontend (client users pinned to their own tenant).
  Port the same rule into the .NET backend's `TenantContext`/authorization
  filter when consolidating.

---

## 6. Sequenced execution plan

### Needs a keyboard (Tammy) — small, one-time
- [ ] Mint a fresh client secret on app `eaeafccb`; store in the chosen single
      source (AWS). Update SWA setting to match (or have SWA read from source).
- [ ] Remove the plaintext secret from SharePoint `appsettings.json`.
- [ ] Confirm the app has the Graph **application** permissions the product
      needs (`User.Read.All`, `Directory.Read.All` as required) with admin
      consent in the home tenant.
- [ ] Decision: confirm GDAP is out of the product auth path.

### Agent can do autonomously (no credentials)
- [ ] Preserve the .NET backend into version control (anti-loss; prerequisite
      to building on it). Dedicated task — heavy file copy.
- [ ] Port the Functions API's per-tenant token logic into the .NET
      `GdapService` (replace the stubs), as a reviewable PR.
- [ ] Reconcile the recovered frontend's API contract with the .NET backend's
      controllers (`EmployeesController`, `TenantsController`, etc.) so the SPA
      talks to one backend.
- [ ] Continue auditing the frontend for foundational bugs (tenant-context
      class already fixed).

### Verification (Tammy, when convenient)
- [ ] Geaux pilot: sign in, switch to Geaux, directory loads real employees.
      Three prior blockers already cleared (consent, header passthrough,
      tenant-context propagation).

---

## 7. Decisions (CONFIRMED 2026-06-11 by Tammy)

1. **Home backend:** the **.NET backend** (deferred to recommendation). Port
   the Functions API's per-tenant token logic into it.
2. **Auth model:** **per-tenant admin consent** (Apps365-style), GDAP **off**
   the auth path.
3. **GDAP:** used only for **tenant discovery** (listing which client tenants
   to offer), not for token brokering.
4. **Single secret store:** recommend AWS Secrets Manager (confirm at execution).
5. **Domains:** keep `techtools` (portal) and `krewesuite` (KreweConnect)
   separate unless a reason to unify emerges (confirm at execution).
