using NOIT.ClientTools.Core.Interfaces;

namespace NOIT.ClientTools.Infrastructure.Services;

/// <summary>
/// Scoped service holding per-request tenant context. Set by TenantContextMiddleware.
/// </summary>
public class TenantContext : ITenantContext
{
    public Guid? TenantId { get; set; }
    public bool IsAllTenants { get; set; }
    public int? ClientTenantDbId { get; set; }
}
