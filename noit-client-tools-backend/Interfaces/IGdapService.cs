using NOIT.ClientTools.Core.DTOs;

namespace NOIT.ClientTools.Core.Interfaces;

public interface IGdapService
{
    /// <summary>
    /// Lists all active GDAP relationships from Microsoft Graph.
    /// </summary>
    Task<IReadOnlyList<GdapRelationshipDto>> GetActiveRelationshipsAsync(CancellationToken ct = default);

    /// <summary>
    /// Discovers client tenants from GDAP relationships and syncs them to the local registry.
    /// </summary>
    Task<GdapSyncResultDto> SyncTenantRegistryAsync(CancellationToken ct = default);

    /// <summary>
    /// Acquires an access token scoped to a specific client tenant via GDAP.
    /// </summary>
    Task<string> AcquireTokenForTenantAsync(string tenantId, string[] scopes, CancellationToken ct = default);

    /// <summary>
    /// Validates that the GDAP relationship for a tenant is active.
    /// </summary>
    Task<bool> ValidateTenantAccessAsync(string tenantId, CancellationToken ct = default);
}
