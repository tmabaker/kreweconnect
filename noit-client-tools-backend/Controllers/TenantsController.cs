using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NOIT.ClientTools.Core.DTOs;
using NOIT.ClientTools.Core.Enums;
using NOIT.ClientTools.Core.Interfaces;
using NOIT.ClientTools.Infrastructure.Data;

namespace NOIT.ClientTools.Api.Controllers;

[ApiController]
[Route("api/v1/[controller]")]
[Authorize]
public class TenantsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IGdapService _gdapService;
    private readonly IAuditService _audit;
    private readonly ITenantContext _tenantContext;
    private readonly ILogger<TenantsController> _logger;

    public TenantsController(AppDbContext db, IGdapService gdapService, IAuditService audit, ITenantContext tenantContext, ILogger<TenantsController> logger)
    {
        _db = db;
        _gdapService = gdapService;
        _audit = audit;
        _tenantContext = tenantContext;
        _logger = logger;
    }

    /// <summary>
    /// List all client tenants the current user has access to.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetTenants(
        [FromQuery] string? search,
        [FromQuery] TenantStatus? status,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25)
    {
        var query = _db.ClientTenants.AsNoTracking().AsQueryable();

        // SECURITY: only MSP admins may enumerate all client tenants; a client
        // caller sees only their own tenant registry entry.
        if (!_tenantContext.IsMspAdmin)
            query = query.Where(t => t.Id == _tenantContext.ClientTenantDbId);

        if (status.HasValue)
            query = query.Where(t => t.Status == status.Value);

        if (!string.IsNullOrWhiteSpace(search))
            query = query.Where(t => t.DisplayName.Contains(search) || (t.PrimaryDomain != null && t.PrimaryDomain.Contains(search)));

        var totalItems = await query.CountAsync();

        var tenants = await query
            .OrderBy(t => t.DisplayName)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(t => new TenantListDto
            {
                Id = t.Id,
                TenantId = t.TenantId,
                DisplayName = t.DisplayName,
                PrimaryDomain = t.PrimaryDomain,
                Status = t.Status,
                GdapExpiresAt = t.GdapExpiresAt,
                LastSyncedAt = t.LastSyncedAt,
                SyncEnabled = t.SyncEnabled,
            })
            .ToListAsync();

        return Ok(new PagedResult<TenantListDto>
        {
            Data = tenants,
            Pagination = new PaginationInfo { Page = page, PageSize = pageSize, TotalItems = totalItems }
        });
    }

    /// <summary>
    /// Get a single tenant by database ID.
    /// </summary>
    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetTenant(int id)
    {
        // SECURITY: a non-MSP caller may only read its own tenant; deny others
        // as "not found" so tenant existence isn't leaked.
        if (!_tenantContext.IsMspAdmin && id != _tenantContext.ClientTenantDbId)
            return NotFound(new { error = new { code = "NOT_FOUND", message = "Tenant not found." } });

        var tenant = await _db.ClientTenants.AsNoTracking().FirstOrDefaultAsync(t => t.Id == id);
        if (tenant == null)
            return NotFound(new { error = new { code = "NOT_FOUND", message = "Tenant not found." } });

        return Ok(new TenantDetailDto
        {
            Id = tenant.Id,
            TenantId = tenant.TenantId,
            DisplayName = tenant.DisplayName,
            PrimaryDomain = tenant.PrimaryDomain,
            Status = tenant.Status,
            GdapRelationshipId = tenant.GdapRelationshipId,
            GdapExpiresAt = tenant.GdapExpiresAt,
            GdapRoles = tenant.GdapRolesJson != null
                ? System.Text.Json.JsonSerializer.Deserialize<List<string>>(tenant.GdapRolesJson)
                : null,
            LastSyncedAt = tenant.LastSyncedAt,
            SyncEnabled = tenant.SyncEnabled,
            Notes = tenant.Notes,
            CreatedAt = tenant.CreatedAt,
            UpdatedAt = tenant.UpdatedAt,
        });
    }

    /// <summary>
    /// Sync GDAP relationships to local tenant registry. Admin only.
    /// </summary>
    [HttpPost("sync-gdap")]
    public async Task<IActionResult> SyncGdap()
    {
        // SECURITY: GDAP sync is an MSP-wide (NOIT) operation over all client
        // tenants, so it is restricted to MSP admins.
        if (!_tenantContext.IsMspAdmin)
            return StatusCode(StatusCodes.Status403Forbidden,
                new { error = new { code = "FORBIDDEN", message = "MSP admin role required." } });

        _logger.LogInformation("GDAP sync requested");

        var result = await _gdapService.SyncTenantRegistryAsync();

        await _audit.LogAsync("Tenant.SyncGdap", "ClientTenant", details: result);

        return Ok(result);
    }
}
