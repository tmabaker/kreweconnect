# Preservation Manifest — NOIT Client Tools .NET backend

Full inventory of the backend source in TABCC SharePoint
(`Projects/NOIT-Client-Tools/backend/`), captured 2026-06-11. Use this to
finish preserving the remaining files deterministically via the Microsoft 365
connector: read each with `read_resource` using the URI
`file:///{driveId}/{itemId}`, then write it to the matching path here.

- **driveId:** `b!RY-elKqB3kmtZ1fxbq0lUZbpJ9VNxD5Co2bXshGn6sw8D-YXAXXXSK84dslNiz65`
- **[x]** = already preserved in this snapshot. **[ ]** = still to pull.

## Build files (NOT in SharePoint search — export directly from the dev env)
- [ ] `*.sln`, `*.csproj` (API / Core / Infrastructure projects)
- [ ] `Migrations/` (EF Core), `appsettings.Development.json`
- [ ] **`Enums/` second file** (TenantStatus, AppUserRole, AccessLevel) — referenced by models but NOT in SharePoint search results; locate & pull
- [ ] `Middleware/TenantContextMiddleware.cs` (referenced by Program.cs; not in search results)

## Root
- [x] `Program.cs` — `01GX36IQH4BZKD44AB65HJPE665TFRNBUV`
- [x] `appsettings.json` (secret redacted) — `01GX36IQAUUF3XJLDEXRC2KTLNLEO35T4Z`

## Infrastructure/Data
- [x] `AppDbContext.cs` — `01GX36IQDOGBXZBFGJ6BELXA7JHZ4755VD`

## Controllers
- [ ] `HealthController.cs` — `01GX36IQG3E2BTIOTRS5FZ6NWXLSPW7PCU`
- [ ] `EmployeesController.cs` — `01GX36IQGHDKQWMS24NREIE3RSIRWMT4FD`
- [ ] `ContractsController.cs` — `01GX36IQHLIFAYAO4HMZHKCDX76FGJ6YTS`
- [ ] `TenantsController.cs` — `01GX36IQARQG6LTVOCWRD2FXH4T2XB74C5`
- [ ] `UsersController.cs` — `01GX36IQHVYRCZPTVYZREYIRXYXCIPQWDQ`

## Interfaces
- [x] `IGdapService.cs` — `01GX36IQCAC42ST743YJA3F4YNEKNTOKXC`
- [x] `IEmployeeService.cs` — `01GX36IQDYKJDUBDJGWNBLD4W5WAZFJJ4N`
- [x] `IEmployeeSyncService.cs` — `01GX36IQGHDXNCRQFCGBBLFTU75TBT6XD5`
- [x] `IContractService.cs` — `01GX36IQFYPHCQDRQKKNEY3ZPFD7SRYQID`
- [x] `IContractApprovalService.cs` — `01GX36IQGZVR6BYRUB6ZGYULTUWYPGSGJT`
- [x] `IRenewalAlertService.cs` — `01GX36IQGGR5KB3SYOH5D3DBZMZRTQ5PRO`
- [x] `IAuditService.cs` — `01GX36IQEZNHHCXW62KJHJLEBABELJN6HB`
- [x] `ITenantContext.cs` — `01GX36IQBNS6TXN4SA6FE35J7ZKBZ75LL2`

## Services
- [x] `GdapService.cs` — `01GX36IQGX3OIQXKI4EVHJVAWZ3CWLN3NX`
- [x] `EmployeeSyncService.cs` — `01GX36IQGPS3FOOQVZJJHILNZTLSI5GKRB`
- [x] `EmployeeService.cs` — `01GX36IQFXREACXUTRNJFJWQSHRPZRXH7A`
- [x] `ContractService.cs` — `01GX36IQEDUSEO3VAPC5ELCQEOZBMEGOI6`
- [x] `ContractApprovalService.cs` — `01GX36IQF3HB3NBUXFJVFZ6J3ZRQFQDFSL`
- [x] `RenewalAlertService.cs` — `01GX36IQDM2JW2WAWG7REJKHUWMOVIQVD7`
- [x] `AuditService.cs` — `01GX36IQG3KYE4JISTJVGLSLDYC6ZMIBVL`
- [x] `TenantContext.cs` — `01GX36IQFAQUDWQBOPXBCLM6PPFDGFCWVE`

## Models
- [x] `ClientTenant.cs` — `01GX36IQEEQGBONPRC4BGJD3AXB2XDSRPI`
- [x] `Employee.cs` — `01GX36IQBCPSHJ2MO3RZCKWBHXOQ3JFDN2`
- [x] `EmployeeCustomField.cs` — `01GX36IQDQLGABEHJHSRDZPOHE3CNJ4T4B`
- [x] `CustomFieldDefinition.cs` — `01GX36IQBBE5X2MTJ7YZFLV7TU4SVZ5SPG`
- [x] `AppUser.cs` — `01GX36IQCVMPEYMLXXYVEIYS5P2E6QWZTC`
- [x] `UserTenantAccess.cs` — `01GX36IQBF7O362E5Q65BYFZDYAIJABBHZ`
- [x] `AuditLogEntry.cs` — `01GX36IQHIINH4JOMPL5AK42LXTGNZ2IEU`
- [x] `Contract.cs` — `01GX36IQDZVIYRRECCKNHZPPP6S5AGW2ES`
- [x] `ContractVersion.cs` — `01GX36IQDODDFS5QVOYBBK5526AKJJUNOD`
- [x] `ContractDocument.cs` — `01GX36IQCYJZQXIDQUSJE2KGAWQELFORZO`
- [x] `ContractApproval.cs` — `01GX36IQACP3JQJKJDCFDZTJRF4EYE37D5`
- [x] `ContractTag.cs` — `01GX36IQF6HYXRKYCSGJHZ5TN6D2HFEPMK`
- [x] `Tag.cs` — `01GX36IQC3GSKUS4RUTNDIGYBJG5YEZAX4`
- [x] `RenewalAlert.cs` — `01GX36IQC5CMLLBDYIM5EJINTCZVP52DQX`

## DTOs
- [x] `EmployeeDtos.cs` — `01GX36IQAVGDRDYCNNVREIDJDR76TLNPJF`
- [x] `ContractDtos.cs` — `01GX36IQBX3Y5ALEAAIFCIXPUJ4GKO4OE7`
- [x] `TenantDtos.cs` — `01GX36IQEBGVDC5L5S4BAKCJS3KXNV2R5W`
- [x] `UserDtos.cs` — `01GX36IQAXBVHGIJP6JBDZKOBSVY76RUCT`
- [x] `GdapRelationshipDto.cs` — `01GX36IQEGQ6PMGZ2EXNFLRV5GQ3NPDDYD`
- [x] `PagedResult.cs` — `01GX36IQBKHJFFDSWFNVHYYRPOYIH7CWSP`

## Enums
- [x] `ContractEnums.cs` — `01GX36IQCBXX6ZCNGRNFH24HS6AFY7QXK2`
