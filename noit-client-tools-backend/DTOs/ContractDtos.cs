using NOIT.ClientTools.Core.Enums;

namespace NOIT.ClientTools.Core.DTOs;

public record ContractListDto
{
    public Guid Id { get; init; }
    public int TenantId { get; init; }
    public string TenantDisplayName { get; init; } = string.Empty;
    public string VendorName { get; init; } = string.Empty;
    public ContractType ContractType { get; init; }
    public string Title { get; init; } = string.Empty;
    public DateOnly StartDate { get; init; }
    public DateOnly? EndDate { get; init; }
    public DateOnly? RenewalDate { get; init; }
    public bool AutoRenew { get; init; }
    public decimal? Value { get; init; }
    public string Currency { get; init; } = "USD";
    public ContractStatus Status { get; init; }
    public int? DaysUntilExpiry { get; init; }
    public List<string> Tags { get; init; } = new();
}

public record ContractDetailDto
{
    public Guid Id { get; init; }
    public int TenantId { get; init; }
    public string TenantDisplayName { get; init; } = string.Empty;
    public string VendorName { get; init; } = string.Empty;
    public ContractType ContractType { get; init; }
    public string Title { get; init; } = string.Empty;
    public string? Description { get; init; }
    public DateOnly StartDate { get; init; }
    public DateOnly? EndDate { get; init; }
    public DateOnly? RenewalDate { get; init; }
    public bool AutoRenew { get; init; }
    public decimal? Value { get; init; }
    public string Currency { get; init; } = "USD";
    public ContractStatus Status { get; init; }
    public string? SLATerms { get; init; }
    public string? Notes { get; init; }
    public string? CreatedById { get; init; }
    public bool IsArchived { get; init; }
    public DateTime CreatedAt { get; init; }
    public DateTime UpdatedAt { get; init; }
    public int? DaysUntilExpiry { get; init; }
    public List<ContractVersionDto> Versions { get; init; } = new();
    public List<ContractDocumentDto> Documents { get; init; } = new();
    public List<ContractApprovalDto> Approvals { get; init; } = new();
    public List<TagDto> Tags { get; init; } = new();
    public List<RenewalAlertDto> RenewalAlerts { get; init; } = new();
}

public record CreateContractRequest
{
    public int TenantId { get; init; }
    public string VendorName { get; init; } = string.Empty;
    public ContractType ContractType { get; init; }
    public string Title { get; init; } = string.Empty;
    public string? Description { get; init; }
    public DateOnly StartDate { get; init; }
    public DateOnly? EndDate { get; init; }
    public DateOnly? RenewalDate { get; init; }
    public bool AutoRenew { get; init; }
    public decimal? Value { get; init; }
    public string Currency { get; init; } = "USD";
    public ContractStatus Status { get; init; } = ContractStatus.Draft;
    public string? SLATerms { get; init; }
    public string? Notes { get; init; }
    public List<string>? TagNames { get; init; }
}

public record UpdateContractRequest
{
    public string? VendorName { get; init; }
    public ContractType? ContractType { get; init; }
    public string? Title { get; init; }
    public string? Description { get; init; }
    public DateOnly? StartDate { get; init; }
    public DateOnly? EndDate { get; init; }
    public DateOnly? RenewalDate { get; init; }
    public bool? AutoRenew { get; init; }
    public decimal? Value { get; init; }
    public string? Currency { get; init; }
    public ContractStatus? Status { get; init; }
    public string? SLATerms { get; init; }
    public string? Notes { get; init; }
    public List<string>? TagNames { get; init; }
}

public record ContractVersionDto
{
    public Guid Id { get; init; }
    public int VersionNumber { get; init; }
    public string? Summary { get; init; }
    public string? ChangedById { get; init; }
    public DateTime ChangedAt { get; init; }
    public string? ChangeNotes { get; init; }
}

public record ContractDocumentDto
{
    public Guid Id { get; init; }
    public string FileName { get; init; } = string.Empty;
    public long FileSize { get; init; }
    public string ContentType { get; init; } = string.Empty;
    public string? UploadedById { get; init; }
    public DateTime UploadedAt { get; init; }
}

public record ContractApprovalDto
{
    public Guid Id { get; init; }
    public Guid ContractId { get; init; }
    public string? RequestedById { get; init; }
    public string? ApprovedById { get; init; }
    public ApprovalStatus Status { get; init; }
    public DateTime RequestedAt { get; init; }
    public DateTime? ResolvedAt { get; init; }
    public string? Comments { get; init; }
}

public record ContractApprovalRequest
{
    public string? Comments { get; init; }
}

public record ApprovalDecisionRequest
{
    public ApprovalStatus Decision { get; init; }
    public string? Comments { get; init; }
}

public record RenewalAlertDto
{
    public Guid Id { get; init; }
    public Guid ContractId { get; init; }
    public string? ContractTitle { get; init; }
    public string? VendorName { get; init; }
    public string? TenantDisplayName { get; init; }
    public DateOnly AlertDate { get; init; }
    public DateOnly? ContractEndDate { get; init; }
    public AlertType AlertType { get; init; }
    public bool IsSent { get; init; }
    public int? DaysRemaining { get; init; }
}

public record TagDto
{
    public Guid Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public string? Color { get; init; }
}

public record CreateTagRequest
{
    public string Name { get; init; } = string.Empty;
    public string? Color { get; init; }
    public int? TenantId { get; init; }
}

public record ContractDashboardDto
{
    public int TotalContracts { get; init; }
    public int ActiveContracts { get; init; }
    public int ExpiringSoon { get; init; }
    public decimal TotalValue { get; init; }
    public Dictionary<string, int> ByType { get; init; } = new();
    public Dictionary<string, int> ByStatus { get; init; } = new();
    public List<ContractListDto> RecentContracts { get; init; } = new();
    public List<RenewalAlertDto> UpcomingRenewals { get; init; } = new();
}

public record UploadDocumentRequest
{
    public string FileName { get; init; } = string.Empty;
    public long FileSize { get; init; }
    public string ContentType { get; init; } = string.Empty;
}
