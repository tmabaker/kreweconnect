using NOIT.ClientTools.Core.Enums;

namespace NOIT.ClientTools.Core.Models;

public class ClientTenant
{
    public int Id { get; set; }
    public Guid TenantId { get; set; }
    public string DisplayName { get; set; } = string.Empty;
    public string? GdapRelationshipId { get; set; }
    public string? PrimaryDomain { get; set; }
    public TenantStatus Status { get; set; } = TenantStatus.Active;
    public DateTime? GdapExpiresAt { get; set; }
    public string? GdapRolesJson { get; set; } // JSON array of role definition IDs
    public DateTime? LastSyncedAt { get; set; }
    public string? DeltaToken { get; set; }
    public bool SyncEnabled { get; set; } = true;
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public ICollection<UserTenantAccess> UserAccess { get; set; } = new List<UserTenantAccess>();
}
