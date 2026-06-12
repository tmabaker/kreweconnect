using NOIT.ClientTools.Core.Enums;

namespace NOIT.ClientTools.Core.DTOs;

public record CurrentUserDto
{
    public int Id { get; init; }
    public Guid EntraObjectId { get; init; }
    public string Email { get; init; } = string.Empty;
    public string DisplayName { get; init; } = string.Empty;
    public AppUserRole Role { get; init; }
    public bool IsActive { get; init; }
    public DateTime? LastLoginAt { get; init; }
    public List<TenantAccessDto> TenantAccess { get; init; } = new();
}

public record TenantAccessDto
{
    public int ClientTenantId { get; init; }
    public Guid TenantId { get; init; }
    public string DisplayName { get; init; } = string.Empty;
    public AccessLevel AccessLevel { get; init; }
}
