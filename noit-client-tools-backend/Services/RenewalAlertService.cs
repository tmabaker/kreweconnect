using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using NOIT.ClientTools.Core.DTOs;
using NOIT.ClientTools.Core.Enums;
using NOIT.ClientTools.Core.Interfaces;
using NOIT.ClientTools.Core.Models;
using NOIT.ClientTools.Infrastructure.Data;

namespace NOIT.ClientTools.Infrastructure.Services;

public class RenewalAlertService : IRenewalAlertService
{
    private readonly AppDbContext _db;
    private readonly ILogger<RenewalAlertService> _logger;

    public RenewalAlertService(AppDbContext db, ILogger<RenewalAlertService> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async Task<List<RenewalAlertDto>> GetUpcomingRenewalsAsync(int? tenantId, int daysAhead = 90, CancellationToken ct = default)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var cutoff = today.AddDays(daysAhead);

        var query = _db.Contracts
            .Include(c => c.Tenant)
            .Where(c => !c.IsArchived && c.EndDate.HasValue && c.EndDate.Value <= cutoff && c.EndDate.Value >= today)
            .AsNoTracking();

        if (tenantId.HasValue)
            query = query.Where(c => c.TenantId == tenantId.Value);

        var contracts = await query.OrderBy(c => c.EndDate).ToListAsync(ct);

        return contracts.Select(c => new RenewalAlertDto
        {
            Id = Guid.NewGuid(),
            ContractId = c.Id,
            ContractTitle = c.Title,
            VendorName = c.VendorName,
            TenantDisplayName = c.Tenant.DisplayName,
            AlertDate = today,
            ContractEndDate = c.EndDate,
            AlertType = (c.EndDate!.Value.DayNumber - today.DayNumber) switch
            {
                <= 30 => AlertType.ThirtyDay,
                <= 60 => AlertType.SixtyDay,
                _ => AlertType.NinetyDay,
            },
            IsSent = false,
            DaysRemaining = c.EndDate.Value.DayNumber - today.DayNumber,
        }).ToList();
    }

    public async Task<RenewalAlertDto> CreateAlertAsync(Guid contractId, DateOnly alertDate, AlertType alertType, CancellationToken ct = default)
    {
        var contract = await _db.Contracts.Include(c => c.Tenant).FirstOrDefaultAsync(c => c.Id == contractId, ct)
            ?? throw new InvalidOperationException("Contract not found");

        var alert = new RenewalAlert
        {
            Id = Guid.NewGuid(),
            ContractId = contractId,
            AlertDate = alertDate,
            AlertType = alertType,
        };

        _db.RenewalAlerts.Add(alert);
        await _db.SaveChangesAsync(ct);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        return new RenewalAlertDto
        {
            Id = alert.Id,
            ContractId = alert.ContractId,
            ContractTitle = contract.Title,
            VendorName = contract.VendorName,
            TenantDisplayName = contract.Tenant.DisplayName,
            AlertDate = alert.AlertDate,
            ContractEndDate = contract.EndDate,
            AlertType = alert.AlertType,
            IsSent = alert.IsSent,
            DaysRemaining = contract.EndDate.HasValue ? (contract.EndDate.Value.DayNumber - today.DayNumber) : null,
        };
    }

    public async Task<bool> DismissAlertAsync(Guid alertId, CancellationToken ct = default)
    {
        var alert = await _db.RenewalAlerts.FirstOrDefaultAsync(a => a.Id == alertId, ct);
        if (alert == null) return false;

        alert.IsSent = true;
        alert.SentAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        return true;
    }
}
