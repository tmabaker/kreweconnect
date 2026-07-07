---
id: access-control
title: Access Control Policy
category: Access Control
version: 0.1-draft
status: draft
frameworks:
  nist_800_171:
    - "3.1.1"   # Limit system access to authorized users, processes, and devices
    - "3.1.2"   # Limit access to the types of transactions/functions authorized users may execute
    - "3.1.4"   # Separation of duties
    - "3.1.5"   # Least privilege
    - "3.1.12"  # Monitor and control remote access sessions
    - "3.1.13"  # Cryptographic mechanisms to protect remote access
  cmmc_2_0:
    - "AC.L1-3.1.1"
    - "AC.L1-3.1.2"
    - "AC.L2-3.1.5"
    - "AC.L2-3.1.12"
  nist_csf:
    - "PR.AC-1"  # Identities and credentials are managed
    - "PR.AC-4"  # Access permissions managed with least privilege and separation of duties
    - "PR.AC-7"  # Users/devices/assets are authenticated
merge_tokens:
  - "{{Company.LegalName}}"
  - "{{Company.Address}}"
  - "{{Company.ShortName}}"
  - "{{IT.Manager}}"
  - "{{IT.ProviderName}}"
  - "{{Policy.EffectiveDate}}"
  - "{{Policy.ReviewCadence}}"
source: "Seeded for NOIT Policy Hub (MSPWerks replacement). Draft — legal/vCIO review required before client issue."
---

# {{Company.LegalName}} — Access Control Policy

**Effective date:** {{Policy.EffectiveDate}}
**Owner:** {{IT.Manager}}
**Maintained with:** {{IT.ProviderName}}
**Review cadence:** {{Policy.ReviewCadence}}

## 1. Purpose

This policy defines how {{Company.ShortName}} grants, manages, and revokes access to
information systems and data so that access is limited to authorized users and processes and
is consistent with least privilege. It supports compliance with NIST SP 800-171 (3.1.x) and
CMMC 2.0 Access Control practices.

## 2. Scope

Applies to all users (employees, contractors, and third parties), devices, and accounts that
access {{Company.LegalName}} systems and data, on-premises and in the cloud.

## 3. Policy

### 3.1 Account management *(NIST 800-171 3.1.1; CSF PR.AC-1)*
- Access shall be provisioned only through an approved request tied to a specific role.
- Each user shall have a unique account; shared/generic accounts are prohibited except where
  documented and compensated for.
- Accounts shall be disabled promptly upon termination or role change (target: same business
  day) and reviewed at least {{Policy.ReviewCadence}}.

### 3.2 Least privilege & separation of duties *(NIST 800-171 3.1.4–3.1.5; CSF PR.AC-4)*
- Users shall be granted the minimum access required to perform their duties.
- Privileged/administrative access shall be restricted, separately approved, and logged.
- Where practical, conflicting duties (e.g., request vs. approval) shall be separated.

### 3.3 Authentication *(NIST 800-171 3.1.1; CSF PR.AC-7)*
- Multi-factor authentication shall be enforced for remote access, administrative access, and
  access to cloud services holding company or client data.
- Passwords/credentials shall meet {{Company.ShortName}}'s credential standard.

### 3.4 Remote access *(NIST 800-171 3.1.12–3.1.13)*
- Remote access shall be authorized, encrypted in transit, and routed through approved
  mechanisms.
- Remote sessions shall be monitored and subject to session lock/timeout.

### 3.5 Review & recertification
- Access rights, especially privileged access, shall be reviewed and recertified at least
  {{Policy.ReviewCadence}} by {{IT.Manager}}.

## 4. Roles & responsibilities

| Role | Responsibility |
|---|---|
| {{IT.Manager}} | Approves access, owns recertification |
| {{IT.ProviderName}} | Implements provisioning/deprovisioning, enforces MFA, monitors remote access |
| All staff | Use only authorized access; protect credentials; report suspected misuse |

## 5. Enforcement

Violations may result in suspension of access and disciplinary action consistent with
{{Company.ShortName}} policy and applicable law.

## 6. Control mapping

| Framework | Control(s) |
|---|---|
| NIST SP 800-171 | 3.1.1, 3.1.2, 3.1.4, 3.1.5, 3.1.12, 3.1.13 |
| CMMC 2.0 | AC.L1-3.1.1, AC.L1-3.1.2, AC.L2-3.1.5, AC.L2-3.1.12 |
| NIST CSF | PR.AC-1, PR.AC-4, PR.AC-7 |

> **Draft notice:** Generated as a NOIT Policy Hub template. Placeholder tokens are resolved
> per client by the merge engine. Requires vCIO/legal review before issuance.
