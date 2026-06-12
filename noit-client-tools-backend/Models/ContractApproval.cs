using NOIT.ClientTools.Core.Enums;

namespace NOIT.ClientTools.Core.Models;

public class ContractApproval
{
    public Guid Id { get; set; }
    public Guid ContractId { get; set; }
    public string? RequestedById { get; set; }
    public string? ApprovedById { get; set; }
    public ApprovalStatus Status { get; set; } = ApprovalStatus.Pending;
    public DateTime RequestedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ResolvedAt { get; set; }
    public string? Comments { get; set; }

    // Navigation
    public Contract Contract { get; set; } = null!;
}
