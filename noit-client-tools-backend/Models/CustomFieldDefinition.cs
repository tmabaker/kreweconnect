namespace NOIT.ClientTools.Core.Models;

public class CustomFieldDefinition
{
    public Guid Id { get; set; }
    public int? TenantId { get; set; } // null = global (all tenants)
    public string FieldName { get; set; } = string.Empty;
    public string FieldType { get; set; } = "Text"; // Text, Number, Date, Select
    public bool IsRequired { get; set; }
    public int DisplayOrder { get; set; }
    public string? SelectOptions { get; set; } // JSON array for Select type, e.g. ["S","M","L","XL"]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public ClientTenant? Tenant { get; set; }
}
