namespace NOIT.ClientTools.Core.Models;

public class ContractVersion
{
    public Guid Id { get; set; }
    public Guid ContractId { get; set; }
    public int VersionNumber { get; set; }
    public string? Summary { get; set; }
    public string? ChangedById { get; set; }
    public DateTime ChangedAt { get; set; } = DateTime.UtcNow;
    public string? ChangeNotes { get; set; }

    // Navigation
    public Contract Contract { get; set; } = null!;
}
