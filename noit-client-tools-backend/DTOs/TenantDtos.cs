using NOIT.ClientTools.Core.Enums;

namespace NOIT.ClientTools.Core.DTOs;

public record TenantListDto
{
    public int Id { get; init; }
    public Guid TenantId { get; init; }
    public string DisplayName { get; init; } = string.Empty;
    public string? PrimaryDomain { get; init; }
    public TenantStatus Status { get; init; }
    public DateTime? GdapExpiresAt { get; init; }
    public DateTime? LastSyncedAt { get; init; }
    public bool SyncEnabled { get; init; }
}

public record TenantDetailDto : TenantListDto
{
    public string? GdapRelationshipId { get; init; }
    public List<string>? GdapRoles { get; init; }
    public string? Notes { get; init; }
    public DateTime CreatedAt { get; init; }
    public DateTime UpdatedAt { get; init; }
}
