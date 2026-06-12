namespace NOIT.ClientTools.Core.Interfaces;

public interface IAuditService
{
    Task LogAsync(string action, string entityType, string? entityId = null,
        int? clientTenantId = null, object? details = null, CancellationToken ct = default);
}
