namespace NOIT.ClientTools.Core.Models;

public class AuditLogEntry
{
    public long Id { get; set; }
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    public int? UserId { get; set; }
    public string? UserEmail { get; set; }
    public string Action { get; set; } = string.Empty;
    public string EntityType { get; set; } = string.Empty;
    public string? EntityId { get; set; }
    public int? ClientTenantId { get; set; }
    public string? Details { get; set; } // JSON
    public string? IpAddress { get; set; }
    public string? UserAgent { get; set; }

    // Navigation
    public AppUser? User { get; set; }
    public ClientTenant? ClientTenant { get; set; }
}
