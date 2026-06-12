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

    // Navigation
    public ClientTenant Tenant { get; set; } = null!;
    public ICollection<ContractVersion> Versions { get; set; } = new List<ContractVersion>();
    public ICollection<ContractDocument> Documents { get; set; } = new List<ContractDocument>();
    public ICollection<ContractApproval> Approvals { get; set; } = new List<ContractApproval>();
    public ICollection<ContractTag> ContractTags { get; set; } = new List<ContractTag>();
    public ICollection<RenewalAlert> RenewalAlerts { get; set; } = new List<RenewalAlert>();
}
