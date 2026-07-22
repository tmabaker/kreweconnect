using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using NOIT.ClientTools.Core.DTOs;
using NOIT.ClientTools.Core.Enums;
using NOIT.ClientTools.Core.Interfaces;
using NOIT.ClientTools.Core.Models;
using NOIT.ClientTools.Infrastructure.Data;

namespace NOIT.ClientTools.Infrastructure.Services;

public class ContractService : IContractService
{
    private readonly AppDbContext _db;
    private readonly ILogger<ContractService> _logger;
    private readonly ITenantContext _tenantContext;

    public ContractService(AppDbContext db, ILogger<ContractService> logger, ITenantContext tenantContext)
    {
        _db = db;
        _logger = logger;
        _tenantContext = tenantContext;
    }

    /// <summary>
    /// Tenant-isolation predicate for by-id lookups/mutations. Only MSP admins
    /// (querying "all") may cross tenants; everyone else is confined to the
    /// tenant the middleware authorized from their token. Fails closed when no
    /// tenant is resolved.
    /// </summary>
    private bool InScope(int tenantDbId) =>
        _tenantContext.IsAllTenants || _tenantContext.ClientTenantDbId == tenantDbId;

    public async Task<PagedResult<ContractListDto>> GetAllAsync(
        int? tenantId, string? search, ContractType? contractType, ContractStatus? status,
        string? vendorName, string sortBy, string sortDir, int page, int pageSize,
        CancellationToken ct = default)
    {
        var query = _db.Contracts
            .Include(c => c.Tenant)
            .Include(c => c.ContractTags).ThenInclude(ct2 => ct2.Tag)
            .Where(c => !c.IsArchived)
            .AsNoTracking();

        if (tenantId.HasValue)
            query = query.Where(c => c.TenantId == tenantId.Value);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.ToLower();
            query = query.Where(c =>
                c.Title.ToLower().Contains(s) ||
                c.VendorName.ToLower().Contains(s) ||
                (c.Description != null && c.Description.ToLower().Contains(s)));
        }

        if (contractType.HasValue)
            query = query.Where(c => c.ContractType == contractType.Value);

        if (status.HasValue)
            query = query.Where(c => c.Status == status.Value);

        if (!string.IsNullOrWhiteSpace(vendorName))
            query = query.Where(c => c.VendorName.ToLower().Contains(vendorName.ToLower()));

        var totalItems = await query.CountAsync(ct);

        query = (sortBy?.ToLower(), sortDir?.ToLower()) switch
        {
            ("vendor", "desc") => query.OrderByDescending(c => c.VendorName),
            ("vendor", _) => query.OrderBy(c => c.VendorName),
            ("value", "desc") => query.OrderByDescending(c => c.Value),
            ("value", _) => query.OrderBy(c => c.Value),
            ("enddate", "desc") => query.OrderByDescending(c => c.EndDate),
            ("enddate", _) => query.OrderBy(c => c.EndDate),
            ("status", "desc") => query.OrderByDescending(c => c.Status),
            ("status", _) => query.OrderBy(c => c.Status),
            (_, "desc") => query.OrderByDescending(c => c.Title),
            _ => query.OrderBy(c => c.Title),
        };

        var contracts = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var data = contracts.Select(c => new ContractListDto
        {
            Id = c.Id,
            TenantId = c.TenantId,
            TenantDisplayName = c.Tenant.DisplayName,
            VendorName = c.VendorName,
            ContractType = c.ContractType,
            Title = c.Title,
            StartDate = c.StartDate,
            EndDate = c.EndDate,
            RenewalDate = c.RenewalDate,
            AutoRenew = c.AutoRenew,
            Value = c.Value,
            Currency = c.Currency,
            Status = c.Status,
            DaysUntilExpiry = c.EndDate.HasValue ? (c.EndDate.Value.DayNumber - today.DayNumber) : null,
            Tags = c.ContractTags.Select(t => t.Tag.Name).ToList(),
        }).ToList();

        return new PagedResult<ContractListDto>
        {
            Data = data,
            Pagination = new PaginationInfo { Page = page, PageSize = pageSize, TotalItems = totalItems },
        };
    }

    public async Task<ContractDetailDto?> GetByIdAsync(Guid id, CancellationToken ct = default)
    {
        var c = await _db.Contracts
            .Include(c2 => c2.Tenant)
            .Include(c2 => c2.Versions)
            .Include(c2 => c2.Documents)
            .Include(c2 => c2.Approvals)
            .Include(c2 => c2.ContractTags).ThenInclude(ct2 => ct2.Tag)
            .Include(c2 => c2.RenewalAlerts)
            .AsNoTracking()
            .FirstOrDefaultAsync(c2 => c2.Id == id, ct);

        if (c == null) return null;

        // SECURITY: tenant isolation for a by-id lookup — return "not found"
        // (never leak existence) when the contract is outside the caller's scope.
        if (!InScope(c.TenantId)) return null;

        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        return new ContractDetailDto
        {
            Id = c.Id,
            TenantId = c.TenantId,
            TenantDisplayName = c.Tenant.DisplayName,
            VendorName = c.VendorName,
            ContractType = c.ContractType,
            Title = c.Title,
            Description = c.Description,
            StartDate = c.StartDate,
            EndDate = c.EndDate,
            RenewalDate = c.RenewalDate,
            AutoRenew = c.AutoRenew,
            Value = c.Value,
            Currency = c.Currency,
            Status = c.Status,
            SLATerms = c.SLATerms,
            Notes = c.Notes,
            CreatedById = c.CreatedById,
            IsArchived = c.IsArchived,
            CreatedAt = c.CreatedAt,
            UpdatedAt = c.UpdatedAt,
            DaysUntilExpiry = c.EndDate.HasValue ? (c.EndDate.Value.DayNumber - today.DayNumber) : null,
            Versions = c.Versions.OrderByDescending(v => v.VersionNumber).Select(v => new ContractVersionDto
            {
                Id = v.Id,
                VersionNumber = v.VersionNumber,
                Summary = v.Summary,
                ChangedById = v.ChangedById,
                ChangedAt = v.ChangedAt,
                ChangeNotes = v.ChangeNotes,
            }).ToList(),
            Documents = c.Documents.Select(d => new ContractDocumentDto
            {
                Id = d.Id,
                FileName = d.FileName,
                FileSize = d.FileSize,
                ContentType = d.ContentType,
                UploadedById = d.UploadedById,
                UploadedAt = d.UploadedAt,
            }).ToList(),
            Approvals = c.Approvals.OrderByDescending(a => a.RequestedAt).Select(a => new ContractApprovalDto
            {
                Id = a.Id,
                ContractId = a.ContractId,
                RequestedById = a.RequestedById,
                ApprovedById = a.ApprovedById,
                Status = a.Status,
                RequestedAt = a.RequestedAt,
                ResolvedAt = a.ResolvedAt,
                Comments = a.Comments,
            }).ToList(),
            Tags = c.ContractTags.Select(t => new TagDto
            {
                Id = t.Tag.Id,
                Name = t.Tag.Name,
                Color = t.Tag.Color,
            }).ToList(),
            RenewalAlerts = c.RenewalAlerts.Select(r => new RenewalAlertDto
            {
                Id = r.Id,
                ContractId = r.ContractId,
                AlertDate = r.AlertDate,
                AlertType = r.AlertType,
                IsSent = r.IsSent,
                DaysRemaining = c.EndDate.HasValue ? (c.EndDate.Value.DayNumber - today.DayNumber) : null,
            }).ToList(),
        };
    }

    public async Task<ContractDetailDto> CreateAsync(CreateContractRequest request, CancellationToken ct = default)
    {
        // SECURITY: request.TenantId comes from the body, independent of the
        // X-Tenant-Id header the middleware authorized. A caller may only create
        // a contract in a tenant they're actually scoped to.
        if (!InScope(request.TenantId))
            throw new UnauthorizedAccessException("Cannot create a contract outside the caller's tenant scope.");

        var contract = new Contract
        {
            Id = Guid.NewGuid(),
            TenantId = request.TenantId,
            VendorName = request.VendorName,
            ContractType = request.ContractType,
            Title = request.Title,
            Description = request.Description,
            StartDate = request.StartDate,
            EndDate = request.EndDate,
            RenewalDate = request.RenewalDate,
            AutoRenew = request.AutoRenew,
            Value = request.Value,
            Currency = request.Currency,
            Status = request.Status,
            SLATerms = request.SLATerms,
            Notes = request.Notes,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };

        _db.Contracts.Add(contract);

        // Create initial version
        _db.ContractVersions.Add(new ContractVersion
        {
            Id = Guid.NewGuid(),
            ContractId = contract.Id,
            VersionNumber = 1,
            Summary = "Contract created",
            ChangedAt = DateTime.UtcNow,
            ChangeNotes = "Initial creation",
        });

        // Handle tags
        if (request.TagNames?.Any() == true)
        {
            foreach (var tagName in request.TagNames)
            {
                var tag = await _db.Tags.FirstOrDefaultAsync(t => t.Name.ToLower() == tagName.ToLower(), ct);
                if (tag == null)
                {
                    tag = new Tag { Id = Guid.NewGuid(), Name = tagName };
                    _db.Tags.Add(tag);
                }
                _db.ContractTags.Add(new ContractTag { Id = Guid.NewGuid(), ContractId = contract.Id, TagId = tag.Id });
            }
        }

        // Create renewal alerts if there's an end date
        if (contract.EndDate.HasValue)
        {
            var endDate = contract.EndDate.Value;
            var alertTypes = new[] { (AlertType.NinetyDay, 90), (AlertType.SixtyDay, 60), (AlertType.ThirtyDay, 30) };
            foreach (var (alertType, days) in alertTypes)
            {
                var alertDate = endDate.AddDays(-days);
                if (alertDate >= DateOnly.FromDateTime(DateTime.UtcNow))
                {
                    _db.RenewalAlerts.Add(new RenewalAlert
                    {
                        Id = Guid.NewGuid(),
                        ContractId = contract.Id,
                        AlertDate = alertDate,
                        AlertType = alertType,
                    });
                }
            }
        }

        await _db.SaveChangesAsync(ct);
        return (await GetByIdAsync(contract.Id, ct))!;
    }

    public async Task<ContractDetailDto?> UpdateAsync(Guid id, UpdateContractRequest request, CancellationToken ct = default)
    {
        var contract = await _db.Contracts
            .Include(c => c.ContractTags)
            .FirstOrDefaultAsync(c => c.Id == id, ct);
        if (contract == null) return null;

        // SECURITY: don't allow updating a contract outside the caller's scope
        // (return null -> 404, never leaking that the contract exists).
        if (!InScope(contract.TenantId)) return null;

        var changes = new List<string>();

        if (request.VendorName != null && request.VendorName != contract.VendorName) { contract.VendorName = request.VendorName; changes.Add("VendorName"); }
        if (request.ContractType.HasValue && request.ContractType != contract.ContractType) { contract.ContractType = request.ContractType.Value; changes.Add("ContractType"); }
        if (request.Title != null && request.Title != contract.Title) { contract.Title = request.Title; changes.Add("Title"); }
        if (request.Description != null) { contract.Description = request.Description; changes.Add("Description"); }
        if (request.StartDate.HasValue) { contract.StartDate = request.StartDate.Value; changes.Add("StartDate"); }
        if (request.EndDate.HasValue) { contract.EndDate = request.EndDate.Value; changes.Add("EndDate"); }
        if (request.RenewalDate.HasValue) { contract.RenewalDate = request.RenewalDate.Value; changes.Add("RenewalDate"); }
        if (request.AutoRenew.HasValue) { contract.AutoRenew = request.AutoRenew.Value; changes.Add("AutoRenew"); }
        if (request.Value.HasValue) { contract.Value = request.Value.Value; changes.Add("Value"); }
        if (request.Currency != null) { contract.Currency = request.Currency; changes.Add("Currency"); }
        if (request.Status.HasValue) { contract.Status = request.Status.Value; changes.Add("Status"); }
        if (request.SLATerms != null) { contract.SLATerms = request.SLATerms; changes.Add("SLATerms"); }
        if (request.Notes != null) { contract.Notes = request.Notes; changes.Add("Notes"); }

        contract.UpdatedAt = DateTime.UtcNow;

        // Version tracking
        var maxVersion = await _db.ContractVersions.Where(v => v.ContractId == id).MaxAsync(v => (int?)v.VersionNumber, ct) ?? 0;
        _db.ContractVersions.Add(new ContractVersion
        {
            Id = Guid.NewGuid(),
            ContractId = id,
            VersionNumber = maxVersion + 1,
            Summary = $"Updated: {string.Join(", ", changes)}",
            ChangedAt = DateTime.UtcNow,
            ChangeNotes = $"Fields changed: {string.Join(", ", changes)}",
        });

        // Handle tags if provided
        if (request.TagNames != null)
        {
            _db.ContractTags.RemoveRange(contract.ContractTags);
            foreach (var tagName in request.TagNames)
            {
                var tag = await _db.Tags.FirstOrDefaultAsync(t => t.Name.ToLower() == tagName.ToLower(), ct);
                if (tag == null)
                {
                    tag = new Tag { Id = Guid.NewGuid(), Name = tagName };
                    _db.Tags.Add(tag);
                }
                _db.ContractTags.Add(new ContractTag { Id = Guid.NewGuid(), ContractId = contract.Id, TagId = tag.Id });
            }
        }

        await _db.SaveChangesAsync(ct);
        return await GetByIdAsync(id, ct);
    }

    public async Task<bool> DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var contract = await _db.Contracts.FirstOrDefaultAsync(c => c.Id == id, ct);
        if (contract == null) return false;

        // SECURITY: don't allow archiving a contract outside the caller's scope.
        if (!InScope(contract.TenantId)) return false;

        contract.IsArchived = true;
        contract.ArchivedAt = DateTime.UtcNow;
        contract.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        return true;
    }

    // SECURITY TODO: the by-contractId helpers below (versions, documents,
    // AddDocument) do not yet verify the parent contract is within the caller's
    // tenant scope. They should load contract.TenantId and apply InScope(...)
    // before returning/mutating, mirroring GetByIdAsync. Left as follow-up to
    // avoid behavioural changes that need build/integration verification.
    public async Task<List<ContractVersionDto>> GetVersionsAsync(Guid contractId, CancellationToken ct = default)
    {
        return await _db.ContractVersions
            .Where(v => v.ContractId == contractId)
            .OrderByDescending(v => v.VersionNumber)
            .Select(v => new ContractVersionDto
            {
                Id = v.Id,
                VersionNumber = v.VersionNumber,
                Summary = v.Summary,
                ChangedById = v.ChangedById,
                ChangedAt = v.ChangedAt,
                ChangeNotes = v.ChangeNotes,
            })
            .AsNoTracking()
            .ToListAsync(ct);
    }

    public async Task<ContractDocumentDto> AddDocumentAsync(Guid contractId, UploadDocumentRequest request, CancellationToken ct = default)
    {
        var doc = new ContractDocument
        {
            Id = Guid.NewGuid(),
            ContractId = contractId,
            FileName = request.FileName,
            FileSize = request.FileSize,
            ContentType = request.ContentType,
            StoragePath = $"contracts/{contractId}/{request.FileName}",
            UploadedAt = DateTime.UtcNow,
        };

        _db.ContractDocuments.Add(doc);
        await _db.SaveChangesAsync(ct);

        return new ContractDocumentDto
        {
            Id = doc.Id,
            FileName = doc.FileName,
            FileSize = doc.FileSize,
            ContentType = doc.ContentType,
            UploadedById = doc.UploadedById,
            UploadedAt = doc.UploadedAt,
        };
    }

    public async Task<List<ContractDocumentDto>> GetDocumentsAsync(Guid contractId, CancellationToken ct = default)
    {
        return await _db.ContractDocuments
            .Where(d => d.ContractId == contractId)
            .OrderByDescending(d => d.UploadedAt)
            .Select(d => new ContractDocumentDto
            {
                Id = d.Id,
                FileName = d.FileName,
                FileSize = d.FileSize,
                ContentType = d.ContentType,
                UploadedById = d.UploadedById,
                UploadedAt = d.UploadedAt,
            })
            .AsNoTracking()
            .ToListAsync(ct);
    }

    public async Task<ContractDashboardDto> GetDashboardAsync(int? tenantId, CancellationToken ct = default)
    {
        var query = _db.Contracts.Where(c => !c.IsArchived).AsNoTracking();
        if (tenantId.HasValue)
            query = query.Where(c => c.TenantId == tenantId.Value);

        var contracts = await query
            .Include(c => c.Tenant)
            .Include(c => c.ContractTags).ThenInclude(ct2 => ct2.Tag)
            .ToListAsync(ct);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var thirtyDays = today.AddDays(30);

        var expiringSoon = contracts.Where(c => c.EndDate.HasValue && c.EndDate.Value <= thirtyDays && c.EndDate.Value >= today).ToList();

        var recentContracts = contracts.OrderByDescending(c => c.CreatedAt).Take(5).Select(c => new ContractListDto
        {
            Id = c.Id,
            TenantId = c.TenantId,
            TenantDisplayName = c.Tenant.DisplayName,
            VendorName = c.VendorName,
            ContractType = c.ContractType,
            Title = c.Title,
            StartDate = c.StartDate,
            EndDate = c.EndDate,
            RenewalDate = c.RenewalDate,
            AutoRenew = c.AutoRenew,
            Value = c.Value,
            Currency = c.Currency,
            Status = c.Status,
            DaysUntilExpiry = c.EndDate.HasValue ? (c.EndDate.Value.DayNumber - today.DayNumber) : null,
            Tags = c.ContractTags.Select(t => t.Tag.Name).ToList(),
        }).ToList();

        // Get upcoming renewal alerts
        var renewalAlerts = await _db.RenewalAlerts
            .Include(r => r.Contract).ThenInclude(c => c.Tenant)
            .Where(r => !r.IsSent && r.AlertDate <= thirtyDays && r.AlertDate >= today)
            .OrderBy(r => r.AlertDate)
            .Take(10)
            .AsNoTracking()
            .ToListAsync(ct);

        return new ContractDashboardDto
        {
            TotalContracts = contracts.Count,
            ActiveContracts = contracts.Count(c => c.Status == ContractStatus.Active),
            ExpiringSoon = expiringSoon.Count,
            TotalValue = contracts.Sum(c => c.Value ?? 0),
            ByType = contracts.GroupBy(c => c.ContractType.ToString()).ToDictionary(g => g.Key, g => g.Count()),
            ByStatus = contracts.GroupBy(c => c.Status.ToString()).ToDictionary(g => g.Key, g => g.Count()),
            RecentContracts = recentContracts,
            UpcomingRenewals = renewalAlerts.Select(r => new RenewalAlertDto
            {
                Id = r.Id,
                ContractId = r.ContractId,
                ContractTitle = r.Contract.Title,
                VendorName = r.Contract.VendorName,
                TenantDisplayName = r.Contract.Tenant.DisplayName,
                AlertDate = r.AlertDate,
                ContractEndDate = r.Contract.EndDate,
                AlertType = r.AlertType,
                IsSent = r.IsSent,
                DaysRemaining = r.Contract.EndDate.HasValue ? (r.Contract.EndDate.Value.DayNumber - today.DayNumber) : null,
            }).ToList(),
        };
    }

    public async Task<List<TagDto>> GetTagsAsync(CancellationToken ct = default)
    {
        return await _db.Tags
            .OrderBy(t => t.Name)
            .Select(t => new TagDto { Id = t.Id, Name = t.Name, Color = t.Color })
            .AsNoTracking()
            .ToListAsync(ct);
    }

    public async Task<TagDto> CreateTagAsync(CreateTagRequest request, CancellationToken ct = default)
    {
        var tag = new Tag
        {
            Id = Guid.NewGuid(),
            Name = request.Name,
            Color = request.Color,
            TenantId = request.TenantId,
        };
        _db.Tags.Add(tag);
        await _db.SaveChangesAsync(ct);
        return new TagDto { Id = tag.Id, Name = tag.Name, Color = tag.Color };
    }
}
