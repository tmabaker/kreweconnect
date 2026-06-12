namespace NOIT.ClientTools.Core.Models;

public class Employee
{
    public Guid Id { get; set; }
    public int ClientTenantId { get; set; }
    public string EntraObjectId { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string? GivenName { get; set; }
    public string? Surname { get; set; }
    public string? Email { get; set; }
    public string? JobTitle { get; set; }
    public string? Department { get; set; }
    public string? OfficeLocation { get; set; }
    public string? MobilePhone { get; set; }
    public string? BusinessPhone { get; set; }
    public string? EmployeeId { get; set; }
    public DateOnly? HireDate { get; set; }

    // Manager – self-reference via EntraObjectId of the manager
    public string? ManagerEntraObjectId { get; set; }
    public Guid? ManagerId { get; set; }
    public Employee? Manager { get; set; }

    // Photo stored as base64 data URI or external URL
    public string? Photo { get; set; }

    public DateTime? LastSyncedAt { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public ClientTenant ClientTenant { get; set; } = null!;
    public ICollection<Employee> DirectReports { get; set; } = new List<Employee>();
    public ICollection<EmployeeCustomField> CustomFields { get; set; } = new List<EmployeeCustomField>();
}
