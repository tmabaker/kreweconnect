# KreweWorks architecture

## Decisions

1. **One engine, one deployment per client.** Each client gets its own Static Web App, its own
   storage account and its own custom domain (`employees.<client domain>`). Hiring records are the
   most sensitive data in KreweSuite, so they never share a datastore across clients, even though
   the KreweConnect directory is multi-tenant. Cost is about USD 9 per month per client (SWA Standard).
2. **The engine is public, the profiles are private.** This repository is public. Anything that
   identifies a client (tenant ids, staff names, mailboxes, locations, role matrices, logos) lives in
   `tmabaker/noit-client-tools/kreweworks/clients/<slug>/` and is copied into the package at deploy
   time as `api/src/profiles/active.json` and `app/assets/client/*`.
3. **Process in code, wording and lists in the profile.** Stages, owners and who may act live in
   `api/src/lib/model.js`. Locations, titles, applications, packet, screening, day-one and
   termination checklists, the HR system's name and any stage help text live in the profile.
4. **Sign-in** is SWA built-in Entra authentication with a multi-tenant app registration already
   consented in the client tenant. Only tenants in `tenants.allowed` may sign in,
   and only people on the access list (or bootstrap admins) see anything.

## Profile format

`api/src/profiles/demo.json` is a complete, fictional example. Keys:

| Key | Purpose |
|---|---|
| `client` | `slug`, `name`, `tenantId`, `primaryDomain`, `helpdesk {name,email,phone}`, `hr {email}`, `operatedBy` |
| `tenants.allowed` | Entra tenant ids allowed to sign in (client plus MSP) |
| `vocab` | `location` / `locations` (Store, Office, Vessel…), `hrSystem` (Netchex, Paylocity…), `portalName` |
| `branding` | `logo` (path under the app), `primary`, `primaryDark`, `accent`, `subtitle` |
| `mail` | `from`, `hr`, `it`, optional `itCc` (co-managed partner) |
| `deploy` | `baseUrl`, `tablePrefix`, `blobContainer`, `graphClientId` |
| `stores` | the locations (`id`, `name`, `short`, plus anything the client needs) |
| `departments`, `jobTitles` | pick lists |
| `applications` | `key`, `label`, `always`, `owner`; non-`always` apps are offered for deactivation at exit |
| `equipment` | IT checklist equipment |
| `accessProfiles.groups` | standard access by title group: `titles`, `apps`, `device`, `license` (shown as guidance on the hire form) |
| `packetItems`, `screeningItems`, `dayOneItems` | HR checklists |
| `terminationTypes`, `changeTypes`, `noticeStandards` | pick lists and IT notice minimums |
| `termination.hrChecks`, `termination.itChecks` | exit checklists (defaults are generic) |
| `credentialDelivery` | wording for how temporary passwords reach the employee and manager |
| `techtools` | optional NOIT Tech Tools page names for prefilled IT links (`addUser`, `modifyUser`, `removeUser`) |
| `workflowHelp` | optional per-stage help text, keyed `"hire.started"` etc.; `{hrSystem}` and `{location}` are filled in |
| `features.confidentialHires` | default `true` |
| `itPartner` | optional co-managed partner description shown to IT |
| `initialAccess` | optional first access list (`upn`, `displayName`, `role`, optional `stores`); fills the access table only while it is empty, so later changes made in the portal stand |

## Data compatibility with the pilot deployment

The engine keeps the pilot portal's storage shape (`storeId`, the `people` / `requests` / `events` /
`access` tables), so the pilot deployment can move to KreweWorks by deploying with its profile
and its existing `PORTAL_TABLE_PREFIX`. Two fields changed for terminations filed after the move:
`cdkDeactivate` became `deactivateApps` (a list), and the old payroll-system HR check became the
profile's `termination.hrChecks` keys (the pilot's profile keeps its original key, so nothing is lost).
