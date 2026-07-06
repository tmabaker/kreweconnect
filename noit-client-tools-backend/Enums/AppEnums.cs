// RECONSTRUCTED (2026-06-12): this second Enums file was referenced by the
// models/DTOs but was not surfaced by SharePoint search. Members marked (used)
// are confirmed by usage in the preserved code; the others are reasonable
// reconstructions. Because these are persisted via HasConversion<string>(),
// the *names* matter — reconcile against the original if it surfaces.

namespace NOIT.ClientTools.Core.Enums;

public enum TenantStatus
{
    Active,    // (used) GdapService, registry sync
    Inactive,
    Expired,   // (used) GdapService when GDAP relationship past EndDateTime
    Suspended,
    Pending
}

public enum AppUserRole
{
    Admin,     // NOIT MSP administrator — sees all client tenants
    Staff,     // (used) default on auto-provision (UsersController)
    ReadOnly,
    Client     // client-tenant user — sees only their own tenant
}

public enum AccessLevel
{
    FullAccess,  // (used) default on UserTenantAccess
    ReadWrite,
    ReadOnly,
    NoAccess
}
