namespace NOIT.ClientTools.Core.DTOs;

public record GdapRelationshipDto
{
    public string Id { get; init; } = string.Empty;
    public string DisplayName { get; init; } = string.Empty;
    public string CustomerTenantId { get; init; } = string.Empty;
    public string CustomerDisplayName { get; init; } = string.Empty;
    public List<string> RoleDefinitionIds { get; init; } = new();
    public string Status { get; init; } = string.Empty;
    public DateTime? ActivatedDateTime { get; init; }
    public DateTime? EndDateTime { get; init; }
}

public record GdapSyncResultDto
{
    public int TenantsDiscovered { get; init; }
    public int NewTenants { get; init; }
    public int UpdatedTenants { get; init; }
    public int ExpiredTenants { get; init; }
}
