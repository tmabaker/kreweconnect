# Seed — NIST/CMMC policy templates (R2, NOC-54)

`seed-nist-cmmc-policies.sql` inserts the three NIST/CMMC policy drafts into the
live `krewe-governance-db`:

| Policy | Category | Wizard variables |
|---|---|---|
| Device & Application Inventory Policy | Configuration Management | 7 |
| Access Control Policy | Access Control | 6 |
| Security Awareness & Training Policy | Awareness & Training | 7 |

Each policy gets a `Policies` row (Status `draft`, CurrentVersion 1), a matching
`PolicyVersions` v1 row, and one `PolicyVariables` row per `{{token}}` its body
actually uses (question wording from
`../policy-templates/client-intake-questionnaire.md`, Part B). All variables are
marked universal (`IsUniversal = 1`) — Part B is asked once per client.

> Note: `access-control.md`'s front-matter lists `{{Company.Address}}` but its
> body never uses it, so no variable row is generated for it there — the
> generator extracts tokens from the body, mirroring what the TemplateEngine
> substitutes at assembly time.

## Running it

- **Idempotent**: categories matched by `Name`, policies by `Title`, variables by
  `(PolicyId, Key)` — safe to re-run and safe against pre-existing rows.
- **Database-first**: run it manually (Azure Portal Query editor, or `sqlcmd`
  with the connection string from AWS `noit/krewe-governance-sql`). Never run EF
  migrations or `EnsureCreated` against this database.
- Generated file — don't hand-edit. Edit the templates under
  `../policy-templates/nist-cmmc/` and re-run `python3 generate_seed.py`.

Status: **executed against the live DB 2026-07-08** (via the tools/smoke run —
Policies 0→3, 20 wizard variables, 3 categories, 3 v1 versions). Safe to
re-run; it is a no-op against the seeded rows.
