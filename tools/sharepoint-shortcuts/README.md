# SharePoint Shortcuts — KreweConnect Directory & Org Chart on client portals

Puts an **"Employee Directory & Org Chart"** Quick Links web part on each
client's SharePoint portal page, linking into KreweConnect:

| Shortcut | URL |
|---|---|
| Employee Directory | `https://krewesuite.noitgroup.com/app/kreweconnect/directory` |
| Org Chart | `https://krewesuite.noitgroup.com/app/kreweconnect/org-chart` |

Client users land on KreweConnect, sign in with their own M365 account, and see
only their own tenant's directory (tenant isolation is enforced server-side by
the caller's `tid` — see `docs/architecture-reset.md`).

Rollout roster: `clients.json` (Geaux Automotive, Level BR, Fishman Haygood,
Provident, Xtreme Automotive — tenant IDs match the SWA `CLIENT_TENANTS`
setting). All five tenants already have the KreweConnect product app
(`eaeafccb…`) admin-consented, so the destination app works for every one of
them. To add another client (e.g. True Title,
`5e17b006-ba85-4bc8-8638-441a4d4264e6`), append it to `clients.json`.

## How it works

- **Actor:** single-purpose multi-tenant app **"NOIT KreweConnect Shortcuts"**,
  client id `cf03866e-22d1-433f-84cb-bb08aee083c6`, registered in the NOIT
  tenant. Its manifest contains **only** Microsoft Graph *application*
  permission `Sites.ReadWrite.All` — deliberately NOT the Taila agent app,
  whose manifest carries Intune-write / app-management permissions that a
  client tenant should never be asked to consent.
- **No stored secret:** by default the script authenticates as the Taila agent
  (AWS secret `noit/0626_MSClaudeAgent`), mints an **ephemeral** client secret
  on the shortcuts app (`addPassword`), uses it for the run, then deletes it
  (`removePassword`). Set `SHORTCUTS_CLIENT_SECRET` in the environment to skip
  the bootstrap (e.g. running outside the Claude environment).
- **Write path:** Graph v1.0 sitePage APIs. The Quick Links web part payload
  mirrors a live instance read back from the TABCC site (the
  `serverProcessedContent` key/value arrays and `#graph.Json` typing are
  exactly what SharePoint emits — don't "clean them up").
- **Idempotent:** a web part titled "Employee Directory & Org Chart" (or
  containing the directory URL) is updated in place; otherwise a new
  one-column section is appended at the *bottom* of the page. Existing page
  content is never modified.
- Site navigation (quick launch / top nav) is **not** exposed by Graph; that
  would need cert-based SharePoint REST. The web part approach was chosen so
  the whole tool runs on one permission the estate already uses.

## Runbook

```bash
# 0. see where each tenant stands (read-only)
python3 add_shortcuts.py --status

# 1. print the one-time admin-consent URL per tenant
python3 add_shortcuts.py --consent-urls
```

**Consent (one click per tenant, once ever):** open the tenant's URL and sign
in as a Global Admin *of that client tenant* — or do it via GDAP:
Microsoft 365 admin center → customer → Entra admin center → Enterprise
applications → grant admin consent for "NOIT KreweConnect Shortcuts". The app
requests exactly one permission: Graph `Sites.ReadWrite.All` (application).

```bash
# 2. preview, then roll out (per tenant or all)
python3 add_shortcuts.py --apply --dry-run
python3 add_shortcuts.py --apply --tenant "Geaux Automotive"
python3 add_shortcuts.py --apply
```

Targets the tenant **root site**'s `Home.aspx` by default. Override per client
in `clients.json` with `"site": "/sites/intranet"` and/or
`"page": "Portal.aspx"` if a client's portal lives elsewhere. Use
`--new-page` to create a standalone `KreweConnect.aspx` page instead of
touching the home page.

```bash
# end-to-end smoke test against NOIT's own TABCC site (no client involved)
python3 add_shortcuts.py --self-test
```

The self-test created
`https://noseitgroup.sharepoint.com/sites/tabcc/SitePages/kreweconnect-shortcuts-test.aspx`
(2026-07-11) — look at it to see exactly what clients will get; delete the
page whenever.

## Rollback / safety

- Publishing creates a new **page version**: Site Pages library → the page →
  Version history → restore the previous version. Nothing else is changed.
- `--status` and `--consent-urls` are read-only; `--dry-run` previews writes.
- Hardening option (later): switch the app to Graph `Sites.Selected` and grant
  it write on only each client's portal site. Costs an extra per-site grant
  step per tenant; revisit if a client pushes back on `Sites.ReadWrite.All`.
