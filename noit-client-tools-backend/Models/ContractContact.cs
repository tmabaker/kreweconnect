using NOIT.ClientTools.Core.Enums;

namespace NOIT.ClientTools.Core.Models;

/// <summary>
/// One row per contact role per contract. A single vendor rep often fills several
/// roles; each role gets its own row so they can change independently.
/// </summary>
public class ContractContact
{
    public Guid Id { get; set; }
    public Guid ContractId { get; set; }
    public ContactRole Role { get; set; }
    public string? Name { get; set; }
    public string? Company { get; set; }
    public string? Title { get; set; }
    public string? Email { get; set; }
    public string? Phone { get; set; }
    public string? PortalUrl { get; set; }
    public string? Notes { get; set; }
    /// <summary>Where the contact was found (document, page, email thread).</summary>
    public string? SourceRef { get; set; }

    // Navigation
    public Contract Contract { get; set; } = null!;
}
