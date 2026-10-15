# KreweWorks

The KreweSuite employee lifecycle portal. Hiring managers, HR and IT move a person through
**hire**, **change** and **terminate** in one place, with every hand-off routed and tracked,
instead of passing paper checklists and emails between departments.

KreweWorks started as a single-client employee portal (October 2026) and was generalized so
any client can run it from a profile.

| Piece | Where |
|---|---|
| Engine (this folder: API, single-page app, tests, provisioning) | `tmabaker/kreweconnect` **(public: no client data, ever)** |
| Client profiles, logos and per-client deploy workflow | `tmabaker/noit-client-tools/kreweworks/` (private) |
| Runtime data (people, requests, attachments) | One Azure Storage account per client, in NOIT's subscription |

## What it does

- One record per person for life: applicant, hired, active, changed, terminated, rehired.
- Hire: pre-employment packet, HR screening, approval, offer and start date, the IT checklist,
  the New Hire Notice to IT, account build, day one.
- Change: transfer, promotion, department, manager, desk or extension, access.
- Terminate: access end time (immediate for involuntary), equipment recovery, mailbox delegate,
  HR and IT checklists, rehire eligibility (HR only).
- **Confidential hires**: a hire marked confidential is visible only to HR, admins, whoever filed
  it and the hiring manager. IT sees it once the New Hire Notice reaches IT. Duplicate checks
  report "a confidential record matches" without revealing who. HR can lift confidentiality, and
  it lifts automatically when the employee starts.
- Email at every hand-off from the client's support mailbox; never passwords, SSNs or screening detail.
- A co-managed client's second IT partner can be copied on every IT hand-off (`mail.itCc`).

## Layout

```
api/                 Azure Functions (Node 20)
  src/lib/profile.js loads the client profile (see docs/ARCHITECTURE.md)
  src/profiles/      demo.json (fictional, committed); active.json (written by the private deploy, gitignored)
  test/              node --test; runs against the demo profile
app/                 static SPA, no build step; branding and wording come from /api/config
infra/provision.sh   one client's SWA + storage + settings, driven by its profile
docs/                ARCHITECTURE.md, RUNBOOK.md
```

## Quick start (local, demo profile)

```bash
cd api && npm ci && npm test
PORTAL_BOOTSTRAP_ADMINS=you@noitgroup.com \
PORTAL_DEV_PRINCIPAL='{"upn":"you@noitgroup.com","name":"You","tid":"00000000-0000-4000-8000-0000000a0017"}' \
node dev-server.js     # http://localhost:4280
```
