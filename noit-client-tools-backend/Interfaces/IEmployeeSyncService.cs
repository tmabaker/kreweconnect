using NOIT.ClientTools.Core.DTOs;

namespace NOIT.ClientTools.Core.Interfaces;

public interface IEmployeeSyncService
{
    /// <summary>
    /// Syncs employees from Azure AD for the given tenant.
    /// Uses GdapService to acquire a token, calls Graph API /users,
    /// upserts employees, and deactivates those no longer in AD.
    /// </summary>
    Task<EmployeeSyncResultDto> SyncTenantAsync(int tenantId, CancellationToken ct = default);
}
