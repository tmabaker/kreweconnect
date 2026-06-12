namespace NOIT.ClientTools.Core.DTOs;

// --- List / Card view ---
public record EmployeeListDto
{
    public Guid Id { get; init; }
    public string DisplayName { get; init; } = string.Empty;
    public string? GivenName { get; init; }
    public string? Surname { get; init; }
    public string? Email { get; init; }
    public string? JobTitle { get; init; }
    public string? Department { get; init; }
    public string? OfficeLocation { get; init; }
    public string? MobilePhone { get; init; }
    public string? BusinessPhone { get; init; }
    public string? Photo { get; init; }
    public bool IsActive { get; init; }
    public string? TenantDisplayName { get; init; }
}

// --- Detail view ---
public record EmployeeDetailDto
{
    public Guid Id { get; init; }
    public string DisplayName { get; init; } = string.Empty;
    public string? GivenName { get; init; }
    public string? Surname { get; init; }
    public string? Email { get; init; }
    public string? JobTitle { get; init; }
    public string? Department { get; init; }
    public string? OfficeLocation { get; init; }
    public string? MobilePhone { get; init; }
    public string? BusinessPhone { get; init; }
    public string? EmployeeId { get; init; }
    public DateOnly? HireDate { get; init; }
    public string? Photo { get; init; }
    public bool IsActive { get; init; }
    public DateTime? LastSyncedAt { get; init; }
    public string? TenantDisplayName { get; init; }

    // Manager
    public EmployeeRefDto? Manager { get; init; }
    // Direct reports
    public List<EmployeeRefDto> DirectReports { get; init; } = new();
    // Custom fields
    public List<CustomFieldValueDto> CustomFields { get; init; } = new();
}

public record EmployeeRefDto
{
    public Guid Id { get; init; }
    public string DisplayName { get; init; } = string.Empty;
    public string? JobTitle { get; init; }
    public string? Photo { get; init; }
}

// --- Org chart ---
public record OrgChartNodeDto
{
    public Guid Id { get; init; }
    public string DisplayName { get; init; } = string.Empty;
    public string? JobTitle { get; init; }
    public string? Department { get; init; }
    public string? Photo { get; init; }
    public List<OrgChartNodeDto> DirectReports { get; init; } = new();
}

// --- Custom fields ---
public record CustomFieldValueDto
{
    public Guid Id { get; init; }
    public string FieldName { get; init; } = string.Empty;
    public string? FieldValue { get; init; }
    public string FieldType { get; init; } = "Text";
}

public record CustomFieldDefinitionDto
{
    public Guid Id { get; init; }
    public int? TenantId { get; init; }
    public string FieldName { get; init; } = string.Empty;
    public string FieldType { get; init; } = "Text";
    public bool IsRequired { get; init; }
    public int DisplayOrder { get; init; }
    public string? SelectOptions { get; init; }
}

public record CreateCustomFieldDefinitionRequest
{
    public int? TenantId { get; init; }
    public string FieldName { get; init; } = string.Empty;
    public string FieldType { get; init; } = "Text";
    public bool IsRequired { get; init; }
    public int DisplayOrder { get; init; }
    public string? SelectOptions { get; init; }
}

public record UpdateCustomFieldsRequest
{
    public List<CustomFieldUpdateItem> Fields { get; init; } = new();
}

public record CustomFieldUpdateItem
{
    public string FieldName { get; init; } = string.Empty;
    public string? FieldValue { get; init; }
    public string FieldType { get; init; } = "Text";
}

public record EmployeeSyncResultDto
{
    public int Created { get; init; }
    public int Updated { get; init; }
    public int Deactivated { get; init; }
    public int TotalProcessed { get; init; }
}
