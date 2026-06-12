using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using NOIT.ClientTools.Core.DTOs;
using NOIT.ClientTools.Core.Interfaces;
using NOIT.ClientTools.Core.Models;
using NOIT.ClientTools.Infrastructure.Data;

namespace NOIT.ClientTools.Infrastructure.Services;

public class EmployeeService : IEmployeeService
{
    private readonly AppDbContext _db;
    private readonly ILogger<EmployeeService> _logger;

    public EmployeeService(AppDbContext db, ILogger<EmployeeService> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async Task<PagedResult<EmployeeListDto>> GetAllAsync(
        int? tenantId,
        string? search,
        string? department,
        string? officeLocation,
        string? jobTitle,
        string sortBy,
        string sortDir,
        int page,
        int pageSize,
        CancellationToken ct = default)
    {
        var query = _db.Employees
            .Include(e => e.ClientTenant)
            .Where(e => e.IsActive)
            .AsNoTracking();

        if (tenantId.HasValue)
            query = query.Where(e => e.ClientTenantId == tenantId.Value);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.ToLower();
            query = query.Where(e =>
                e.DisplayName.ToLower().Contains(s) ||
                (e.Email != null && e.Email.ToLower().Contains(s)) ||
                (e.Department != null && e.Department.ToLower().Contains(s)) ||
                (e.JobTitle != null && e.JobTitle.ToLower().Contains(s)));
        }

        if (!string.IsNullOrWhiteSpace(department))
            query = query.Where(e => e.Department == department);

        if (!string.IsNullOrWhiteSpace(officeLocation))
            query = query.Where(e => e.OfficeLocation == officeLocation);

        if (!string.IsNullOrWhiteSpace(jobTitle))
            query = query.Where(e => e.JobTitle == jobTitle);

        var totalItems = await query.CountAsync(ct);

        // Sorting
        query = (sortBy?.ToLower(), sortDir?.ToLower()) switch
        {
            ("department", "desc") => query.OrderByDescending(e => e.Department).ThenBy(e => e.DisplayName),
            ("department", _) => query.OrderBy(e => e.Department).ThenBy(e => e.DisplayName),
            ("createdat", "desc") => query.OrderByDescending(e => e.CreatedAt),
            ("createdat", _) => query.OrderBy(e => e.CreatedAt),
            ("email", "desc") => query.OrderByDescending(e => e.Email),
            ("email", _) => query.OrderBy(e => e.Email),
            (_, "desc") => query.OrderByDescending(e => e.DisplayName),
            _ => query.OrderBy(e => e.DisplayName),
        };

        var employees = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(e => new EmployeeListDto
            {
                Id = e.Id,
                DisplayName = e.DisplayName,
                GivenName = e.GivenName,
                Surname = e.Surname,
                Email = e.Email,
                JobTitle = e.JobTitle,
                Department = e.Department,
                OfficeLocation = e.OfficeLocation,
                MobilePhone = e.MobilePhone,
                BusinessPhone = e.BusinessPhone,
                Photo = e.Photo,
                IsActive = e.IsActive,
                TenantDisplayName = e.ClientTenant.DisplayName,
            })
            .ToListAsync(ct);

        return new PagedResult<EmployeeListDto>
        {
            Data = employees,
            Pagination = new PaginationInfo { Page = page, PageSize = pageSize, TotalItems = totalItems },
        };
    }

    public async Task<EmployeeDetailDto?> GetByIdAsync(Guid id, CancellationToken ct = default)
    {
        var emp = await _db.Employees
            .Include(e => e.ClientTenant)
            .Include(e => e.Manager)
            .Include(e => e.DirectReports)
            .Include(e => e.CustomFields)
            .AsNoTracking()
            .FirstOrDefaultAsync(e => e.Id == id, ct);

        if (emp == null) return null;

        return new EmployeeDetailDto
        {
            Id = emp.Id,
            DisplayName = emp.DisplayName,
            GivenName = emp.GivenName,
            Surname = emp.Surname,
            Email = emp.Email,
            JobTitle = emp.JobTitle,
            Department = emp.Department,
            OfficeLocation = emp.OfficeLocation,
            MobilePhone = emp.MobilePhone,
            BusinessPhone = emp.BusinessPhone,
            EmployeeId = emp.EmployeeId,
            HireDate = emp.HireDate,
            Photo = emp.Photo,
            IsActive = emp.IsActive,
            LastSyncedAt = emp.LastSyncedAt,
            TenantDisplayName = emp.ClientTenant.DisplayName,
            Manager = emp.Manager != null ? new EmployeeRefDto
            {
                Id = emp.Manager.Id,
                DisplayName = emp.Manager.DisplayName,
                JobTitle = emp.Manager.JobTitle,
                Photo = emp.Manager.Photo,
            } : null,
            DirectReports = emp.DirectReports.Where(dr => dr.IsActive).Select(dr => new EmployeeRefDto
            {
                Id = dr.Id,
                DisplayName = dr.DisplayName,
                JobTitle = dr.JobTitle,
                Photo = dr.Photo,
            }).ToList(),
            CustomFields = emp.CustomFields.Select(cf => new CustomFieldValueDto
            {
                Id = cf.Id,
                FieldName = cf.FieldName,
                FieldValue = cf.FieldValue,
                FieldType = cf.FieldType,
            }).ToList(),
        };
    }

    public async Task<PagedResult<EmployeeListDto>> SearchAsync(string query, int? tenantId, int page, int pageSize, CancellationToken ct = default)
    {
        return await GetAllAsync(tenantId, query, null, null, null, "displayName", "asc", page, pageSize, ct);
    }

    public async Task<OrgChartNodeDto?> GetOrgChartAsync(int tenantId, Guid? rootEmployeeId = null, CancellationToken ct = default)
    {
        var employees = await _db.Employees
            .Where(e => e.ClientTenantId == tenantId && e.IsActive)
            .AsNoTracking()
            .ToListAsync(ct);

        if (!employees.Any()) return null;

        // Find the root: either specified or whoever has no manager
        Employee? root;
        if (rootEmployeeId.HasValue)
        {
            root = employees.FirstOrDefault(e => e.Id == rootEmployeeId.Value);
        }
        else
        {
            root = employees.FirstOrDefault(e => e.ManagerId == null);
        }

        if (root == null) return null;

        var lookup = employees.ToLookup(e => e.ManagerId);

        return BuildOrgNode(root, lookup);
    }

    private static OrgChartNodeDto BuildOrgNode(Employee emp, ILookup<Guid?, Employee> lookup)
    {
        return new OrgChartNodeDto
        {
            Id = emp.Id,
            DisplayName = emp.DisplayName,
            JobTitle = emp.JobTitle,
            Department = emp.Department,
            Photo = emp.Photo,
            DirectReports = lookup[emp.Id]
                .OrderBy(e => e.DisplayName)
                .Select(child => BuildOrgNode(child, lookup))
                .ToList(),
        };
    }

    public async Task<List<CustomFieldValueDto>> GetCustomFieldsAsync(Guid employeeId, CancellationToken ct = default)
    {
        return await _db.EmployeeCustomFields
            .Where(f => f.EmployeeId == employeeId)
            .OrderBy(f => f.FieldName)
            .Select(f => new CustomFieldValueDto
            {
                Id = f.Id,
                FieldName = f.FieldName,
                FieldValue = f.FieldValue,
                FieldType = f.FieldType,
            })
            .AsNoTracking()
            .ToListAsync(ct);
    }

    public async Task SetCustomFieldsAsync(Guid employeeId, List<CustomFieldUpdateItem> fields, CancellationToken ct = default)
    {
        var existing = await _db.EmployeeCustomFields
            .Where(f => f.EmployeeId == employeeId)
            .ToListAsync(ct);

        foreach (var field in fields)
        {
            var current = existing.FirstOrDefault(f => f.FieldName == field.FieldName);
            if (current != null)
            {
                current.FieldValue = field.FieldValue;
                current.FieldType = field.FieldType;
                current.UpdatedAt = DateTime.UtcNow;
            }
            else
            {
                _db.EmployeeCustomFields.Add(new EmployeeCustomField
                {
                    Id = Guid.NewGuid(),
                    EmployeeId = employeeId,
                    FieldName = field.FieldName,
                    FieldValue = field.FieldValue,
                    FieldType = field.FieldType,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow,
                });
            }
        }

        await _db.SaveChangesAsync(ct);
    }
}
