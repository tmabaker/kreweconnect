using NOIT.ClientTools.Core.Enums;

namespace NOIT.ClientTools.Core.Models;

public class AppUser
{
    public int Id { get; set; }
    public Guid EntraObjectId { get; set; }
    public string Email { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public AppUserRole Role { get; set; } = AppUserRole.Staff;
    public bool IsActive { get; set; } = true;
    public DateTime? LastLoginAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public ICollection<UserTenantAccess> TenantAccess { get; set; } = new List<UserTenantAccess>();
}
