# KREWE Governance — Recovered Database Schema

> **Recovered 2026-07-06** from the live Azure SQL database, because the
> application source (per Linear **NOC-19**, "Phase 3 complete") could not be
> located in any repository. The database survived; this document + the EF Core
> model in `src/` reconstruct the app's data layer from it so it can be rebuilt
> against the **existing** database with no data loss.

## Source of truth (live)
| | |
|---|---|
| SQL Server | `noit-krwgov-0628.database.windows.net` (Canada Central) |
| Database | `krewe-governance-db` |
| Credentials | AWS Secrets Manager `noit/krewe-governance-sql` |
| Migration applied | `InitialCreate` (`__EFMigrationsHistory`) |
| Domain tables | 9 (below) + EF history + Azure `database_firewall_rules` system table |

## How it maps to NOC-19's six deliverables
1. Rebrand — (UI, not in DB)
2. EF Core + Azure SQL — `__EFMigrationsHistory`, all tables
3. Template engine (`{{variable_key}}`) — `Policies`, `PolicyCategories`, `PolicyVersions`
4. Variable collection wizard — `PolicyVariables` (definitions) + `ClientVariables` (answers) + `ClientCompanies`
5. Assembly engine (tracks `missingVariables[]`) — `AssembledPolicies`
6. MyITProcess integration — `FindingPolicyMaps` (+ `ClientCompanies.MitpClientId`)

## Entity-relationship (from foreign keys)
```
PolicyCategories 1─* Policies 1─* PolicyVariables
                          │   1─* PolicyVersions
                          │   1─* AssembledPolicies *─1 ClientCompanies 1─* ClientVariables
                          └── 1─* FindingPolicyMaps
Users (standalone; optional ClientCompanyId for client-scoped users)
```

## Tables (columns · type · null)

### PolicyCategories  (PK `Id` guid)
| Column | Type | Null |
|---|---|---|
| Id | uniqueidentifier | NO |
| Name | nvarchar(200) | NO |
| Description | nvarchar(1000) | YES |
| SortOrder | int | NO |
| CreatedAt / UpdatedAt | datetime2 | NO |

### Policies  (PK `Id` guid)
| Column | Type | Null |
|---|---|---|
| Id | uniqueidentifier | NO |
| Title | nvarchar(500) | NO |
| Summary | nvarchar(2000) | YES |
| Content | nvarchar(max) | YES |
| CategoryId → PolicyCategories.Id | uniqueidentifier | NO |
| AssignedClientIds (JSON array of client GUIDs) | nvarchar(max) | NO |
| Status | nvarchar(50) | NO |
| CurrentVersion | int | NO |
| CreatedByUserId | uniqueidentifier | NO |
| NextReviewDate | datetime2 | YES |
| CreatedAt / UpdatedAt | datetime2 | NO |

### PolicyVariables  (PK `Id` int identity)
| Column | Type | Null |
|---|---|---|
| Id | int | NO |
| PolicyId → Policies.Id | uniqueidentifier | NO |
| Key | nvarchar(100) | NO |
| Label | nvarchar(300) | NO |
| Question | nvarchar(1000) | NO |
| InputType | nvarchar(50) | NO |
| Options (JSON, for select inputs) | nvarchar(max) | YES |
| IsUniversal | bit | NO |
| Required | bit | NO |
| SortOrder | int | NO |

### PolicyVersions  (PK `Id` guid)
| Column | Type | Null |
|---|---|---|
| Id | uniqueidentifier | NO |
| PolicyId → Policies.Id | uniqueidentifier | NO |
| VersionNumber | int | NO |
| Content | nvarchar(max) | NO |
| ChangeNotes | nvarchar(1000) | YES |
| CreatedByUserId | uniqueidentifier | NO |
| CreatedAt | datetime2 | NO |

### ClientCompanies  (PK `Id` guid)
| Column | Type | Null |
|---|---|---|
| Id | uniqueidentifier | NO |
| Name | nvarchar(300) | NO |
| PrimaryContactName | nvarchar(200) | YES |
| PrimaryContactEmail | nvarchar(300) | YES |
| Industry | nvarchar(100) | YES |
| IsActive | bit | NO |
| MitpClientId (MyITProcess client id) | nvarchar(100) | YES |
| CreatedAt / UpdatedAt | datetime2 | NO |

### ClientVariables  (PK `Id` int identity)
| Column | Type | Null |
|---|---|---|
| Id | int | NO |
| ClientCompanyId → ClientCompanies.Id | uniqueidentifier | NO |
| Key | nvarchar(100) | NO |
| Value | nvarchar(max) | NO |
| CollectedAt | datetime2 | NO |
| UpdatedAt | datetime2 | YES |

### AssembledPolicies  (PK `Id` int identity)
| Column | Type | Null |
|---|---|---|
| Id | int | NO |
| PolicyId → Policies.Id | uniqueidentifier | NO |
| ClientCompanyId → ClientCompanies.Id | uniqueidentifier | NO |
| AssembledContent | nvarchar(max) | NO |
| AssembledAt | datetime2 | NO |
| AssembledBy | nvarchar(300) | NO |
| AcknowledgedByClient | bit | NO |
| AcknowledgedAt | datetime2 | YES |

> Note: client acknowledgment (`AcknowledgedByClient` / `AcknowledgedAt`) is
> already modeled here — Phase 3d acknowledgment tracking has a schema home.

### FindingPolicyMaps  (PK `Id` int identity)
| Column | Type | Null |
|---|---|---|
| Id | int | NO |
| FindingLabel | nvarchar(500) | NO |
| FindingKeyword | nvarchar(200) | YES |
| PolicyId → Policies.Id | uniqueidentifier | NO |

### Users  (PK `Id` guid)
| Column | Type | Null |
|---|---|---|
| Id | uniqueidentifier | NO |
| EntraObjectId | nvarchar(100) | NO |
| DisplayName | nvarchar(200) | NO |
| Email | nvarchar(300) | NO |
| Role | nvarchar(50) | NO |
| ClientCompanyId (null = NOIT staff) | uniqueidentifier | YES |
| IsActive | bit | NO |
| CreatedAt / UpdatedAt | datetime2 | NO |

## Reconstruction caveats
- Column types/sizes/nullability and FK targets are **exact** (read from the live DB).
- **Delete behaviors** (cascade/restrict) are *inferred* — the schema doesn't
  expose the original `ON DELETE` rules; the `DbContext` uses sensible defaults
  (cascade for owned children, restrict where two FKs meet).
- `AssignedClientIds`, `PolicyVariables.Options`, and similar `nvarchar(max)`
  fields are almost certainly JSON; treat as strings at the EF layer.
- Treat this as a **database-first** model: do **not** generate new migrations
  against the live DB unless you intend to alter it. `InitialCreate` is already
  applied.
