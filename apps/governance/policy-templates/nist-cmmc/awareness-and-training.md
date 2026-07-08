---
id: awareness-and-training
title: Security Awareness & Training Policy
category: Awareness & Training
version: 0.1-draft
status: draft
frameworks:
  nist_800_171:
    - "3.2.1"   # Ensure managers/administrators/users are aware of security risks
    - "3.2.2"   # Ensure personnel are trained to carry out their security responsibilities
    - "3.2.3"   # Provide security awareness training on recognizing/reporting insider threats
  cmmc_2_0:
    - "AT.L2-3.2.1"
    - "AT.L2-3.2.2"
    - "AT.L2-3.2.3"
  nist_csf:
    - "PR.AT-1"  # All users are informed and trained
    - "PR.AT-2"  # Privileged users understand roles and responsibilities
distribution:
  platform: "Phin Security"
  method: "Policy Hub generates the client-customized doc; Phin distributes and collects per-employee acknowledgment (M4 Track A)."
merge_tokens:
  - "{{Company.LegalName}}"
  - "{{Company.Address}}"
  - "{{Company.ShortName}}"
  - "{{IT.Manager}}"
  - "{{IT.ProviderName}}"
  - "{{Policy.EffectiveDate}}"
  - "{{Policy.ReviewCadence}}"
  - "{{Training.Frequency}}"
source: "Seeded for NOIT Policy Hub (MSPWerks replacement). Draft — legal/vCIO review required before client issue."
---

# {{Company.LegalName}} — Security Awareness & Training Policy

**Effective date:** {{Policy.EffectiveDate}}
**Owner:** {{IT.Manager}}
**Maintained with:** {{IT.ProviderName}}
**Review cadence:** {{Policy.ReviewCadence}}

## 1. Purpose

This policy establishes {{Company.ShortName}}'s security awareness and training program so that
all personnel understand the information security risks associated with their activities and
are prepared to carry out their security responsibilities. It supports compliance with NIST SP
800-171 (3.2.1–3.2.3) and CMMC 2.0 Awareness & Training practices.

## 2. Scope

Applies to all employees, contractors, and third parties who access {{Company.LegalName}}
systems or data, including privileged and administrative users.

## 3. Policy

### 3.1 General awareness *(NIST 800-171 3.2.1; CSF PR.AT-1)*
- All personnel shall complete security awareness training upon hire and at least
  {{Training.Frequency}} thereafter.
- Awareness content shall cover current threats relevant to {{Company.ShortName}}, including
  phishing, social engineering, credential hygiene, safe data handling, and physical security.

### 3.2 Role-based training *(NIST 800-171 3.2.2; CSF PR.AT-2)*
- Personnel with elevated or specialized responsibilities (administrators, privileged users)
  shall receive role-based training appropriate to those duties.

### 3.3 Insider threat awareness *(NIST 800-171 3.2.3)*
- Training shall include recognizing and reporting indicators of insider threat and the
  approved reporting channels.

### 3.4 Ongoing reinforcement
- {{Company.ShortName}} may use simulated phishing and periodic micro-training to reinforce
  awareness. Results inform additional targeted training.

### 3.5 Distribution & acknowledgment
- This policy and its associated training are distributed through **Phin Security**, which
  collects and records each user's acknowledgment.
- Completion and acknowledgment records shall be retained as evidence of compliance and
  surfaced in the Policy Hub compliance dashboard.

### 3.6 Review
- {{IT.Manager}}, supported by {{IT.ProviderName}}, shall review this policy and the training
  program at least {{Policy.ReviewCadence}}.

## 4. Roles & responsibilities

| Role | Responsibility |
|---|---|
| {{IT.Manager}} | Owns the program; reviews completion/acknowledgment |
| {{IT.ProviderName}} | Delivers training via Phin, tracks completion, reports gaps |
| All staff | Complete assigned training on time; acknowledge this policy; report threats |

## 5. Enforcement

Failure to complete required training or acknowledge this policy may result in restricted
access and disciplinary action consistent with {{Company.ShortName}} policy.

## 6. Control mapping

| Framework | Control(s) |
|---|---|
| NIST SP 800-171 | 3.2.1, 3.2.2, 3.2.3 |
| CMMC 2.0 | AT.L2-3.2.1, AT.L2-3.2.2, AT.L2-3.2.3 |
| NIST CSF | PR.AT-1, PR.AT-2 |

> **Draft notice:** Generated as a NOIT Policy Hub template. Placeholder tokens are resolved
> per client by the merge engine. Distribution/acknowledgment via Phin Security (M4 Track A).
> Requires vCIO/legal review before issuance.
