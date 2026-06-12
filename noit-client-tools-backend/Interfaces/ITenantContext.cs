namespace NOIT.ClientTools.Core.Interfaces;

/// <summary>
/// Scoped service that holds the current tenant context for a request.
/// </summary>
public interface ITenantContext
{
    /// <summary>The current tenant ID from X-Tenant-Id header, or null for cross-tenant ("all").</summary>
    Guid? TenantId { get; set; }

    /// <summary>True when X-Tenant-Id is "all" (cross-tenant query).</summary>
    bool IsAllTenants { get; set; }

    /// <summary>The database ID of the current ClientTenant, if resolved.</summary>
    int? ClientTenantDbId { get; set; }
}
