using NOIT.ClientTools.Core.Enums;

namespace NOIT.ClientTools.Core.Models;

public class RenewalAlert
{
    public Guid Id { get; set; }
    public Guid ContractId { get; set; }
    public DateOnly AlertDate { get; set; }
    public AlertType AlertType { get; set; }
    public bool IsSent { get; set; }
    public DateTime? SentAt { get; set; }

    // Navigation
    public Contract Contract { get; set; } = null!;
}
