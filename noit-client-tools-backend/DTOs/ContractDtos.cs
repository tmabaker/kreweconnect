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

    // Schema v2
    public AgreementCategory? AgreementCategory { get; init; }
    public RenewalType? RenewalType { get; init; }
    public DateOnly? LatestRenewalDecisionDate { get; init; }
    public DateOnly? EarliestRenewalDecisionDate { get; init; }
    public ConfidenceTier? ConfidenceTier { get; init; }
    public bool NeedsReview { get; init; }
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

    // Schema v2: list fields
    public AgreementCategory? AgreementCategory { get; init; }
    public RenewalType? RenewalType { get; init; }
    public DateOnly? LatestRenewalDecisionDate { get; init; }
    public DateOnly? EarliestRenewalDecisionDate { get; init; }
    public ConfidenceTier? ConfidenceTier { get; init; }
    public bool NeedsReview { get; init; }

    // Schema v2: renewal terms
    public int? NoticePeriodDays { get; init; }
    public int? RenewalTermMonths { get; init; }
    public string? TerminationTerms { get; init; }

    // Schema v2: financial
    public decimal? TotalValue { get; init; }
    public decimal? RecurringAmount { get; init; }
    public BillingFrequency? BillingFrequency { get; init; }
    /// <summary>Read only. RecurringAmount x periods per year, else TotalValue / term years.</summary>
    public decimal? AnnualizedValue { get; init; }

    // Schema v2: parties and classification
    public string? CounterpartyName { get; init; }
    public string? ClientInternalOwner { get; init; }
    public string? Department { get; init; }
    public RiskClass? RiskClass { get; init; }
    public string? PolicyOrAccountNumber { get; init; }
    public string? CoverageOrScopeSummary { get; init; }
    public List<string> ReviewQuestions { get; init; } = new();

    // Schema v2: provenance
    public SourceSystem? SourceSystem { get; init; }
    public string? SourceTenantId { get; init; }
    public string? SourceContainer { get; init; }
    public string? SourcePath { get; init; }
    public string? SourceItemId { get; init; }
    public string? SourceWebUrl { get; init; }
    public string? SourceFileHash { get; init; }
    public DateTime? ExtractedAt { get; init; }
    public string? ExtractionModel { get; init; }

    public List<ContractContactDto> Contacts { get; init; } = new();
    public List<ContractObligationDto> Obligations { get; init; } = new();
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

    // Schema v2
    public AgreementCategory? AgreementCategory { get; init; }
    public RenewalType? RenewalType { get; init; }
    public int? RenewalTermMonths { get; init; }
    public int? NoticePeriodDays { get; init; }
    public DateOnly? EarliestRenewalDecisionDate { get; init; }
    public DateOnly? LatestRenewalDecisionDate { get; init; }
    public string? TerminationTerms { get; init; }
    public decimal? TotalValue { get; init; }
    public decimal? RecurringAmount { get; init; }
    public BillingFrequency? BillingFrequency { get; init; }
    public string? CounterpartyName { get; init; }
    public string? ClientInternalOwner { get; init; }
    public string? Department { get; init; }
    public RiskClass? RiskClass { get; init; }
    public string? PolicyOrAccountNumber { get; init; }
    public string? CoverageOrScopeSummary { get; init; }
    public ConfidenceTier? ConfidenceTier { get; init; }
    public bool? NeedsReview { get; init; }
    public List<string>? ReviewQuestions { get; init; }
    /// <summary>When provided, replaces the contract's contacts. Null leaves them unchanged.</summary>
    public List<ContractContactDto>? Contacts { get; init; }
    /// <summary>When provided, replaces the contract's obligations. Null leaves them unchanged.</summary>
    public List<ContractObligationDto>? Obligations { get; init; }
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

    // Schema v2
    public AgreementCategory? AgreementCategory { get; init; }
    public RenewalType? RenewalType { get; init; }
    public int? RenewalTermMonths { get; init; }
    public int? NoticePeriodDays { get; init; }
    public DateOnly? EarliestRenewalDecisionDate { get; init; }
    public DateOnly? LatestRenewalDecisionDate { get; init; }
    public string? TerminationTerms { get; init; }
    public decimal? TotalValue { get; init; }
    public decimal? RecurringAmount { get; init; }
    public BillingFrequency? BillingFrequency { get; init; }
    public string? CounterpartyName { get; init; }
    public string? ClientInternalOwner { get; init; }
    public string? Department { get; init; }
    public RiskClass? RiskClass { get; init; }
    public string? PolicyOrAccountNumber { get; init; }
    public string? CoverageOrScopeSummary { get; init; }
    public ConfidenceTier? ConfidenceTier { get; init; }
    public bool? NeedsReview { get; init; }
    public List<string>? ReviewQuestions { get; init; }
    /// <summary>When provided, replaces the contract's contacts. Null leaves them unchanged.</summary>
    public List<ContractContactDto>? Contacts { get; init; }
    /// <summary>When provided, replaces the contract's obligations. Null leaves them unchanged.</summary>
    public List<ContractObligationDto>? Obligations { get; init; }
}

public record ContractContactDto
{
    public Guid? Id { get; init; }
    public ContactRole Role { get; init; }
    public string? Name { get; init; }
    public string? Company { get; init; }
    public string? Title { get; init; }
    public string? Email { get; init; }
    public string? Phone { get; init; }
    public string? PortalUrl { get; init; }
    public string? Notes { get; init; }
    public string? SourceRef { get; init; }
}

public record ContractObligationDto
{
    public Guid? Id { get; init; }
    public string Description { get; init; } = string.Empty;
    public DateOnly? DueDate { get; init; }
    public string? Recurrence { get; init; }
    public string? Owner { get; init; }
    public ObligationStatus Status { get; init; } = ObligationStatus.Open;
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

// ─── Import (mirrors tools/krewereview-ingest/import-schema.json) ───

/// <summary>
/// One agreement as emitted by the ingestion pipeline. Imported as Draft with NeedsReview honored.
/// Idempotent on (tenant, SourceSystem, SourceItemId). Required by the schema, and validated per
/// record by the service: SourceTenantId, SourceSystem, SourceItemId, CounterpartyName, Title,
/// AgreementCategory, ConfidenceTier.
/// </summary>
public record ContractImportRecord
{
    public string? SourceTenantId { get; init; }
    public string? ClientName { get; init; }
    public SourceSystem? SourceSystem { get; init; }
    public string? SourceContainer { get; init; }
    public string? SourcePath { get; init; }
    public string? SourceItemId { get; init; }
    public string? SourceWebUrl { get; init; }
    public string? SourceFileHash { get; init; }
    public DateTime? ExtractedAt { get; init; }
    public string? ExtractionModel { get; init; }

    /// <summary>Vendor, insurer, lessor, or association exactly as written on the paper.</summary>
    public string? CounterpartyName { get; init; }
    /// <summary>Normalized vendor brand. Falls back to CounterpartyName.</summary>
    public string? VendorName { get; init; }
    public string? Title { get; init; }
    public string? Description { get; init; }
    public AgreementCategory? AgreementCategory { get; init; }
    public string? Department { get; init; }
    public string? ClientInternalOwner { get; init; }
    public string? PolicyOrAccountNumber { get; init; }
    public string? CoverageOrScopeSummary { get; init; }

    public DateOnly? StartDate { get; init; }
    public DateOnly? EndDate { get; init; }
    public DateOnly? ExecutedDate { get; init; }
    public RenewalType? RenewalType { get; init; }
    public int? RenewalTermMonths { get; init; }
    public int? NoticePeriodDays { get; init; }
    public DateOnly? EarliestRenewalDecisionDate { get; init; }
    public DateOnly? LatestRenewalDecisionDate { get; init; }
    public string? TerminationTerms { get; init; }
    /// <summary>Informational. Imported records are always created as Draft.</summary>
    public ContractStatus? Status { get; init; }

    public decimal? TotalValue { get; init; }
    public decimal? RecurringAmount { get; init; }
    public BillingFrequency? BillingFrequency { get; init; }
    public string Currency { get; init; } = "USD";

    public List<ContractImportContact> Contacts { get; init; } = new();
    public List<ContractImportDocument> Documents { get; init; } = new();
    public List<ContractImportObligation> Obligations { get; init; } = new();

    public List<string> Tags { get; init; } = new();
    public ConfidenceTier? ConfidenceTier { get; init; }
    public bool NeedsReview { get; init; }
    public List<string> ReviewQuestions { get; init; } = new();
    /// <summary>"Yes", "No" (found but out of scope, not imported) or "Unsure" (forces NeedsReview).</summary>
    public string? InScope { get; init; }
    public string? Notes { get; init; }
}

public record ContractImportContact
{
    public ContactRole Role { get; init; }
    public string? Name { get; init; }
    public string? Company { get; init; }
    public string? Title { get; init; }
    public string? Email { get; init; }
    public string? Phone { get; init; }
    public string? PortalUrl { get; init; }
    public string? SourceRef { get; init; }
}

public record ContractImportDocument
{
    public string? FileName { get; init; }
    public string? SourceWebUrl { get; init; }
    public string? SourceItemId { get; init; }
    /// <summary>Executed, Draft, Amendment, Renewal, Invoice, Quote, Certificate, Correspondence, Other.</summary>
    public string? DocumentRole { get; init; }
}

public record ContractImportObligation
{
    public string? Description { get; init; }
    public DateOnly? DueDate { get; init; }
    public string? Recurrence { get; init; }
}

public enum ContractImportOutcome
{
    Created,
    Updated,
    /// <summary>Not imported: out of scope, or the existing record has already left Draft.</summary>
    Skipped,
    Failed
}

public record ContractImportItemResult
{
    /// <summary>Zero based position in the submitted array.</summary>
    public int Index { get; init; }
    public string? SourceItemId { get; init; }
    public Guid? ContractId { get; init; }
    public ContractImportOutcome Outcome { get; init; }
    public string? Message { get; init; }
}

public record ContractImportResult
{
    public int Total { get; init; }
    public int Created { get; init; }
    public int Updated { get; init; }
    public int Skipped { get; init; }
    public int Failed { get; init; }
    public List<ContractImportItemResult> Items { get; init; } = new();
}
