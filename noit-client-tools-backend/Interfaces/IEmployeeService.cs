using NOIT.ClientTools.Core.DTOs;

namespace NOIT.ClientTools.Core.Interfaces;

public interface IEmployeeService
{
    Task<PagedResult<EmployeeListDto>> GetAllAsync(
        int? tenantId,
        string? search,
        string? department,
        string? officeLocation,
        string? jobTitle,
        string sortBy,
        string sortDir,
        int page,
        int pageSize,
        CancellationToken ct = default);

    Task<EmployeeDetailDto?> GetByIdAsync(Guid id, CancellationToken ct = default);

    Task<PagedResult<EmployeeListDto>> SearchAsync(string query, int? tenantId, int page, int pageSize, CancellationToken ct = default);

    Task<OrgChartNodeDto?> GetOrgChartAsync(int tenantId, Guid? rootEmployeeId = null, CancellationToken ct = default);

    Task<List<CustomFieldValueDto>> GetCustomFieldsAsync(Guid employeeId, CancellationToken ct = default);

    Task SetCustomFieldsAsync(Guid employeeId, List<CustomFieldUpdateItem> fields, CancellationToken ct = default);
}
