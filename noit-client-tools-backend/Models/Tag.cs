namespace NOIT.ClientTools.Core.Models;

public class Tag
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Color { get; set; }
    public int? TenantId { get; set; }

    // Navigation
    public ICollection<ContractTag> ContractTags { get; set; } = new List<ContractTag>();
}
