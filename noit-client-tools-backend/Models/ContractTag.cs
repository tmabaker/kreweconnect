namespace NOIT.ClientTools.Core.Models;

public class ContractTag
{
    public Guid Id { get; set; }
    public Guid ContractId { get; set; }
    public Guid TagId { get; set; }

    // Navigation
    public Contract Contract { get; set; } = null!;
    public Tag Tag { get; set; } = null!;
}
