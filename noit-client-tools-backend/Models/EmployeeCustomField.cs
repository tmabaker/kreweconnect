namespace NOIT.ClientTools.Core.Models;

public class EmployeeCustomField
{
    public Guid Id { get; set; }
    public Guid EmployeeId { get; set; }
    public string FieldName { get; set; } = string.Empty;
    public string? FieldValue { get; set; }
    public string FieldType { get; set; } = "Text"; // Text, Number, Date, Select
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Employee Employee { get; set; } = null!;
}
