# Policy Hub — Client Intake Questionnaire

> **Purpose:** the question-and-answer script for the client session that customizes their
> policies. Each answer fills a `{{merge token}}` used across the policy templates. Capture the
> answers here (or in the client's row), and the merge engine produces client-ready documents.
>
> **This is also the M2 spec.** When the Client Data Binding & Merge Engine is built, these
> questions become the fields in the in-app "client profile" interview, and the answers persist
> as the client's `ClientPolicyProfile`.

**Client:** ____________________   **Date:** ____________   **Interviewer:** ____________

---

## Part A — Scoping (which policies apply, at what level)

These don't fill tokens; they decide framework/level and which templates to issue.

| # | Question | Answer | Notes |
|---|---|---|---|
| A1 | Does the org handle **FCI** (Federal Contract Information) or **CUI** (Controlled Unclassified Information)? | | Drives CMMC applicability |
| A2 | Target framework / level: NIST 800-171, **CMMC 2.0 Level 1**, or **Level 2**? | | L1 = FCI, L2 = CUI |
| A3 | Which locations / systems / cloud tenants are in scope? | | Defines the boundary |
| A4 | Compliance deadline or driver (contract, cyber-insurance, audit)? | | Prioritizes rollout |

---

## Part B — The interview (fills the merge tokens)

Ask these for every client. The **Token** column is what each answer populates.

| # | Question | Token | Example answer |
|---|---|---|---|
| B1 | What is the organization's **full legal name**? | `{{Company.LegalName}}` | "Fishman Haygood, LLP" |
| B2 | What **short name** should policies use in-text? | `{{Company.ShortName}}` | "Fishman Haygood" |
| B3 | What is the **primary business address**? | `{{Company.Address}}` | "201 St. Charles Ave, New Orleans, LA" |
| B4 | Who is the **policy owner / IT manager** (name + title)? | `{{IT.Manager}}` | "Jane Doe, Director of Operations" |
| B5 | Who is the **managed IT provider**? | `{{IT.ProviderName}}` | "NOIT Group" |
| B6 | What **effective date** should this policy set carry? | `{{Policy.EffectiveDate}}` | "2026-08-01" |
| B7 | How often will policies be **reviewed**? | `{{Policy.ReviewCadence}}` | "annually" |
| B8 | How often is **security awareness training** delivered? | `{{Training.Frequency}}` | "annually, with quarterly phishing sims" |

---

## Part C — Policy-specific confirmations (tailoring & evidence)

Not tokens — these confirm the control statements are true for the client, or flag gaps to fix.
Answers feed the vCIO review and the Purview Compliance Manager evidence step (M4 Track B).

### Device & Application Inventory *(NIST 3.4.x / CMMC CM)*
| # | Question | Answer |
|---|---|---|
| C1 | Is there a current hardware/software inventory? What tool maintains it? | |
| C2 | Are baseline configurations defined per device class? | |
| C3 | Is there an authorized-software list, and is unauthorized software removed? | |

### Access Control *(NIST 3.1.x / CMMC AC)*
| # | Question | Answer |
|---|---|---|
| C4 | Is **MFA** enforced for remote, admin, and cloud access? | |
| C5 | What is the **deprovisioning SLA** on termination (target: same day)? | |
| C6 | How often is **access recertified**, especially privileged access? | |

### Security Awareness & Training *(NIST 3.2.x / CMMC AT)*
| # | Question | Answer |
|---|---|---|
| C7 | Is the client onboarded to **Phin Security** (for distribution + acknowledgment)? | |
| C8 | Is **role-based training** provided for privileged users? | |
| C9 | Are phishing simulations run? At what cadence? | |

---

## Token → questions → where used (reference)

| Token | Filled by | Used in policies |
|---|---|---|
| `{{Company.LegalName}}` | B1 | Inventory, Access Control, Awareness |
| `{{Company.ShortName}}` | B2 | Inventory, Access Control, Awareness |
| `{{Company.Address}}` | B3 | Inventory, Access Control |
| `{{IT.Manager}}` | B4 | Inventory, Access Control, Awareness |
| `{{IT.ProviderName}}` | B5 | Inventory, Access Control, Awareness |
| `{{Policy.EffectiveDate}}` | B6 | Inventory, Access Control, Awareness |
| `{{Policy.ReviewCadence}}` | B7 | Inventory, Access Control, Awareness |
| `{{Training.Frequency}}` | B8 | Awareness |

> As more policies are added to the library, new tokens/questions are appended here so this stays
> the single intake script. When M2 ships, this questionnaire is what the app renders as the
> guided client interview.
