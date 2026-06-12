using NOIT.ClientTools.Core.DTOs;

namespace NOIT.ClientTools.Core.Interfaces;

public interface IRenewalAlertService
{
    Task<List<RenewalAlertDto>> GetUpcomingRenewalsAsync(int? tenantId, int daysAhead = 90, CancellationToken ct = default);
    Task<RenewalAlertDto> CreateAlertAsync(Guid contractId, DateOnly alertDate, Enums.AlertType alertType, CancellationToken ct = default);
    Task<bool> DismissAlertAsync(Guid alertId, CancellationToken ct = default);
}
