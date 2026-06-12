using NOIT.ClientTools.Core.Enums;

namespace NOIT.ClientTools.Core.Models;

public class UserTenantAccess
{
    public int Id { get; set; }
    public int AppUserId { get; set; }
    public int ClientTenantId { get; set; }
    public AccessLevel AccessLevel { get; set; } = AccessLevel.FullAccess;
    public DateTime GrantedAt { get; set; } = DateTime.UtcNow;
    public int? GrantedById { get; set; }

    // Navigation
    public AppUser AppUser { get; set; } = null!;
    public ClientTenant ClientTenant { get; set; } = null!;
    public AppUser? GrantedBy { get; set; }
}
