using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NOIT.ClientTools.Core.DTOs;
using NOIT.ClientTools.Core.Interfaces;
using NOIT.ClientTools.Infrastructure.Data;

namespace NOIT.ClientTools.Api.Controllers;

[ApiController]
[Route("api/v1/[controller]")]
[Authorize]
public class EmployeesController : ControllerBase
{
    private readonly IEmployeeService _employeeService;
    private readonly IEmployeeSyncService _syncService;
    private readonly IAuditService _audit;
    private readonly AppDbContext _db;
    private readonly ITenantContext _tenantContext;
    private readonly ILogger<EmployeesController> _logger;

    public EmployeesController(
        IEmployeeService employeeService,
        IEmployeeSyncService syncService,
        IAuditService audit,
        AppDbContext db,
        ITenantContext tenantContext,
        ILogger<EmployeesController> logger)
    {
        _employeeService = employeeService;
        _syncService = syncService;
        _audit = audit;
        _db = db;
        _tenantContext = tenantContext;
        _logger = logger;
    }

    /// <summary>
    /// List employees with filtering, search, and pagination.
    /// Uses X-Tenant-Id header for tenant scoping; "all" returns cross-tenant results.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetEmployees(
        [FromQuery] string? search,
        [FromQuery] string? department,
        [FromQuery] string? officeLocation,
        [FromQuery] string? jobTitle,
        [FromQuery] string sortBy = "displayName",
        [FromQuery] string sortDir = "asc",
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25)
    {
        var tenantId = ResolveTenantId();
        var result = await _employeeService.GetAllAsync(tenantId, search, department, officeLocation, jobTitle, sortBy, sortDir, page, pageSize);
        return Ok(result);
    }

    /// <summary>
    /// Full-text search across employees.
    /// </summary>
    [HttpGet("search")]
    public async Task<IActionResult> SearchEmployees(
        [FromQuery] string q = "",
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25)
    {
        var tenantId = ResolveTenantId();
        var result = await _employeeService.SearchAsync(q, tenantId, page, pageSize);
        return Ok(result);
    }

    /// <summary>
    /// Get a single employee by ID with full details.
    /// </summary>
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetEmployee(Guid id)
    {
        var emp = await _employeeService.GetByIdAsync(id);
        if (emp == null)
            return NotFound(new { error = new { code = "NOT_FOUND", message = "Employee not found." } });
        return Ok(emp);
    }

    /// <summary>
    /// Get org chart data for a tenant.
    /// </summary>
    [HttpGet("org-chart")]
    public async Task<IActionResult> GetOrgChart([FromQuery] Guid? rootEmployeeId)
    {
        var tenantId = ResolveTenantId();
        if (!tenantId.HasValue)
            return BadRequest(new { error = new { code = "VALIDATION_ERROR", message = "Org chart requires a specific tenant (X-Tenant-Id cannot be 'all')." } });

        var chart = await _employeeService.GetOrgChartAsync(tenantId.Value, rootEmployeeId);
        if (chart == null)
            return NotFound(new { error = new { code = "NOT_FOUND", message = "No employees found for this tenant." } });
        return Ok(chart);
    }

    /// <summary>
    /// Trigger AD sync for a specific tenant.
    /// </summary>
    [HttpPost("sync")]
    public async Task<IActionResult> SyncEmployees([FromQuery] int tenantId)
    {
        // SECURITY: directory sync is an MSP (NOIT) operation across client tenants.
        if (!RequireMspAdmin(out var forbid)) return forbid!;

        _logger.LogInformation("Employee sync requested for tenant {TenantId}", tenantId);

        var result = await _syncService.SyncTenantAsync(tenantId);
        await _audit.LogAsync("Employee.Sync", "Employee", details: result);

        return Ok(result);
    }

    /// <summary>
    /// Get custom field values for an employee.
    /// </summary>
    [HttpGet("{id:guid}/custom-fields")]
    public async Task<IActionResult> GetCustomFields(Guid id)
    {
        var fields = await _employeeService.GetCustomFieldsAsync(id);
        return Ok(fields);
    }

    /// <summary>
    /// Update custom field values for an employee.
    /// </summary>
    [HttpPut("{id:guid}/custom-fields")]
    public async Task<IActionResult> UpdateCustomFields(Guid id, [FromBody] UpdateCustomFieldsRequest request)
    {
        // Verify employee exists
        var exists = await _db.Employees.AnyAsync(e => e.Id == id);
        if (!exists)
            return NotFound(new { error = new { code = "NOT_FOUND", message = "Employee not found." } });

        await _employeeService.SetCustomFieldsAsync(id, request.Fields);
        await _audit.LogAsync("Employee.UpdateCustomFields", "Employee", entityId: id.ToString());

        return Ok(new { message = "Custom fields updated." });
    }

    /// <summary>
    /// Get all unique departments across the tenant scope (for filter dropdowns).
    /// </summary>
    [HttpGet("facets")]
    public async Task<IActionResult> GetFacets()
    {
        var tenantId = ResolveTenantId();
        var query = _db.Employees.Where(e => e.IsActive).AsNoTracking();
        if (tenantId.HasValue)
            query = query.Where(e => e.ClientTenantId == tenantId.Value);

        var departments = await query.Where(e => e.Department != null).Select(e => e.Department!).Distinct().OrderBy(d => d).ToListAsync();
        var offices = await query.Where(e => e.OfficeLocation != null).Select(e => e.OfficeLocation!).Distinct().OrderBy(o => o).ToListAsync();
        var titles = await query.Where(e => e.JobTitle != null).Select(e => e.JobTitle!).Distinct().OrderBy(t => t).ToListAsync();

        return Ok(new { departments, offices, titles });
    }

    // --- Custom field definitions ---

    /// <summary>
    /// List custom field definitions.
    /// </summary>
    [HttpGet("/api/v1/custom-fields/definitions")]
    public async Task<IActionResult> GetCustomFieldDefinitions([FromQuery] int? tenantId)
    {
        var query = _db.CustomFieldDefinitions.AsNoTracking().AsQueryable();

        if (tenantId.HasValue)
            query = query.Where(d => d.TenantId == null || d.TenantId == tenantId.Value);
        else
            query = query.Where(d => d.TenantId == null); // globals only

        var definitions = await query
            .OrderBy(d => d.DisplayOrder)
            .Select(d => new CustomFieldDefinitionDto
            {
                Id = d.Id,
                TenantId = d.TenantId,
                FieldName = d.FieldName,
                FieldType = d.FieldType,
                IsRequired = d.IsRequired,
                DisplayOrder = d.DisplayOrder,
                SelectOptions = d.SelectOptions,
            })
            .ToListAsync();

        return Ok(definitions);
    }

    /// <summary>
    /// Create a custom field definition.
    /// </summary>
    [HttpPost("/api/v1/custom-fields/definitions")]
    public async Task<IActionResult> CreateCustomFieldDefinition([FromBody] CreateCustomFieldDefinitionRequest request)
    {
        // SECURITY: custom-field definitions are shared schema (a null TenantId is
        // a global definition), so only MSP admins may create them.
        if (!RequireMspAdmin(out var forbid)) return forbid!;

        var definition = new Core.Models.CustomFieldDefinition
        {
            Id = Guid.NewGuid(),
            TenantId = request.TenantId,
            FieldName = request.FieldName,
            FieldType = request.FieldType,
            IsRequired = request.IsRequired,
            DisplayOrder = request.DisplayOrder,
            SelectOptions = request.SelectOptions,
            CreatedAt = DateTime.UtcNow,
        };

        _db.CustomFieldDefinitions.Add(definition);
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetCustomFieldDefinitions), new CustomFieldDefinitionDto
        {
            Id = definition.Id,
            TenantId = definition.TenantId,
            FieldName = definition.FieldName,
            FieldType = definition.FieldType,
            IsRequired = definition.IsRequired,
            DisplayOrder = definition.DisplayOrder,
            SelectOptions = definition.SelectOptions,
        });
    }

    // ─── Helpers ──────────────────────────────

    // SECURITY: resolve the tenant filter from the middleware-authorized scope
    // (derived from the caller's token), NOT from the raw X-Tenant-Id header.
    // Non-MSP callers are pinned to their own tenant; only MSP admins get the
    // cross-tenant (null) scope. This prevents a client from listing another
    // tenant's employees by spoofing or omitting the header.
    private int? ResolveTenantId()
    {
        if (_tenantContext.IsAllTenants) return null; // MSP "all tenants"
        return _tenantContext.ClientTenantDbId;       // specific authorized tenant
    }

    private bool RequireMspAdmin(out IActionResult? forbid)
    {
        if (_tenantContext.IsMspAdmin) { forbid = null; return true; }
        forbid = StatusCode(StatusCodes.Status403Forbidden,
            new { error = new { code = "FORBIDDEN", message = "MSP admin role required." } });
        return false;
    }
}
