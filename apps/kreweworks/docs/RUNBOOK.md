# Runbook: deploy, configure, operate

## A. One-time provisioning per client (NOIT Azure, about 10 minutes)

Prerequisites: `az` CLI signed in to the NOIT tenant with Contributor on the subscription, rights to
edit the sign-in app registration, and the client's private profile from
`noit-client-tools/kreweworks/clients/<slug>/profile.json`.

```bash
export SUBSCRIPTION=<subscription id>
export PROFILE=/path/to/noit-client-tools/kreweworks/clients/<slug>/profile.json
export BOOTSTRAP_ADMINS=<comma-separated NOIT admins>
export GRAPH_CLIENT_SECRET=<value from AWS, pasted once into this shell only>
cd apps/kreweworks/infra && ./provision.sh
```

It creates (idempotently) `kreweworks-<slug>-rg`, a storage account, the `kreweworks-<slug>` Static
Web App (Standard), all app settings with **mail disabled**, and the sign-in redirect URIs.

## B. Deploys

Deploys run from the private repo (`noit-client-tools`, workflow "KreweWorks deploy"). The workflow
checks out this engine, copies the client's profile and logo into the package, runs the API tests
against that profile, then uploads `app/` and `api/` with the client's SWA deployment token
(`KREWEWORKS_SWA_TOKEN_<SLUG>`).

## C. First sign-in and access

1. Open the default host and sign in with a bootstrap admin.
2. **Access**: add HR as `hr`, client leadership as `hr` or `admin`, and hiring managers as `manager`
   scoped to their locations. The directory picker searches the client tenant.
3. People not on the list see the "ask HR or IT" page.

## D. Custom domain

1. At the client's DNS: `employees.<domain>  CNAME  <name>.azurestaticapps.net` (Tammy approves every DNS change).
2. Re-run `provision.sh`. Azure may ask for a TXT validation record. The certificate is automatic.

## E. Settings reference

See `infra/app-settings.example.json`. Toggles worth knowing:

- `PORTAL_MAIL_ENABLED=false` silences all email (useful for a quiet pilot).
- `PORTAL_MAIL_BCC` copies every notification somewhere (audit mailbox).
- `PORTAL_ALLOWED_TENANTS` limits which Entra tenants may sign in at all.
- `TECHTOOLS_BASE_URL` is where the IT lane links go.

## F. Local development

```bash
cd apps/kreweworks/api && npm install
PORTAL_BOOTSTRAP_ADMINS=you@noitgroup.com \
PORTAL_DEV_PRINCIPAL='{"upn":"you@noitgroup.com","name":"You","tid":"00000000-0000-4000-8000-0000000a0017"}' \
node dev-server.js            # http://localhost:4280, data in api/.data/portal-data.json
npm test                      # API and workflow tests
```

Add `PORTAL_GRAPH_CLIENT_SECRET` locally to exercise the directory picker and (with `PORTAL_MAIL_ENABLED=true`) real email.

## G. Operating notes

- **Export**: HR can download `people.csv` and `requests.csv` from the People and Requests pages.
- **Changing the process**: stages, labels, help text and who may act are in `api/src/lib/model.js`. Reference lists, checklists and wording are in the client profile (see docs/ARCHITECTURE.md).
- **Changing the brand**: `branding` in the client profile (logo path and colors).
- **Health**: `GET /api/health` reports storage mode, Graph configuration and mail state without authentication.
- **Backups**: the storage account is in NOIT's subscription; enable soft delete and point-in-time restore on the tables and blobs if you want more than LRS.
- **Removing someone's access**: Access page, Remove. They must sign out and back in for the role cookie to refresh (SWA caches roles per session).
