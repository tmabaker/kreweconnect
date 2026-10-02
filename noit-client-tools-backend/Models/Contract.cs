using NOIT.ClientTools.Core.Enums;

namespace NOIT.ClientTools.Core.Models;

public class Contract
{
    public Guid Id { get; set; }
    public int TenantId { get; set; }
    public string VendorName { get; set; } = string.Empty;
    public ContractType ContractType { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public DateOnly StartDate { get; set; }
    public DateOnly? EndDate { get; set; }
    public DateOnly? RenewalDate { get; set; }
    public bool AutoRenew { get; set; }
    public decimal? Value { get; set; }
    public string Currency { get; set; } = "USD";
    public ContractStatus Status { get; set; } = ContractStatus.Draft;
    public string? SLATerms { get; set; }
    public string? Notes { get; set; }
    public string? CreatedById { get; set; }
    public bool IsArchived { get; set; }
    public DateTime? ArchivedAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // ─── Schema v2 (all nullable or defaulted so existing rows stay valid) ───

    // Classification and renewal terms
    public AgreementCategory? AgreementCategory { get; set; }
    public RenewalType? RenewalType { get; set; }
    public int? RenewalTermMonths { get; set; }
    public int? NoticePeriodDays { get; set; }
    public DateOnly? EarliestRenewalDecisionDate { get; set; }
    public DateOnly? LatestRenewalDecisionDate { get; set; }
    public string? TerminationTerms { get; set; }

    // Financial. Value is kept for compatibility and mirrors TotalValue.
    public decimal? TotalValue { get; set; }
    public decimal? RecurringAmount { get; set; }
    public BillingFrequency? BillingFrequency { get; set; }

    // Parties and classification
    public string? CounterpartyName { get; set; }
    public string? ClientInternalOwner { get; set; }
    public string? Department { get; set; }
    public RiskClass? RiskClass { get; set; }
    public string? PolicyOrAccountNumber { get; set; }
    public string? CoverageOrScopeSummary { get; set; }

    // Review state
    public ConfidenceTier? ConfidenceTier { get; set; }
    public bool NeedsReview { get; set; }
    /// <summary>JSON array of strings: questions for the client point of contact.</summary>
    public string? ReviewQuestions { get; set; }

    // Provenance
    public SourceSystem? SourceSystem { get; set; }
    public string? SourceTenantId { get; set; }
    public string? SourceContainer { get; set; }
    public string? SourcePath { get; set; }
    public string? SourceItemId { get; set; }
    public string? SourceWebUrl { get; set; }
    public string? SourceFileHash { get; set; }
    public DateTime? ExtractedAt { get; set; }
    public string? ExtractionModel { get; set; }

    // Navigation
    public ClientTenant Tenant { get; set; } = null!;
    public ICollection<ContractVersion> Versions { get; set; } = new List<ContractVersion>();
    public ICollection<ContractDocument> Documents { get; set; } = new List<ContractDocument>();
    public ICollection<ContractApproval> Approvals { get; set; } = new List<ContractApproval>();
    public ICollection<ContractTag> ContractTags { get; set; } = new List<ContractTag>();
    public ICollection<RenewalAlert> RenewalAlerts { get; set; } = new List<RenewalAlert>();
    public ICollection<ContractContact> Contacts { get; set; } = new List<ContractContact>();
    public ICollection<ContractObligation> Obligations { get; set; } = new List<ContractObligation>();
}
