using System.Text.Json;
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
            ("category", "desc") => query.OrderByDescending(c => c.AgreementCategory),
            ("category", _) => query.OrderBy(c => c.AgreementCategory),
            ("renewaltype", "desc") => query.OrderByDescending(c => c.RenewalType),
            ("renewaltype", _) => query.OrderBy(c => c.RenewalType),
            ("decisiondate", "desc") => query.OrderByDescending(c => c.LatestRenewalDecisionDate),
            ("decisiondate", _) => query.OrderBy(c => c.LatestRenewalDecisionDate),
            ("tier", "desc") => query.OrderByDescending(c => c.ConfidenceTier),
            ("tier", _) => query.OrderBy(c => c.ConfidenceTier),
            (_, "desc") => query.OrderByDescending(c => c.Title),
            _ => query.OrderBy(c => c.Title),
        };

        var contracts = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var data = contracts.Select(c => MapListItem(c, today)).ToList();

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
            .Include(c2 => c2.Contacts)
            .Include(c2 => c2.Obligations)
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

            // Schema v2
            AgreementCategory = c.AgreementCategory,
            RenewalType = c.RenewalType,
            LatestRenewalDecisionDate = c.LatestRenewalDecisionDate,
            EarliestRenewalDecisionDate = c.EarliestRenewalDecisionDate,
            ConfidenceTier = c.ConfidenceTier,
            NeedsReview = c.NeedsReview,
            NoticePeriodDays = c.NoticePeriodDays,
            RenewalTermMonths = c.RenewalTermMonths,
            TerminationTerms = c.TerminationTerms,
            // Value is the pre-v2 total; fall back to it for rows that predate TotalValue.
            TotalValue = c.TotalValue ?? c.Value,
            RecurringAmount = c.RecurringAmount,
            BillingFrequency = c.BillingFrequency,
            AnnualizedValue = AnnualizeValue(c.RecurringAmount, c.BillingFrequency, c.TotalValue ?? c.Value, c.StartDate, c.EndDate),
            CounterpartyName = c.CounterpartyName ?? c.VendorName,
            ClientInternalOwner = c.ClientInternalOwner,
            Department = c.Department,
            RiskClass = c.RiskClass,
            PolicyOrAccountNumber = c.PolicyOrAccountNumber,
            CoverageOrScopeSummary = c.CoverageOrScopeSummary,
            ReviewQuestions = DeserializeQuestions(c.ReviewQuestions),
            SourceSystem = c.SourceSystem,
            SourceTenantId = c.SourceTenantId,
            SourceContainer = c.SourceContainer,
            SourcePath = c.SourcePath,
            SourceItemId = c.SourceItemId,
            SourceWebUrl = c.SourceWebUrl,
            SourceFileHash = c.SourceFileHash,
            ExtractedAt = c.ExtractedAt,
            ExtractionModel = c.ExtractionModel,
            Contacts = c.Contacts.OrderBy(x => x.Role).Select(x => new ContractContactDto
            {
                Id = x.Id,
                Role = x.Role,
                Name = x.Name,
                Company = x.Company,
                Title = x.Title,
                Email = x.Email,
                Phone = x.Phone,
                PortalUrl = x.PortalUrl,
                Notes = x.Notes,
                SourceRef = x.SourceRef,
            }).ToList(),
            Obligations = c.Obligations.OrderBy(x => x.DueDate).Select(x => new ContractObligationDto
            {
                Id = x.Id,
                Description = x.Description,
                DueDate = x.DueDate,
                Recurrence = x.Recurrence,
                Owner = x.Owner,
                Status = x.Status,
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

            // Schema v2
            AgreementCategory = request.AgreementCategory,
            RenewalType = request.RenewalType,
            RenewalTermMonths = request.RenewalTermMonths,
            NoticePeriodDays = request.NoticePeriodDays,
            EarliestRenewalDecisionDate = request.EarliestRenewalDecisionDate,
            LatestRenewalDecisionDate = request.LatestRenewalDecisionDate,
            TerminationTerms = request.TerminationTerms,
            RecurringAmount = request.RecurringAmount,
            BillingFrequency = request.BillingFrequency,
            CounterpartyName = request.CounterpartyName,
            ClientInternalOwner = request.ClientInternalOwner,
            Department = request.Department,
            RiskClass = request.RiskClass,
            PolicyOrAccountNumber = request.PolicyOrAccountNumber,
            CoverageOrScopeSummary = request.CoverageOrScopeSummary,
            ConfidenceTier = request.ConfidenceTier,
            NeedsReview = request.NeedsReview ?? false,
            ReviewQuestions = SerializeQuestions(request.ReviewQuestions),
        };

        // Value and TotalValue mirror each other; whichever the caller sent wins.
        contract.TotalValue = request.TotalValue ?? request.Value;
        contract.Value = request.Value ?? request.TotalValue;

        // AutoRenew is derived from RenewalType when one is given.
        if (request.RenewalType.HasValue)
            contract.AutoRenew = request.RenewalType.Value == RenewalType.AutoRenew;

        // Decision dates are computed when not stated.
        ApplyComputedDecisionDates(contract);

        _db.Contracts.Add(contract);

        if (request.Contacts != null)
            _db.ContractContacts.AddRange(request.Contacts.Select(d => ToContactEntity(contract.Id, d)));
        if (request.Obligations != null)
            _db.ContractObligations.AddRange(request.Obligations.Select(d => ToObligationEntity(contract.Id, d)));

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

        // Create renewal alerts (30/60/90 from the end date, plus the two decision date alerts)
        AddRenewalAlerts(contract);

        await _db.SaveChangesAsync(ct);
        return (await GetByIdAsync(contract.Id, ct))!;
    }

    public async Task<ContractDetailDto?> UpdateAsync(Guid id, UpdateContractRequest request, CancellationToken ct = default)
    {
        var contract = await _db.Contracts
            .Include(c => c.ContractTags)
            .Include(c => c.Contacts)
            .Include(c => c.Obligations)
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

        // Schema v2
        if (request.AgreementCategory.HasValue) { contract.AgreementCategory = request.AgreementCategory.Value; changes.Add("AgreementCategory"); }
        if (request.RenewalType.HasValue)
        {
            contract.RenewalType = request.RenewalType.Value;
            contract.AutoRenew = request.RenewalType.Value == RenewalType.AutoRenew; // derived
            changes.Add("RenewalType");
        }
        if (request.RenewalTermMonths.HasValue) { contract.RenewalTermMonths = request.RenewalTermMonths.Value; changes.Add("RenewalTermMonths"); }
        if (request.NoticePeriodDays.HasValue) { contract.NoticePeriodDays = request.NoticePeriodDays.Value; changes.Add("NoticePeriodDays"); }
        if (request.EarliestRenewalDecisionDate.HasValue) { contract.EarliestRenewalDecisionDate = request.EarliestRenewalDecisionDate.Value; changes.Add("EarliestRenewalDecisionDate"); }
        if (request.LatestRenewalDecisionDate.HasValue) { contract.LatestRenewalDecisionDate = request.LatestRenewalDecisionDate.Value; changes.Add("LatestRenewalDecisionDate"); }
        if (request.TerminationTerms != null) { contract.TerminationTerms = request.TerminationTerms; changes.Add("TerminationTerms"); }
        if (request.TotalValue.HasValue)
        {
            contract.TotalValue = request.TotalValue.Value;
            contract.Value = request.TotalValue.Value; // Value mirrors TotalValue
            changes.Add("TotalValue");
        }
        else if (request.Value.HasValue)
        {
            contract.TotalValue = request.Value.Value;
        }
        if (request.RecurringAmount.HasValue) { contract.RecurringAmount = request.RecurringAmount.Value; changes.Add("RecurringAmount"); }
        if (request.BillingFrequency.HasValue) { contract.BillingFrequency = request.BillingFrequency.Value; changes.Add("BillingFrequency"); }
        if (request.CounterpartyName != null) { contract.CounterpartyName = request.CounterpartyName; changes.Add("CounterpartyName"); }
        if (request.ClientInternalOwner != null) { contract.ClientInternalOwner = request.ClientInternalOwner; changes.Add("ClientInternalOwner"); }
        if (request.Department != null) { contract.Department = request.Department; changes.Add("Department"); }
        if (request.RiskClass.HasValue) { contract.RiskClass = request.RiskClass.Value; changes.Add("RiskClass"); }
        if (request.PolicyOrAccountNumber != null) { contract.PolicyOrAccountNumber = request.PolicyOrAccountNumber; changes.Add("PolicyOrAccountNumber"); }
        if (request.CoverageOrScopeSummary != null) { contract.CoverageOrScopeSummary = request.CoverageOrScopeSummary; changes.Add("CoverageOrScopeSummary"); }
        if (request.ConfidenceTier.HasValue) { contract.ConfidenceTier = request.ConfidenceTier.Value; changes.Add("ConfidenceTier"); }
        if (request.NeedsReview.HasValue) { contract.NeedsReview = request.NeedsReview.Value; changes.Add("NeedsReview"); }
        if (request.ReviewQuestions != null) { contract.ReviewQuestions = SerializeQuestions(request.ReviewQuestions); changes.Add("ReviewQuestions"); }

        if (request.Contacts != null)
        {
            _db.ContractContacts.RemoveRange(contract.Contacts);
            _db.ContractContacts.AddRange(request.Contacts.Select(d => ToContactEntity(contract.Id, d)));
            changes.Add("Contacts");
        }
        if (request.Obligations != null)
        {
            _db.ContractObligations.RemoveRange(contract.Obligations);
            _db.ContractObligations.AddRange(request.Obligations.Select(d => ToObligationEntity(contract.Id, d)));
            changes.Add("Obligations");
        }

        // Fill the decision window if it is still empty and can now be computed.
        ApplyComputedDecisionDates(contract);

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

        var recentContracts = contracts.OrderByDescending(c => c.CreatedAt).Take(5).Select(c => MapListItem(c, today)).ToList();

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

    // ─── Schema v2: import ────────────────────────────────────────────

    /// <summary>Days between the earliest and latest decision date when none is stated.</summary>
    public const int DefaultDecisionWindowDays = 90;

    /// <summary>Maximum SQL column lengths used when trimming imported text.</summary>
    private const int MaxTitle = 500, MaxVendor = 300, MaxTag = 100, MaxFileName = 500, MaxStoragePath = 1000;

    public async Task<ContractImportResult> ImportAsync(
        int tenantId, IEnumerable<ContractImportRecord> records, string? importedById, CancellationToken ct = default)
    {
        var tenantExists = await _db.ClientTenants.AsNoTracking().AnyAsync(t => t.Id == tenantId, ct);
        if (!tenantExists)
            throw new ArgumentException($"Unknown client tenant id {tenantId}.", nameof(tenantId));

        var items = new List<ContractImportItemResult>();
        var index = 0;

        // One SaveChanges per record so a bad record fails alone and never poisons the batch.
        foreach (var item in records)
        {
            ct.ThrowIfCancellationRequested();
            var i = index++;

            try
            {
                items.Add(await ImportOneAsync(tenantId, item, importedById, i, ct));
            }
            catch (ImportValidationException ex)
            {
                _db.ChangeTracker.Clear();
                items.Add(new ContractImportItemResult
                {
                    Index = i,
                    SourceItemId = item?.SourceItemId,
                    Outcome = ContractImportOutcome.Failed,
                    Message = ex.Message,
                });
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                // Do not echo database or internal error text back to the caller.
                _db.ChangeTracker.Clear();
                _logger.LogError(ex, "Contract import failed for record {Index} (tenant {TenantId})", i, tenantId);
                items.Add(new ContractImportItemResult
                {
                    Index = i,
                    SourceItemId = item?.SourceItemId,
                    Outcome = ContractImportOutcome.Failed,
                    Message = "Unexpected error while saving this record. See server logs.",
                });
            }
        }

        return new ContractImportResult
        {
            Total = items.Count,
            Created = items.Count(x => x.Outcome == ContractImportOutcome.Created),
            Updated = items.Count(x => x.Outcome == ContractImportOutcome.Updated),
            Skipped = items.Count(x => x.Outcome == ContractImportOutcome.Skipped),
            Failed = items.Count(x => x.Outcome == ContractImportOutcome.Failed),
            Items = items,
        };
    }

    private async Task<ContractImportItemResult> ImportOneAsync(
        int tenantId, ContractImportRecord rec, string? importedById, int index, CancellationToken ct)
    {
        if (rec == null)
            throw new ImportValidationException("Record is null.");

        // Required by import-schema.json. Validated here so one bad record cannot reject the batch.
        var missing = new List<string>();
        if (string.IsNullOrWhiteSpace(rec.SourceTenantId)) missing.Add("sourceTenantId");
        if (!rec.SourceSystem.HasValue) missing.Add("sourceSystem");
        if (string.IsNullOrWhiteSpace(rec.SourceItemId)) missing.Add("sourceItemId");
        if (string.IsNullOrWhiteSpace(rec.CounterpartyName)) missing.Add("counterpartyName");
        if (string.IsNullOrWhiteSpace(rec.Title)) missing.Add("title");
        if (!rec.AgreementCategory.HasValue) missing.Add("agreementCategory");
        if (!rec.ConfidenceTier.HasValue) missing.Add("confidenceTier");
        if (missing.Count > 0)
            throw new ImportValidationException($"Missing required field(s): {string.Join(", ", missing)}.");

        var sourceItemId = rec.SourceItemId!.Trim();
        var system = rec.SourceSystem!.Value;

        // InScope "No" means found but out of scope. The pipeline keeps the location; we do not import it.
        if (string.Equals(rec.InScope, "No", StringComparison.OrdinalIgnoreCase))
        {
            return new ContractImportItemResult
            {
                Index = index, SourceItemId = sourceItemId, Outcome = ContractImportOutcome.Skipped,
                Message = "Out of scope (inScope = No); not imported.",
            };
        }

        var existing = await _db.Contracts
            .Include(c => c.Contacts)
            .Include(c => c.Obligations)
            .Include(c => c.Documents)
            .Include(c => c.ContractTags)
            .Include(c => c.RenewalAlerts)
            .FirstOrDefaultAsync(c => c.TenantId == tenantId && c.SourceSystem == system && c.SourceItemId == sourceItemId, ct);

        if (existing != null && (existing.IsArchived || existing.Status != ContractStatus.Draft))
        {
            // A person has already worked this record. Never overwrite reviewed data with a re-extraction.
            return new ContractImportItemResult
            {
                Index = index, SourceItemId = sourceItemId, ContractId = existing.Id, Outcome = ContractImportOutcome.Skipped,
                Message = existing.IsArchived
                    ? "Existing record is archived; left unchanged."
                    : $"Existing record is {existing.Status}, no longer Draft; left unchanged.",
            };
        }

        var isNew = existing == null;
        var contract = existing ?? new Contract
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Status = ContractStatus.Draft,
            CreatedById = importedById,
            CreatedAt = DateTime.UtcNow,
        };

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var reviewQuestions = rec.ReviewQuestions
            .Where(q => !string.IsNullOrWhiteSpace(q))
            .Select(q => q.Trim())
            .ToList();
        var needsReview = rec.NeedsReview || string.Equals(rec.InScope, "Unsure", StringComparison.OrdinalIgnoreCase);

        // StartDate is required by the table. Never invent one silently: fall back, flag it, ask a question.
        DateOnly startDate;
        if (rec.StartDate.HasValue)
        {
            startDate = rec.StartDate.Value;
        }
        else if (rec.ExecutedDate.HasValue)
        {
            startDate = rec.ExecutedDate.Value;
            needsReview = true;
            reviewQuestions.Add("Start date was not stated. The executed date was used. What is the real start date?");
        }
        else
        {
            startDate = today;
            needsReview = true;
            reviewQuestions.Add("Start date was not found. The import date was used. What is the real start date?");
        }

        // Core
        contract.VendorName = Trunc(string.IsNullOrWhiteSpace(rec.VendorName) ? rec.CounterpartyName!.Trim() : rec.VendorName.Trim(), MaxVendor)!;
        contract.CounterpartyName = Trunc(rec.CounterpartyName!.Trim(), MaxVendor);
        contract.Title = Trunc(rec.Title!.Trim(), MaxTitle)!;
        contract.Description = rec.Description;
        contract.Notes = rec.Notes;
        contract.AgreementCategory = rec.AgreementCategory;
        contract.ContractType = MapCategoryToContractType(rec.AgreementCategory!.Value);
        contract.Department = rec.Department;
        contract.ClientInternalOwner = rec.ClientInternalOwner;
        contract.PolicyOrAccountNumber = rec.PolicyOrAccountNumber;
        contract.CoverageOrScopeSummary = rec.CoverageOrScopeSummary;

        // Dates and renewal terms
        contract.StartDate = startDate;
        contract.EndDate = rec.EndDate;
        contract.RenewalType = rec.RenewalType;
        contract.AutoRenew = rec.RenewalType == RenewalType.AutoRenew; // derived
        contract.RenewalTermMonths = rec.RenewalTermMonths;
        contract.NoticePeriodDays = rec.NoticePeriodDays;
        contract.TerminationTerms = rec.TerminationTerms;
        contract.EarliestRenewalDecisionDate = rec.EarliestRenewalDecisionDate;
        contract.LatestRenewalDecisionDate = rec.LatestRenewalDecisionDate;
        ApplyComputedDecisionDates(contract);
        // RenewalDate is the "act by" date in the existing UI and seed data.
        contract.RenewalDate ??= contract.LatestRenewalDecisionDate;

        // Money
        contract.TotalValue = rec.TotalValue;
        contract.Value = rec.TotalValue; // Value mirrors TotalValue
        contract.RecurringAmount = rec.RecurringAmount;
        contract.BillingFrequency = rec.BillingFrequency;
        var currency = string.IsNullOrWhiteSpace(rec.Currency) ? "USD" : rec.Currency.Trim().ToUpperInvariant();
        contract.Currency = currency.Length == 3 ? currency : "USD";

        // Review state and provenance
        contract.ConfidenceTier = rec.ConfidenceTier;
        contract.NeedsReview = needsReview;
        contract.ReviewQuestions = SerializeQuestions(reviewQuestions);
        contract.SourceSystem = system;
        contract.SourceTenantId = Trunc(rec.SourceTenantId!.Trim(), 64);
        contract.SourceContainer = Trunc(rec.SourceContainer, 500);
        contract.SourcePath = Trunc(rec.SourcePath, 1000);
        contract.SourceItemId = sourceItemId.Length > 400
            ? throw new ImportValidationException("sourceItemId is longer than 400 characters.")
            : sourceItemId;
        contract.SourceWebUrl = Trunc(rec.SourceWebUrl, 2000);
        contract.SourceFileHash = Trunc(rec.SourceFileHash, 64);
        contract.ExtractedAt = rec.ExtractedAt?.ToUniversalTime();
        contract.ExtractionModel = Trunc(rec.ExtractionModel, 100);
        contract.UpdatedAt = DateTime.UtcNow;

        if (isNew)
            _db.Contracts.Add(contract);

        // Child rows. On a Draft refresh the machine extracted children are replaced wholesale.
        if (!isNew)
        {
            _db.ContractContacts.RemoveRange(contract.Contacts.ToList());
            _db.ContractObligations.RemoveRange(contract.Obligations.ToList());
            // Keep manually uploaded files (relative storage path); replace imported link rows.
            _db.ContractDocuments.RemoveRange(contract.Documents.Where(IsImportedDocument).ToList());
            // Unsent alerts are regenerated below from the refreshed dates.
            _db.RenewalAlerts.RemoveRange(contract.RenewalAlerts.Where(a => !a.IsSent).ToList());
        }

        foreach (var c in rec.Contacts ?? new List<ContractImportContact>())
        {
            if (c == null) continue;
            if (string.IsNullOrWhiteSpace(c.Name) && string.IsNullOrWhiteSpace(c.Company) &&
                string.IsNullOrWhiteSpace(c.Email) && string.IsNullOrWhiteSpace(c.Phone) &&
                string.IsNullOrWhiteSpace(c.PortalUrl))
                continue; // nothing to store

            _db.ContractContacts.Add(new ContractContact
            {
                Id = Guid.NewGuid(),
                ContractId = contract.Id,
                Role = c.Role,
                Name = Trunc(c.Name, 200),
                Company = Trunc(c.Company, 300),
                Title = Trunc(c.Title, 200),
                Email = Trunc(c.Email, 320),
                Phone = Trunc(c.Phone, 50),
                PortalUrl = Trunc(c.PortalUrl, 2000),
                SourceRef = Trunc(c.SourceRef, 1000),
            });
        }

        foreach (var o in rec.Obligations ?? new List<ContractImportObligation>())
        {
            if (o == null || string.IsNullOrWhiteSpace(o.Description)) continue;
            _db.ContractObligations.Add(new ContractObligation
            {
                Id = Guid.NewGuid(),
                ContractId = contract.Id,
                Description = Trunc(o.Description.Trim(), 1000)!,
                DueDate = o.DueDate,
                Recurrence = Trunc(o.Recurrence, 200),
                Status = ObligationStatus.Open,
            });
        }

        // Documents are metadata rows only. StoragePath holds the link back to the original in place.
        foreach (var d in rec.Documents ?? new List<ContractImportDocument>())
        {
            if (d == null) continue;
            var fileName = !string.IsNullOrWhiteSpace(d.FileName) ? d.FileName.Trim() : FileNameFromUrl(d.SourceWebUrl);
            if (string.IsNullOrWhiteSpace(fileName)) continue;

            _db.ContractDocuments.Add(new ContractDocument
            {
                Id = Guid.NewGuid(),
                ContractId = contract.Id,
                FileName = Trunc(fileName, MaxFileName)!,
                FileSize = 0, // not known at extraction time
                ContentType = ContentTypeFromFileName(fileName),
                // A link longer than the column is dropped rather than truncated into a broken URL.
                StoragePath = d.SourceWebUrl is { Length: > 0 and <= MaxStoragePath } ? d.SourceWebUrl : string.Empty,
                UploadedById = importedById,
                UploadedAt = DateTime.UtcNow,
            });
        }

        // Tags: add any that are missing; never remove tags a person may have added.
        var tagNames = (rec.Tags ?? new List<string>())
            .Where(t => !string.IsNullOrWhiteSpace(t))
            .Select(t => Trunc(t.Trim(), MaxTag)!)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        foreach (var tagName in tagNames)
        {
            var lower = tagName.ToLower();
            var tag = await _db.Tags.FirstOrDefaultAsync(t => t.Name.ToLower() == lower, ct);
            if (tag == null)
            {
                tag = new Tag { Id = Guid.NewGuid(), Name = tagName };
                _db.Tags.Add(tag);
            }
            else if (!isNew && contract.ContractTags.Any(ct2 => ct2.TagId == tag.Id))
            {
                continue;
            }
            _db.ContractTags.Add(new ContractTag { Id = Guid.NewGuid(), ContractId = contract.Id, TagId = tag.Id });
        }

        // Version history
        var nextVersion = isNew
            ? 1
            : (await _db.ContractVersions.Where(v => v.ContractId == contract.Id).MaxAsync(v => (int?)v.VersionNumber, ct) ?? 0) + 1;
        _db.ContractVersions.Add(new ContractVersion
        {
            Id = Guid.NewGuid(),
            ContractId = contract.Id,
            VersionNumber = nextVersion,
            Summary = isNew ? $"Imported from {system}" : $"Re-imported from {system}",
            ChangedById = importedById,
            ChangedAt = DateTime.UtcNow,
            ChangeNotes = $"Draft import, confidence tier {rec.ConfidenceTier}, needs review: {needsReview}.",
        });

        AddRenewalAlerts(contract);

        await _db.SaveChangesAsync(ct);

        return new ContractImportItemResult
        {
            Index = index,
            SourceItemId = sourceItemId,
            ContractId = contract.Id,
            Outcome = isNew ? ContractImportOutcome.Created : ContractImportOutcome.Updated,
        };
    }

    // ─── Schema v2: helpers ───────────────────────────────────────────

    private sealed class ImportValidationException : Exception
    {
        public ImportValidationException(string message) : base(message) { }
    }

    private static ContractListDto MapListItem(Contract c, DateOnly today) => new()
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
        AgreementCategory = c.AgreementCategory,
        RenewalType = c.RenewalType,
        LatestRenewalDecisionDate = c.LatestRenewalDecisionDate,
        EarliestRenewalDecisionDate = c.EarliestRenewalDecisionDate,
        ConfidenceTier = c.ConfidenceTier,
        NeedsReview = c.NeedsReview,
    };

    private static ContractContact ToContactEntity(Guid contractId, ContractContactDto d) => new()
    {
        Id = Guid.NewGuid(),
        ContractId = contractId,
        Role = d.Role,
        Name = d.Name,
        Company = d.Company,
        Title = d.Title,
        Email = d.Email,
        Phone = d.Phone,
        PortalUrl = d.PortalUrl,
        Notes = d.Notes,
        SourceRef = d.SourceRef,
    };

    private static ContractObligation ToObligationEntity(Guid contractId, ContractObligationDto d) => new()
    {
        Id = Guid.NewGuid(),
        ContractId = contractId,
        Description = d.Description,
        DueDate = d.DueDate,
        Recurrence = d.Recurrence,
        Owner = d.Owner,
        Status = d.Status,
    };

    /// <summary>Maps the new category onto the legacy ContractType kept for compatibility.</summary>
    public static ContractType MapCategoryToContractType(AgreementCategory category) => category switch
    {
        AgreementCategory.SoftwareLicense => ContractType.Software,
        AgreementCategory.SaaSSubscription => ContractType.Subscription,
        AgreementCategory.Lease => ContractType.Lease,
        AgreementCategory.VendorService => ContractType.Service,
        AgreementCategory.MasterServices => ContractType.Service,
        AgreementCategory.StatementOfWork => ContractType.Service,
        AgreementCategory.Maintenance => ContractType.Hardware,
        AgreementCategory.Warranty => ContractType.Hardware,
        AgreementCategory.ProfessionalServices => ContractType.Consulting,
        _ => ContractType.Other,
    };

    /// <summary>
    /// Renewal decision window per schema v2. Latest = end date minus notice period (the end date itself
    /// for ExpireUnlessRenewed). Earliest = latest minus 90 days. Both null without an end date.
    /// </summary>
    public static (DateOnly? Earliest, DateOnly? Latest) ComputeDecisionDates(
        DateOnly? endDate, int? noticePeriodDays, RenewalType? renewalType)
    {
        if (!endDate.HasValue) return (null, null);

        var notice = renewalType == RenewalType.ExpireUnlessRenewed ? 0 : Math.Max(0, noticePeriodDays ?? 0);
        var latest = endDate.Value.AddDays(-notice);
        return (latest.AddDays(-DefaultDecisionWindowDays), latest);
    }

    /// <summary>
    /// Fills decision dates that are still null and can be computed. Stored dates are never overwritten.
    /// Computing needs an end date and a known RenewalType, so legacy records with neither are untouched.
    /// </summary>
    private static void ApplyComputedDecisionDates(Contract contract)
    {
        if (contract.EndDate.HasValue && contract.RenewalType.HasValue)
        {
            var (_, latest) = ComputeDecisionDates(contract.EndDate, contract.NoticePeriodDays, contract.RenewalType);
            contract.LatestRenewalDecisionDate ??= latest;
        }

        // The window opens 90 days before the latest date, whether that date was stated or computed.
        if (contract.LatestRenewalDecisionDate.HasValue)
            contract.EarliestRenewalDecisionDate ??= contract.LatestRenewalDecisionDate.Value.AddDays(-DefaultDecisionWindowDays);
    }

    /// <summary>
    /// Annualized value: RecurringAmount x periods per year, else TotalValue / term in years.
    /// OneTime, Usage and Unknown cannot be annualized from a recurring amount.
    /// </summary>
    public static decimal? AnnualizeValue(
        decimal? recurringAmount, BillingFrequency? frequency, decimal? totalValue, DateOnly startDate, DateOnly? endDate)
    {
        var periods = frequency switch
        {
            BillingFrequency.Monthly => 12,
            BillingFrequency.Quarterly => 4,
            BillingFrequency.SemiAnnual => 2,
            BillingFrequency.Annual => 1,
            _ => 0,
        };
        if (recurringAmount.HasValue && periods > 0)
            return Math.Round(recurringAmount.Value * periods, 2);

        if (totalValue.HasValue && endDate.HasValue && endDate.Value > startDate)
        {
            var years = (decimal)(endDate.Value.DayNumber - startDate.DayNumber) / 365.25m;
            return Math.Round(totalValue.Value / years, 2);
        }
        return null;
    }

    /// <summary>Adds 30/60/90 alerts from the end date plus the two decision date alerts, for future dates only.</summary>
    private void AddRenewalAlerts(Contract contract)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        if (contract.EndDate.HasValue)
        {
            var alertTypes = new[] { (AlertType.NinetyDay, 90), (AlertType.SixtyDay, 60), (AlertType.ThirtyDay, 30) };
            foreach (var (alertType, days) in alertTypes)
            {
                var alertDate = contract.EndDate.Value.AddDays(-days);
                if (alertDate >= today)
                    _db.RenewalAlerts.Add(new RenewalAlert { Id = Guid.NewGuid(), ContractId = contract.Id, AlertDate = alertDate, AlertType = alertType });
            }
        }

        if (contract.LatestRenewalDecisionDate.HasValue && contract.LatestRenewalDecisionDate.Value >= today)
        {
            _db.RenewalAlerts.Add(new RenewalAlert
            {
                Id = Guid.NewGuid(), ContractId = contract.Id,
                AlertDate = contract.LatestRenewalDecisionDate.Value, AlertType = AlertType.DecisionDeadline,
            });
        }

        if (contract.EarliestRenewalDecisionDate.HasValue && contract.EarliestRenewalDecisionDate.Value >= today)
        {
            _db.RenewalAlerts.Add(new RenewalAlert
            {
                Id = Guid.NewGuid(), ContractId = contract.Id,
                AlertDate = contract.EarliestRenewalDecisionDate.Value, AlertType = AlertType.DecisionWindowOpens,
            });
        }
    }

    private static string? SerializeQuestions(IEnumerable<string>? questions)
    {
        var list = questions?.Where(q => !string.IsNullOrWhiteSpace(q)).ToList();
        return list == null || list.Count == 0 ? null : JsonSerializer.Serialize(list);
    }

    private static List<string> DeserializeQuestions(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new List<string>();
        try
        {
            return JsonSerializer.Deserialize<List<string>>(json) ?? new List<string>();
        }
        catch (JsonException)
        {
            return new List<string>();
        }
    }

    private static string? Trunc(string? value, int max) =>
        value == null ? null : value.Length <= max ? value : value[..max];

    /// <summary>Imported rows link out (absolute URL) or carry no path; uploaded files use a relative storage path.</summary>
    private static bool IsImportedDocument(ContractDocument d) =>
        string.IsNullOrEmpty(d.StoragePath) ||
        d.StoragePath.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
        d.StoragePath.StartsWith("https://", StringComparison.OrdinalIgnoreCase);

    private static string? FileNameFromUrl(string? url)
    {
        if (string.IsNullOrWhiteSpace(url)) return null;
        var path = url.Split('?', '#')[0].TrimEnd('/');
        var name = path[(path.LastIndexOf('/') + 1)..];
        return string.IsNullOrWhiteSpace(name) ? null : Uri.UnescapeDataString(name);
    }

    private static string ContentTypeFromFileName(string fileName) =>
        Path.GetExtension(fileName).ToLowerInvariant() switch
        {
            ".pdf" => "application/pdf",
            ".doc" => "application/msword",
            ".docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ".xls" => "application/vnd.ms-excel",
            ".xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ".msg" => "application/vnd.ms-outlook",
            ".eml" => "message/rfc822",
            ".txt" => "text/plain",
            _ => "application/octet-stream",
        };
}
