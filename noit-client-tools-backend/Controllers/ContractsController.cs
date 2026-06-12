using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using NOIT.ClientTools.Core.DTOs;
using NOIT.ClientTools.Core.Enums;
using NOIT.ClientTools.Core.Interfaces;
using NOIT.ClientTools.Infrastructure.Data;

namespace NOIT.ClientTools.Api.Controllers;

[ApiController]
[Route("api/v1/[controller]")]
[Authorize]
public class ContractsController : ControllerBase
{
    private readonly IContractService _contractService;
    private readonly IContractApprovalService _approvalService;
    private readonly IRenewalAlertService _renewalService;
    private readonly AppDbContext _db;
    private readonly ILogger<ContractsController> _logger;

    public ContractsController(
        IContractService contractService,
        IContractApprovalService approvalService,
        IRenewalAlertService renewalService,
        AppDbContext db,
        ILogger<ContractsController> logger)
    {
        _contractService = contractService;
        _approvalService = approvalService;
        _renewalService = renewalService;
        _db = db;
        _logger = logger;
    }

    /// <summary>
    /// List contracts with filtering, search, and pagination.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetContracts(
        [FromQuery] string? search,
        [FromQuery] ContractType? contractType,
        [FromQuery] ContractStatus? status,
        [FromQuery] string? vendorName,
        [FromQuery] string sortBy = "title",
        [FromQuery] string sortDir = "asc",
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25)
    {
        var tenantId = ResolveTenantId();
        var result = await _contractService.GetAllAsync(tenantId, search, contractType, status, vendorName, sortBy, sortDir, page, pageSize);
        return Ok(result);
    }

    /// <summary>
    /// Get a single contract by ID with full details.
    /// </summary>
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetContract(Guid id)
    {
        var contract = await _contractService.GetByIdAsync(id);
        if (contract == null)
            return NotFound(new { error = new { code = "NOT_FOUND", message = "Contract not found." } });
        return Ok(contract);
    }

    /// <summary>
    /// Create a new contract.
    /// </summary>
    [HttpPost]
    public async Task<IActionResult> CreateContract([FromBody] CreateContractRequest request)
    {
        var contract = await _contractService.CreateAsync(request);
        return CreatedAtAction(nameof(GetContract), new { id = contract.Id }, contract);
    }

    /// <summary>
    /// Update an existing contract.
    /// </summary>
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> UpdateContract(Guid id, [FromBody] UpdateContractRequest request)
    {
        var contract = await _contractService.UpdateAsync(id, request);
        if (contract == null)
            return NotFound(new { error = new { code = "NOT_FOUND", message = "Contract not found." } });
        return Ok(contract);
    }

    /// <summary>
    /// Soft delete/archive a contract.
    /// </summary>
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteContract(Guid id)
    {
        var result = await _contractService.DeleteAsync(id);
        if (!result)
            return NotFound(new { error = new { code = "NOT_FOUND", message = "Contract not found." } });
        return Ok(new { message = "Contract archived." });
    }

    /// <summary>
    /// Get version history for a contract.
    /// </summary>
    [HttpGet("{id:guid}/versions")]
    public async Task<IActionResult> GetVersions(Guid id)
    {
        var versions = await _contractService.GetVersionsAsync(id);
        return Ok(versions);
    }

    /// <summary>
    /// Upload a document to a contract (metadata only for now).
    /// </summary>
    [HttpPost("{id:guid}/documents")]
    public async Task<IActionResult> UploadDocument(Guid id, [FromBody] UploadDocumentRequest request)
    {
        var doc = await _contractService.AddDocumentAsync(id, request);
        return CreatedAtAction(nameof(GetContract), new { id }, doc);
    }

    /// <summary>
    /// Get documents for a contract.
    /// </summary>
    [HttpGet("{id:guid}/documents")]
    public async Task<IActionResult> GetDocuments(Guid id)
    {
        var docs = await _contractService.GetDocumentsAsync(id);
        return Ok(docs);
    }

    /// <summary>
    /// Request approval for a contract.
    /// </summary>
    [HttpPost("{id:guid}/approvals")]
    public async Task<IActionResult> RequestApproval(Guid id, [FromBody] ContractApprovalRequest request)
    {
        var approval = await _approvalService.RequestApprovalAsync(id, request);
        return CreatedAtAction(nameof(GetContract), new { id }, approval);
    }

    /// <summary>
    /// Approve or reject an approval request.
    /// </summary>
    [HttpPut("{contractId:guid}/approvals/{approvalId:guid}")]
    public async Task<IActionResult> ResolveApproval(Guid contractId, Guid approvalId, [FromBody] ApprovalDecisionRequest request)
    {
        var approval = await _approvalService.ResolveApprovalAsync(approvalId, request);
        if (approval == null)
            return NotFound(new { error = new { code = "NOT_FOUND", message = "Approval not found." } });
        return Ok(approval);
    }

    /// <summary>
    /// Get upcoming renewal alerts.
    /// </summary>
    [HttpGet("renewals")]
    public async Task<IActionResult> GetRenewals([FromQuery] int daysAhead = 90)
    {
        var tenantId = ResolveTenantId();
        var renewals = await _renewalService.GetUpcomingRenewalsAsync(tenantId, daysAhead);
        return Ok(renewals);
    }

    /// <summary>
    /// Get dashboard aggregate stats.
    /// </summary>
    [HttpGet("dashboard")]
    public async Task<IActionResult> GetDashboard()
    {
        var tenantId = ResolveTenantId();
        var dashboard = await _contractService.GetDashboardAsync(tenantId);
        return Ok(dashboard);
    }

    /// <summary>
    /// List all tags.
    /// </summary>
    [HttpGet("tags")]
    public async Task<IActionResult> GetTags()
    {
        var tags = await _contractService.GetTagsAsync();
        return Ok(tags);
    }

    /// <summary>
    /// Create a new tag.
    /// </summary>
    [HttpPost("tags")]
    public async Task<IActionResult> CreateTag([FromBody] CreateTagRequest request)
    {
        var tag = await _contractService.CreateTagAsync(request);
        return CreatedAtAction(nameof(GetTags), tag);
    }

    // ─── Helpers ──────────────────────────────

    private int? ResolveTenantId()
    {
        var headerVal = Request.Headers["X-Tenant-Id"].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(headerVal) || headerVal == "all")
            return null;

        if (Guid.TryParse(headerVal, out var guid))
        {
            var tenant = _db.ClientTenants.FirstOrDefault(t => t.TenantId == guid);
            return tenant?.Id;
        }

        if (int.TryParse(headerVal, out var id))
            return id;

        return null;
    }
}
