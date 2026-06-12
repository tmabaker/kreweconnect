using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using NOIT.ClientTools.Core.Interfaces;
using NOIT.ClientTools.Core.Models;
using NOIT.ClientTools.Infrastructure.Data;

namespace NOIT.ClientTools.Infrastructure.Services;

public class AuditService : IAuditService
{
    private readonly AppDbContext _db;
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly ILogger<AuditService> _logger;

    public AuditService(AppDbContext db, IHttpContextAccessor httpContextAccessor, ILogger<AuditService> logger)
    {
        _db = db;
        _httpContextAccessor = httpContextAccessor;
        _logger = logger;
    }

    public async Task LogAsync(string action, string entityType, string? entityId = null,
        int? clientTenantId = null, object? details = null, CancellationToken ct = default)
    {
        var httpContext = _httpContextAccessor.HttpContext;
        var userEmail = httpContext?.User?.FindFirst(ClaimTypes.Email)?.Value
            ?? httpContext?.User?.FindFirst("preferred_username")?.Value;

        var entry = new AuditLogEntry
        {
            Timestamp = DateTime.UtcNow,
            UserEmail = userEmail,
            Action = action,
            EntityType = entityType,
            EntityId = entityId,
            ClientTenantId = clientTenantId,
            Details = details != null ? JsonSerializer.Serialize(details) : null,
            IpAddress = httpContext?.Connection?.RemoteIpAddress?.ToString(),
            UserAgent = httpContext?.Request?.Headers["User-Agent"].ToString()
        };

        _db.AuditLog.Add(entry);

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to write audit log entry: {Action} {EntityType} {EntityId}", action, entityType, entityId);
        }
    }
}
