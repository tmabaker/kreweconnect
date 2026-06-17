# Lessons Learned — KreweConnect / NOIT Client Tools

Durable playbook of the obstacles hit during the 2026-06 rebuild and how they
were resolved, so future development doesn't re-hit them. Pair with
`SESSION-STATE.md` (current state) and `architecture-reset.md` (the plan).

## Source control discipline (the most expensive lesson)

- **Both** the React frontend and the .NET backend existed **only outside git**
  — the frontend as compiled bundles with source maps, the backend only in
  SharePoint. Both were one deletion from gone; the frontend had to be
  recovered from production source maps.
- **Rule:** source goes into version control *first*. Never let a deployed
  artifact or a SharePoint folder be the only copy. When you discover code
  that isn't in git, preserve it before building on it.
- Recovery techniques that worked: extract `sourcesContent` from `*.js.map`;
  pull files from SharePoint via the M365 connector (`read_resource`).

## Azure Static Web Apps gotchas

- **Deployment auth policy:** if the SWA was created with **GitHub (OIDC)**,
  deployment-token pushes fail with *"No matching Static Web App was found or
  the api key was invalid."* Fix: SWA → Configuration → Deployment
  configuration → switch to **Deployment token**, then refresh the repo secret.
- **SWA overwrites the `Authorization` header** before requests reach managed
  functions (you'll see the platform's own JWT — "Token missing tid claim").
  Fix: send the user token in a **custom header** (`X-KreweConnect-Auth`) and
  read that first server-side.
- **First-ever deploy** can exceed the deploy action's ~10-min polling window
  and report *"Upload Timed Out"* even though Azure finished. Verify via the
  live site / `/api/health` before assuming failure and re-running.
- **Docs-only churn:** `paths-ignore` (`.claude/**`, `docs/**`, the .NET
  backend dir) keeps documentation commits from triggering deploys.

## MSAL / Entra auth

- **Redirect URI must be set at build time** (`VITE_REDIRECT_URI`). Without it,
  MSAL falls back to `window.location.origin` and dumps users on the site root
  after login instead of the app.
- **Know which flow you're in** — they fail in different, diagnostic ways:
  - *App-only client credentials* (service→Graph): no user, no consent prompt.
    Wrong/old secret → `AADSTS7000215`. Missing tenant consent →
    `700016`/`65001`/`90002`.
  - *ROPC* (username+password): bad password → `AADSTS50126`; user missing →
    `50034` (does NOT count toward lockout — safe to probe UPNs).
  - *Device code* (interactive, satisfies Conditional Access): "Taila"/OpenClaw
    authenticates this way. The redemption needs a valid client
    secret/assertion; a dead secret → `7000218`.
- **Never brute-force a real user's password** (smart-lockout would take the
  shared service account — and OpenClaw — offline).
- **Multi-tenant model we settled on (Apps365-style):** one multi-tenant app +
  **per-tenant admin consent** (`/adminconsent`, persists until revoked) +
  **app-only client-credentials per customer tenant**. GDAP is used **only for
  tenant discovery** (`delegatedAdminRelationships`), never on the auth path.

## Credential hygiene

- A rotated app secret left **stale copies in multiple stores** (AWS Secrets
  Manager + a SharePoint `appsettings.json`), both rejected by Entra. Keep
  **one authoritative secret store** and delete the rest.
- Plaintext secrets in committed config = bad even when later rotated. Use app
  settings / Key Vault / Secrets Manager references; redact on preservation.
- **The bootstrap paradox:** an agent can't fix a broken credential *from
  inside* the tenant the credential gates. Some credential/network setup must
  be done once from the outside (a keyboard).

## Agent enablement (AWS Secrets Manager + cloud session limits)

- See the **`noit-ops`** skill: bootstrap from AWS Secrets Manager (`noit/`
  prefix, `us-east-1`), read `noit/_index`, run a connection-test matrix.
- **Cloud sessions have a network allowlist.** Hosts not on it return *"Host
  not in allowlist"* regardless of credentials. Add domains in the
  environment's Custom network access. GitHub + AWS + login.microsoftonline.com
  worked by default; Graph/ARM/MSP-tool hosts did not.
- **MCP connectors bypass the allowlist** (they route through Anthropic). The
  M365 connector gave home-tenant SharePoint/mail/Teams as the user without any
  network config — invaluable for reading docs and recovering source.
- Never paste secrets into chat (they persist in the transcript); set them as
  environment variables on the session instead.

## React/SPA correctness

- **`useTenantContext` was a bare `useState`+`localStorage` hook, not a
  Context** — so the header switcher and each page held disconnected copies and
  pages never refreshed on tenant change. Foundational state shared across the
  tree must be a real **React Context provider**. (This was THE "tenant selector
  doesn't work" bug.)
- Enforce tenant isolation in **two places**: the backend (authoritative) and
  the frontend default (client users pinned to their own tenant).

## Working method (long autonomous sessions)

- **Pull/commit in batches**, each a clean resume point, so a mid-task context
  fill never loses work. Reading many large files into one session exhausts
  context — preserve incrementally.
- Keep a canonical **`SESSION-STATE.md`** updated so any new session resumes
  exactly. Record decisions as *decided* (not "open") once confirmed.
- Mock-data stubs leak: the .NET `GdapService` mock GUIDs
  (`aaaaaaaa-1111-…`) propagated into the frontend `tenantConfig` as
  placeholders. Treat mock fixtures as a liability to replace, not seed data.

## 2026-06-16 session — multi-tenant isolation, directory UX, onboarding

- **Single-tenant MSAL authority silently breaks the whole isolation model.**
  `msalConfig` had `authority = login.microsoftonline.com/<NOIT-tenant>`. Client
  users (who are guests in NOIT) then got tokens with `tid = NOIT`, so
  `isMspAdmin` (`tid === NOIT`) was **true for everyone** — clients saw the MSP
  dashboard + cross-client switcher + other tenants' data, and the API's
  tid-based isolation was defeated too. Fix: authority → **`/organizations`**
  (each user authenticates in their own tenant) + frontend route guards
  (`MspAdminRoute`) + role-gated nav. Verify multi-tenant readiness with a probe:
  the `/organizations` authorize endpoint returns **AADSTS50058** (no session)
  for a multi-tenant app, **AADSTS50194** if it's single-tenant.
- **`companyName` is a per-employee Graph attribute (the physical location), not
  the tenant/org name.** Geaux → dealership, Xtreme → "Xtreme Nissan"/"Xtreme
  CDJR". The directory's Company filter must source `companyName`, and one tenant
  can legitimately contain many companies. Never render a tenant GUID as a label.
- **App-only Graph generally cannot read `birthday`** (a personal property). The
  workable pattern: store birthday MM/DD (year omitted for privacy; **12/31 =
  opt-out sentinel, hidden**) in a **custom extension attribute** that IS
  app-readable — either a directory extension (`extension_<appId>_name`) or
  `extensionAttribute1..15` (via `onPremisesExtensionAttributes`). Make the
  attribute name a config knob (`BIRTHDAY_ATTRIBUTE` / `ANNIVERSARY_ATTRIBUTE`)
  so it's the same setting across clients with no code change.
- **Never let one optional `$select` field break the directory.** Adding
  `birthday`/`employeeHireDate`/custom attrs to `/users` can 400 (or surface an
  opaque 404); wrap the fetch to **retry with a base `$select`** on 400/404, and
  surface the **real Graph error** (code + message + request-id), not a bare
  status.
- **Render crashes must not blank the whole SPA.** The org chart built its tree
  eagerly and recursively with no cycle guard — a manager cycle/self-manager in
  real Entra data caused infinite recursion → crash → (no error boundary) → the
  entire app unmounted, so Back/refresh "wouldn't load". Fix: cycle guard
  (visited set) + a **top-level ErrorBoundary** and a per-route one (keyed by
  pathname) that show the actual error instead of a blank page.
- **Admin consent must be performed by a Global Admin native to the target
  tenant, signing in directly** (use incognito + "Use another account" so
  browser SSO doesn't silently sign you in as the NOIT partner account). If it
  runs under the partner identity, Azure tries the **delegated/GDAP** path and
  fails with **"GDAP not in place"** unless the GDAP relationship includes a role
  that can grant app consent (Application Administrator / Privileged Role Admin).
  Also: app-only permissions take **~10–15+ min to propagate** after consent —
  a freshly consented tenant can transiently 403/404.
- **Domain guessing is unreliable** — confirm tenant IDs from the tenant's own
  OIDC discovery (`/<domain>/v2.0/.well-known/openid-configuration`) or, better,
  CIPP `ListTenants`. Two surprises this session: a guessed domain resolved to a
  *different* org (wrong tenant), and **two different companies shared one Entra
  tenant** (multiple verified domains) — use `companyName` to separate them in
  the UI, and list the tenant once in `CLIENT_TENANTS`.
- **Environment config only applies to a NEW session.** Network-allowlist and
  env-var/AWS-key changes never reach the running container — set them, then
  start a fresh session. Also: this repo's **default branch is
  `claude/brave-feynman-g2j9v5`, not `main`** — a fresh clone lands there, so
  `git fetch && git checkout main` (or set `main` as default) to see current work.
