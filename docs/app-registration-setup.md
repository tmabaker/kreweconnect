# App Registration Setup — Apps365-style Multi-Tenant Access

One-time setup that lets KreweConnect read client-tenant directories after a
single admin consent per tenant (persists until revoked, or until the client
secret expires — typically rotated yearly).

App registration: **`eaeafccb-5190-48b6-863d-9e13f449acbb`** (NOIT home
tenant `7fb15bf6-9cea-4c72-89bd-1ab9f16eec8e`).

## Part A — Update the app registration (one time, in the NOIT tenant)

1. Sign in to [entra.microsoft.com](https://entra.microsoft.com) with your
   NOIT admin account → **Identity → Applications → App registrations →
   All applications** → open the app whose *Application (client) ID* is
   `eaeafccb-5190-48b6-863d-9e13f449acbb`.

2. **Verify multi-tenant**: on the **Authentication** blade, *Supported
   account types* must be **"Accounts in any organizational directory"**.
   (It should be already — the SPA signs in client users today. If not,
   change it there or set `signInAudience: AzureADMultipleOrgs` in the
   Manifest.)

3. **Add the application permission**: **API permissions → Add a
   permission → Microsoft Graph → Application permissions** → check
   **`User.Read.All`** → *Add permissions*. Leave the existing delegated
   permissions in place (the SPA still uses them for sign-in).

4. **Grant admin consent for the home tenant**: still on *API permissions*,
   click **"Grant admin consent for &lt;NOIT tenant&gt;"** and confirm. The
   `User.Read.All` row should show a green check under *Status*.

5. **Create the client secret**: **Certificates & secrets → Client
   secrets → New client secret**. Description `KreweConnect backend`,
   expiry **12 or 24 months** (set a renewal reminder — when it expires,
   tenant access stops until rotated). **Copy the *Value* immediately**;
   it's only shown once.

6. **Store the secret in the backend** (never in the SPA or the repo):
   in the Azure portal, open the Static Web App (or standalone Function
   App) → **Configuration / Application settings** and add:

   | Setting | Value |
   |---|---|
   | `AZURE_CLIENT_ID` | `eaeafccb-5190-48b6-863d-9e13f449acbb` |
   | `AZURE_CLIENT_SECRET` | the secret value from step 5 |
   | `MSP_TENANT_ID` | `7fb15bf6-9cea-4c72-89bd-1ab9f16eec8e` |
   | `CONSENT_REDIRECT_URI` | `https://krewesuite.noitgroup.com/app/kreweconnect/` |

7. **Check the redirect URI**: on the **Authentication** blade, make sure
   `https://krewesuite.noitgroup.com/app/kreweconnect/` is registered
   (under the SPA platform). The admin-consent flow's `redirect_uri` must
   match a registered one.

## Part B — Authorize a client tenant (repeat per tenant; Geaux first)

This is the Apps365-style "sign in once to authorize" step.

> **Shortcut:** `scripts/onboard-client.mjs` does steps 1–2 (and the optional
> consent check) in one command — it resolves the domain to a tenant ID, prints
> the consent URL, and prints the merged `CLIENT_TENANTS` JSON to paste into the
> SWA setting. See `scripts/README.md`. The manual steps below are the same flow.

1. Get the client's **tenant ID** (Partner Center → customer → Microsoft
   ID; or CIPP; or look up their domain at
   `https://login.microsoftonline.com/<domain>/v2.0/.well-known/openid-configuration`).

2. Build the consent URL (the API's `/api/tenants/{tenantId}/status`
   endpoint also returns it ready-made):

   ```
   https://login.microsoftonline.com/<CLIENT_TENANT_ID>/adminconsent
     ?client_id=eaeafccb-5190-48b6-863d-9e13f449acbb
     &redirect_uri=https://krewesuite.noitgroup.com/app/kreweconnect/
   ```

   After consent, add `{"id":"<CLIENT_TENANT_ID>","name":"<Company>"}` to the
   SWA app setting **`CLIENT_TENANTS`** so the client appears in the NOIT
   "All Tenants" aggregated view.

3. Have someone with sufficient privilege in the **client** tenant open the
   URL, sign in, review the permissions (`User.Read.All` — read all users'
   profiles), and click **Accept**.

   > **Who can consent:** tenant-wide admin consent to Graph *application*
   > permissions requires **Global Administrator** (or Privileged Role
   > Administrator) in the client tenant. If your GDAP relationship grants
   > you such a role, you can complete this yourself with your NOIT admin
   > account; otherwise send the link to the client's GA — it's a single
   > click for them.

4. Done — access persists until a client admin removes the enterprise app
   from their tenant (Entra → Enterprise applications) or your client
   secret expires.

## Part C — Verify

1. `GET /api/tenants/<CLIENT_TENANT_ID>/status` (signed in as a NOIT user)
   should return `{ "authorized": true, ... }`.
2. In the app, switch to the tenant — the directory should load from the
   client tenant. If consent is missing, the directory page shows the
   consent link instead.

## Deployment note

The SPA is currently deployed by the `krewesuite` repo's Static Web Apps
workflow, which only copies prebuilt bundles. For the managed-API setup the
SWA should build from **this** repo instead: point the SWA GitHub Action at
`kreweconnect` with `app_location: "/"`, `api_location: "api"`,
`output_location: "dist"`. (Alternative: deploy `api/` as a standalone
Function App, enable CORS for the site origin, and set
`VITE_API_BASE_URL` to its URL.)
