using NOIT.ClientTools.Core.Enums;

namespace NOIT.ClientTools.Core.Models;

/// <summary>
/// A dated duty that comes with an agreement: "send cancellation notice by",
/// "annual true up", "COI renewal due from vendor".
/// </summary>
public class ContractObligation
{
    public Guid Id { get; set; }
    public Guid ContractId { get; set; }
    public string Description { get; set; } = string.Empty;
    public DateOnly? DueDate { get; set; }
    public string? Recurrence { get; set; }
    public string? Owner { get; set; }
    public ObligationStatus Status { get; set; } = ObligationStatus.Open;

    // Navigation
    public Contract Contract { get; set; } = null!;
}
