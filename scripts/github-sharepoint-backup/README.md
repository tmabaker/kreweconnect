# GitHub → SharePoint backup

Backs up the full NOIT GitHub estate (9 repos, all branches, full history)
to SharePoint as verified git bundles.

- **Destination:** `noseitgroup.sharepoint.com/sites/tabcc` → Shared
  Documents → `GitHub Backups/<YYYY-MM-DD>/`
- **Repos covered:** noit-techtools, kreweconnect, noit-client-tools,
  cippms, noit-techportal, killer-tools-site, skoolskills, krewecatch,
  krewesuite (edit `REPOS` in the script to change).
- **Artifacts per run:** one `<repo>-<date>.bundle` per repo (restore with
  `git clone <file>.bundle`), plus `SHA256SUMS-<date>.txt` and
  `MANIFEST-<date>.md` (refs/HEAD/size per repo).

## How to run

### From a Claude session (or any shell)

```bash
python3 scripts/github-sharepoint-backup/backup_github_to_sharepoint.py
```

Requirements:

- **Graph credential** — either `MSGRAPH_CLIENT_ID` / `MSGRAPH_CLIENT_SECRET`
  / `MSGRAPH_TENANT_ID` env vars, or AWS env creds so the script can read
  `noit/0626_MSClaudeAgent` (Taila Agent; both secret shapes handled).
- **GitHub credential** — `BACKUP_GH_PAT` or `GH_TOKEN` (repo read on all 9),
  or `GH_CLONE_TEMPLATE` with a `{repo}` placeholder (e.g. the Claude
  session's local git proxy URL).

### From GitHub Actions (scheduled)

`.github/workflows/github-sharepoint-backup.yml` runs weekly (Sun 08:00 UTC)
and on manual dispatch. It needs these **repo secrets on kreweconnect**:

| Secret | Value |
|---|---|
| `MSGRAPH_CLIENT_ID` | app registration client ID (Taila Agent: `90f52d62-9133-47e0-a6a1-45c9bec69558`) |
| `MSGRAPH_CLIENT_SECRET` | its client secret |
| `MSGRAPH_TENANT_ID` | `7fb15bf6-9cea-4c72-89bd-1ab9f16eec8e` |
| `BACKUP_GH_PAT` | PAT with read access to all 9 repos |

## Prerequisite: Graph permission (BLOCKING as of 2026-07-09)

The identity used must hold an **Application** Graph permission that can
write the tabcc site. Taila Agent currently has **no Sites/Files role** —
the script checks the token's `roles` claim and stops early with a clear
error until one of these is granted + admin-consented:

- `Sites.Selected` (preferred, least privilege) + a `write` permission grant
  on the tabcc site for the app, or
- `Sites.ReadWrite.All`.

The script fails fast with the exact missing-role message, so a failed run
is safe and diagnostic.

## Status log

- **2026-07-09** — pipeline built; clone → bundle → verify stage ran
  successfully in-session for all 9 repos (123 MB total). Upload not run:
  the session environment had no AWS env creds and Taila Agent lacks a
  Sites permission (see above). Once either credential path is in place,
  the same command completes the upload.
