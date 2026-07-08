---
id: device-and-application-inventory
title: Device & Application Inventory Policy
category: Configuration Management
version: 0.1-draft
status: draft
frameworks:
  nist_800_171:
    - "3.4.1"   # Establish and maintain baseline configurations and inventories of organizational systems
    - "3.4.2"   # Establish and enforce security configuration settings
    - "3.4.3"   # Track, review, approve/disapprove, and log changes
  cmmc_2_0:
    - "CM.L2-3.4.1"
    - "CM.L2-3.4.2"
  nist_csf:
    - "ID.AM-1"  # Physical devices and systems are inventoried
    - "ID.AM-2"  # Software platforms and applications are inventoried
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

# {{Company.LegalName}} — Device & Application Inventory Policy

**Effective date:** {{Policy.EffectiveDate}}
**Owner:** {{IT.Manager}}
**Maintained with:** {{IT.ProviderName}}
**Review cadence:** {{Policy.ReviewCadence}}

## 1. Purpose

This policy establishes how {{Company.ShortName}} identifies, records, and maintains an
accurate inventory of the hardware devices and software applications that store, process, or
transmit company and client information. A current inventory is the foundation for
configuration management, vulnerability management, licensing, and incident response, and is
required to demonstrate compliance with NIST SP 800-171 (3.4.1–3.4.3) and CMMC 2.0
Configuration Management practices.

## 2. Scope

This policy applies to all information systems owned, leased, or managed by
{{Company.LegalName}} at {{Company.Address}} and any remote or cloud locations, including:

- Endpoints (desktops, laptops, tablets, mobile devices)
- Servers and virtual machines (on-premises and cloud)
- Network infrastructure (firewalls, switches, wireless access points)
- Peripherals that store data (printers/MFPs, external drives)
- Software applications, operating systems, and cloud/SaaS services

## 3. Policy

### 3.1 Hardware inventory *(NIST 800-171 3.4.1; CSF ID.AM-1)*
- A complete inventory of all in-scope devices shall be maintained and include, at minimum:
  asset identifier, device type, owner/assigned user, physical/logical location, operating
  system and version, and current status (active, spare, retired).
- New devices shall be recorded in the inventory before being placed into production.
- The inventory shall be reconciled against automated discovery data at least
  {{Policy.ReviewCadence}}.

### 3.2 Software & application inventory *(NIST 800-171 3.4.1; CSF ID.AM-2)*
- A current inventory of authorized operating systems, applications, and cloud/SaaS services
  shall be maintained, including version and business owner.
- Only software that appears on the authorized list may be installed. Unauthorized software
  shall be removed upon discovery.

### 3.3 Baseline configuration *(NIST 800-171 3.4.1–3.4.2)*
- Standard secure baseline configurations shall be defined for each device class and applied
  before deployment.
- Deviations from baseline require documented approval by {{IT.Manager}}.

### 3.4 Change tracking *(NIST 800-171 3.4.3)*
- Additions, removals, and significant changes to inventoried assets shall be logged, reviewed,
  and approved or disapproved through the change process.

### 3.5 Ownership & review
- {{IT.Manager}}, supported by {{IT.ProviderName}}, is responsible for maintaining this policy
  and the associated inventories.
- This policy shall be reviewed at least {{Policy.ReviewCadence}} and after any material change
  to the environment.

## 4. Roles & responsibilities

| Role | Responsibility |
|---|---|
| {{IT.Manager}} | Owns the policy; approves baselines and changes |
| {{IT.ProviderName}} | Maintains inventories, runs discovery, reports exceptions |
| All staff | Do not install unauthorized software; report new/lost devices |

## 5. Enforcement

Failure to comply may result in removal of the offending asset from the network and, for
personnel, disciplinary action consistent with {{Company.ShortName}} policy.

## 6. Control mapping

| Framework | Control(s) |
|---|---|
| NIST SP 800-171 | 3.4.1, 3.4.2, 3.4.3 |
| CMMC 2.0 | CM.L2-3.4.1, CM.L2-3.4.2 |
| NIST CSF | ID.AM-1, ID.AM-2 |

> **Draft notice:** Generated as a NOIT Policy Hub template. Placeholder tokens are resolved
> per client by the merge engine. Requires vCIO/legal review before issuance.
