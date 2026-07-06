using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using NOIT.ClientTools.Core.DTOs;
using NOIT.ClientTools.Core.Interfaces;
using NOIT.ClientTools.Core.Models;
using NOIT.ClientTools.Infrastructure.Data;

namespace NOIT.ClientTools.Infrastructure.Services;

public class EmployeeSyncService : IEmployeeSyncService
{
    private readonly AppDbContext _db;
    private readonly IGdapService _gdapService;
    private readonly IConfiguration _configuration;
    private readonly ILogger<EmployeeSyncService> _logger;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly bool _useMockData;

    private const string GraphBase = "https://graph.microsoft.com/v1.0";
    private static readonly string UserSelectFields = string.Join(",",
        "id", "displayName", "givenName", "surname", "jobTitle", "department",
        "officeLocation", "mail", "businessPhones", "mobilePhone",
        "userPrincipalName", "accountEnabled", "employeeId");

    public EmployeeSyncService(
        AppDbContext db,
        IGdapService gdapService,
        IConfiguration configuration,
        ILogger<EmployeeSyncService> logger,
        IHttpClientFactory httpClientFactory)
    {
        _db = db;
        _gdapService = gdapService;
        _configuration = configuration;
        _logger = logger;
        _httpClientFactory = httpClientFactory;
        _useMockData = configuration.GetValue<bool>("Gdap:UseMockData", true);
    }

    public async Task<EmployeeSyncResultDto> SyncTenantAsync(int tenantId, CancellationToken ct = default)
    {
        var tenant = await _db.ClientTenants.FindAsync(new object[] { tenantId }, ct);
        if (tenant == null)
            throw new InvalidOperationException($"Tenant with ID {tenantId} not found.");

        _logger.LogInformation("Starting employee sync for tenant {TenantName} ({TenantId})", tenant.DisplayName, tenantId);

        List<MockGraphUser> graphUsers;
        if (_useMockData)
        {
            graphUsers = GetMockGraphUsers(tenant.DisplayName, tenant.TenantId.ToString());
        }
        else
        {
            var token = await _gdapService.AcquireTokenForTenantAsync(
                tenant.TenantId.ToString(),
                new[] { "https://graph.microsoft.com/.default" }, ct);
            graphUsers = await FetchGraphUsersAsync(token, ct);
        }

        var existingEmployees = await _db.Employees
            .Where(e => e.ClientTenantId == tenantId)
            .ToListAsync(ct);

        int created = 0, updated = 0, deactivated = 0;
        var processedEntraIds = new HashSet<string>();

        foreach (var graphUser in graphUsers)
        {
            processedEntraIds.Add(graphUser.EntraObjectId);
            var existing = existingEmployees.FirstOrDefault(e => e.EntraObjectId == graphUser.EntraObjectId);

            if (existing == null)
            {
                _db.Employees.Add(new Employee
                {
                    Id = Guid.NewGuid(),
                    ClientTenantId = tenantId,
                    EntraObjectId = graphUser.EntraObjectId,
                    DisplayName = graphUser.DisplayName,
                    GivenName = graphUser.GivenName,
                    Surname = graphUser.Surname,
                    Email = graphUser.Email,
                    JobTitle = graphUser.JobTitle,
                    Department = graphUser.Department,
                    OfficeLocation = graphUser.OfficeLocation,
                    MobilePhone = graphUser.MobilePhone,
                    BusinessPhone = graphUser.BusinessPhone,
                    EmployeeId = graphUser.EmployeeId,
                    HireDate = graphUser.HireDate,
                    ManagerEntraObjectId = graphUser.ManagerEntraObjectId,
                    Photo = graphUser.Photo,
                    IsActive = true,
                    LastSyncedAt = DateTime.UtcNow,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow,
                });
                created++;
            }
            else
            {
                existing.DisplayName = graphUser.DisplayName;
                existing.GivenName = graphUser.GivenName;
                existing.Surname = graphUser.Surname;
                existing.Email = graphUser.Email;
                existing.JobTitle = graphUser.JobTitle;
                existing.Department = graphUser.Department;
                existing.OfficeLocation = graphUser.OfficeLocation;
                existing.MobilePhone = graphUser.MobilePhone;
                existing.BusinessPhone = graphUser.BusinessPhone;
                existing.EmployeeId = graphUser.EmployeeId;
                existing.HireDate = graphUser.HireDate;
                existing.ManagerEntraObjectId = graphUser.ManagerEntraObjectId;
                existing.Photo = graphUser.Photo;
                existing.IsActive = true;
                existing.LastSyncedAt = DateTime.UtcNow;
                existing.UpdatedAt = DateTime.UtcNow;
                updated++;
            }
        }

        // Mark employees not found in AD as inactive
        foreach (var emp in existingEmployees.Where(e => e.IsActive && !processedEntraIds.Contains(e.EntraObjectId)))
        {
            emp.IsActive = false;
            emp.UpdatedAt = DateTime.UtcNow;
            deactivated++;
        }

        await _db.SaveChangesAsync(ct);

        // Resolve manager references (ManagerEntraObjectId → ManagerId)
        await ResolveManagerReferencesAsync(tenantId, ct);

        tenant.LastSyncedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        _logger.LogInformation("Employee sync complete for {TenantName}: {Created} created, {Updated} updated, {Deactivated} deactivated",
            tenant.DisplayName, created, updated, deactivated);

        return new EmployeeSyncResultDto
        {
            Created = created,
            Updated = updated,
            Deactivated = deactivated,
            TotalProcessed = graphUsers.Count,
        };
    }

    private async Task ResolveManagerReferencesAsync(int tenantId, CancellationToken ct)
    {
        var employees = await _db.Employees
            .Where(e => e.ClientTenantId == tenantId && e.IsActive)
            .ToListAsync(ct);

        var lookup = employees.ToDictionary(e => e.EntraObjectId, e => e.Id);

        foreach (var emp in employees)
        {
            if (!string.IsNullOrEmpty(emp.ManagerEntraObjectId) && lookup.TryGetValue(emp.ManagerEntraObjectId, out var managerId))
            {
                emp.ManagerId = managerId;
            }
            else
            {
                emp.ManagerId = null;
            }
        }

        await _db.SaveChangesAsync(ct);
    }

    // ─── Real Microsoft Graph fetch ──────────────────────────────────────────

    private async Task<List<MockGraphUser>> FetchGraphUsersAsync(string accessToken, CancellationToken ct)
    {
        var http = _httpClientFactory.CreateClient();
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        // Advanced query (filter on accountEnabled + $count) requires eventual consistency.
        http.DefaultRequestHeaders.Add("ConsistencyLevel", "eventual");

        var users = new List<MockGraphUser>();
        var url = $"{GraphBase}/users?$select={UserSelectFields}&$expand=manager($select=id)&$top=999&$filter=accountEnabled eq true&$count=true";

        while (!string.IsNullOrEmpty(url))
        {
            using var resp = await http.GetAsync(url, ct);
            var body = await resp.Content.ReadAsStringAsync(ct);
            if (!resp.IsSuccessStatusCode)
                throw new InvalidOperationException($"Graph /users failed: {(int)resp.StatusCode} {body}");

            var page = JsonSerializer.Deserialize<GraphPage<GraphUser>>(body) ?? new GraphPage<GraphUser>();
            foreach (var u in page.Value)
            {
                users.Add(new MockGraphUser(
                    EntraObjectId: u.Id ?? string.Empty,
                    DisplayName: u.DisplayName ?? u.UserPrincipalName ?? "(unknown)",
                    GivenName: u.GivenName ?? string.Empty,
                    Surname: u.Surname ?? string.Empty,
                    Email: u.Mail ?? u.UserPrincipalName ?? string.Empty,
                    JobTitle: u.JobTitle,
                    Department: u.Department,
                    OfficeLocation: u.OfficeLocation,
                    MobilePhone: u.MobilePhone,
                    BusinessPhone: u.BusinessPhones?.FirstOrDefault(),
                    EmployeeId: u.EmployeeId,
                    HireDate: null, // employeeHireDate needs extra perms; fetch in a later pass
                    ManagerEntraObjectId: u.Manager?.Id,
                    Photo: null));  // photos fetched per-user separately; out of scope here
            }

            url = page.NextLink;
        }

        _logger.LogInformation("Fetched {Count} users from Microsoft Graph", users.Count);
        return users;
    }

    private sealed class GraphPage<T>
    {
        [JsonPropertyName("value")] public List<T> Value { get; set; } = new();
        [JsonPropertyName("@odata.nextLink")] public string? NextLink { get; set; }
    }

    private sealed class GraphUser
    {
        [JsonPropertyName("id")] public string? Id { get; set; }
        [JsonPropertyName("displayName")] public string? DisplayName { get; set; }
        [JsonPropertyName("givenName")] public string? GivenName { get; set; }
        [JsonPropertyName("surname")] public string? Surname { get; set; }
        [JsonPropertyName("jobTitle")] public string? JobTitle { get; set; }
        [JsonPropertyName("department")] public string? Department { get; set; }
        [JsonPropertyName("officeLocation")] public string? OfficeLocation { get; set; }
        [JsonPropertyName("mail")] public string? Mail { get; set; }
        [JsonPropertyName("businessPhones")] public List<string>? BusinessPhones { get; set; }
        [JsonPropertyName("mobilePhone")] public string? MobilePhone { get; set; }
        [JsonPropertyName("userPrincipalName")] public string? UserPrincipalName { get; set; }
        [JsonPropertyName("employeeId")] public string? EmployeeId { get; set; }
        [JsonPropertyName("manager")] public GraphManager? Manager { get; set; }
    }

    private sealed class GraphManager
    {
        [JsonPropertyName("id")] public string? Id { get; set; }
    }

    // ─── Mock data ───────────────────────────────────────────────────────────

    private record MockGraphUser(
        string EntraObjectId, string DisplayName, string GivenName, string Surname,
        string Email, string? JobTitle, string? Department, string? OfficeLocation,
        string? MobilePhone, string? BusinessPhone, string? EmployeeId, DateOnly? HireDate,
        string? ManagerEntraObjectId, string? Photo);

    private static List<MockGraphUser> GetMockGraphUsers(string tenantName, string tenantGuid)
    {
        // Generate a deterministic set per tenant using the name as a seed
        return tenantName switch
        {
            "Bayou Automotive" => BayouAutomotiveEmployees(),
            "Fishman Haygood" => FishmanHaygoodEmployees(),
            "Irby Investments" => IrbyInvestmentsEmployees(),
            _ => GenericEmployees(tenantName, tenantGuid),
        };
    }

    private static List<MockGraphUser> BayouAutomotiveEmployees() => new()
    {
        new("ba-001", "Mike Johnson", "Mike", "Johnson", "mike.johnson@bayouautomotive.com", "General Manager", "Executive", "Main Office", "985-555-0101", "985-555-0001", "EMP-001", new DateOnly(2010, 3, 15), null, null),
        new("ba-002", "John Smith", "John", "Smith", "john.smith@bayouautomotive.com", "Service Manager", "Service", "Service Center", "985-555-0102", "985-555-0002", "EMP-002", new DateOnly(2015, 6, 1), "ba-001", null),
        new("ba-003", "Sarah Williams", "Sarah", "Williams", "sarah.williams@bayouautomotive.com", "Service Advisor", "Service", "Service Center", "985-555-0103", null, "EMP-003", new DateOnly(2019, 1, 10), "ba-002", null),
        new("ba-004", "David Brown", "David", "Brown", "david.brown@bayouautomotive.com", "Lead Technician", "Service", "Service Center", "985-555-0104", null, "EMP-004", new DateOnly(2017, 8, 22), "ba-002", null),
        new("ba-005", "Lisa Garcia", "Lisa", "Garcia", "lisa.garcia@bayouautomotive.com", "Sales Director", "Sales", "Showroom", "985-555-0105", "985-555-0005", "EMP-005", new DateOnly(2013, 4, 7), "ba-001", null),
        new("ba-006", "Robert Martinez", "Robert", "Martinez", "robert.martinez@bayouautomotive.com", "Sales Consultant", "Sales", "Showroom", "985-555-0106", null, "EMP-006", new DateOnly(2020, 2, 14), "ba-005", null),
        new("ba-007", "Jennifer Lee", "Jennifer", "Lee", "jennifer.lee@bayouautomotive.com", "Finance Manager", "Finance", "Main Office", "985-555-0107", "985-555-0007", "EMP-007", new DateOnly(2016, 11, 3), "ba-001", null),
        new("ba-008", "Marcus Taylor", "Marcus", "Taylor", "marcus.taylor@bayouautomotive.com", "Parts Manager", "Parts", "Parts Dept", "985-555-0108", "985-555-0008", "EMP-008", new DateOnly(2018, 5, 20), "ba-001", null),
        new("ba-009", "Amanda Wilson", "Amanda", "Wilson", "amanda.wilson@bayouautomotive.com", "Receptionist", "Admin", "Main Office", "985-555-0109", null, "EMP-009", new DateOnly(2021, 9, 1), "ba-007", null),
        new("ba-010", "Chris Anderson", "Chris", "Anderson", "chris.anderson@bayouautomotive.com", "Detailing Specialist", "Service", "Detail Shop", "985-555-0110", null, "EMP-010", new DateOnly(2022, 3, 28), "ba-002", null),
        new("ba-011", "Patricia Nguyen", "Patricia", "Nguyen", "patricia.nguyen@bayouautomotive.com", "IT Coordinator", "IT", "Main Office", "985-555-0111", null, "EMP-011", new DateOnly(2023, 1, 15), "ba-001", null),
        new("ba-012", "James Thomas", "James", "Thomas", "james.thomas@bayouautomotive.com", "Body Shop Manager", "Body Shop", "Body Shop", "985-555-0112", "985-555-0012", "EMP-012", new DateOnly(2014, 7, 8), "ba-001", null),
    };

    private static List<MockGraphUser> FishmanHaygoodEmployees() => new()
    {
        new("fh-001", "Katherine Fishman", "Katherine", "Fishman", "kfishman@fishmanhaygood.com", "Managing Partner", "Leadership", "Main Office", "504-555-0201", "504-555-0001", "ATT-001", new DateOnly(2005, 1, 10), null, null),
        new("fh-002", "Richard Haygood", "Richard", "Haygood", "rhaygood@fishmanhaygood.com", "Senior Partner", "Leadership", "Main Office", "504-555-0202", "504-555-0002", "ATT-002", new DateOnly(2005, 1, 10), null, null),
        new("fh-003", "Elena Vasquez", "Elena", "Vasquez", "evasquez@fishmanhaygood.com", "Associate Attorney", "Litigation", "Main Office", "504-555-0203", null, "ATT-003", new DateOnly(2018, 9, 1), "fh-001", null),
        new("fh-004", "Michael Chen", "Michael", "Chen", "mchen@fishmanhaygood.com", "Associate Attorney", "Corporate", "Main Office", "504-555-0204", null, "ATT-004", new DateOnly(2019, 6, 15), "fh-002", null),
        new("fh-005", "Sandra Phillips", "Sandra", "Phillips", "sphillips@fishmanhaygood.com", "Legal Secretary", "Admin", "Main Office", "504-555-0205", null, "STF-001", new DateOnly(2012, 3, 20), "fh-001", null),
        new("fh-006", "Thomas Washington", "Thomas", "Washington", "twashington@fishmanhaygood.com", "Paralegal", "Litigation", "Main Office", "504-555-0206", null, "STF-002", new DateOnly(2020, 1, 6), "fh-003", null),
        new("fh-007", "Rachel Kim", "Rachel", "Kim", "rkim@fishmanhaygood.com", "Junior Associate", "Corporate", "Main Office", "504-555-0207", null, "ATT-005", new DateOnly(2023, 8, 14), "fh-004", null),
        new("fh-008", "Derek Robinson", "Derek", "Robinson", "drobinson@fishmanhaygood.com", "Office Manager", "Admin", "Main Office", "504-555-0208", "504-555-0008", "STF-003", new DateOnly(2015, 5, 1), "fh-001", null),
        new("fh-009", "Angela Foster", "Angela", "Foster", "afoster@fishmanhaygood.com", "Senior Paralegal", "Litigation", "Main Office", "504-555-0209", null, "STF-004", new DateOnly(2011, 10, 22), "fh-001", null),
        new("fh-010", "Brandon Scott", "Brandon", "Scott", "bscott@fishmanhaygood.com", "IT Administrator", "IT", "Main Office", "504-555-0210", null, "STF-005", new DateOnly(2021, 4, 3), "fh-008", null),
        new("fh-011", "Monica Price", "Monica", "Price", "mprice@fishmanhaygood.com", "Associate Attorney", "Real Estate", "Main Office", "504-555-0211", null, "ATT-006", new DateOnly(2022, 2, 28), "fh-002", null),
        new("fh-012", "Nathan Hughes", "Nathan", "Hughes", "nhughes@fishmanhaygood.com", "Billing Coordinator", "Finance", "Main Office", "504-555-0212", null, "STF-006", new DateOnly(2020, 7, 13), "fh-008", null),
        new("fh-013", "Diana Russell", "Diana", "Russell", "drussell@fishmanhaygood.com", "Receptionist", "Admin", "Main Office", "504-555-0213", null, "STF-007", new DateOnly(2024, 1, 8), "fh-008", null),
        new("fh-014", "Victor Morales", "Victor", "Morales", "vmorales@fishmanhaygood.com", "Associate Attorney", "Litigation", "Main Office", "504-555-0214", null, "ATT-007", new DateOnly(2021, 9, 15), "fh-001", null),
        new("fh-015", "Laura Bennett", "Laura", "Bennett", "lbennett@fishmanhaygood.com", "Law Clerk", "Corporate", "Main Office", "504-555-0215", null, "STF-008", new DateOnly(2025, 6, 1), "fh-004", null),
    };

    private static List<MockGraphUser> IrbyInvestmentsEmployees() => new()
    {
        new("ii-001", "Charles Irby", "Charles", "Irby", "cirby@irbyinvestments.com", "Managing Director", "Executive", "Downtown Office", "504-555-0301", "504-555-0100", "INV-001", new DateOnly(2008, 6, 1), null, null),
        new("ii-002", "Stephanie Parker", "Stephanie", "Parker", "sparker@irbyinvestments.com", "VP of Operations", "Operations", "Downtown Office", "504-555-0302", "504-555-0101", "INV-002", new DateOnly(2012, 2, 15), "ii-001", null),
        new("ii-003", "William Turner", "William", "Turner", "wturner@irbyinvestments.com", "Portfolio Manager", "Investments", "Downtown Office", "504-555-0303", null, "INV-003", new DateOnly(2015, 9, 10), "ii-001", null),
        new("ii-004", "Nicole Adams", "Nicole", "Adams", "nadams@irbyinvestments.com", "Financial Analyst", "Investments", "Downtown Office", "504-555-0304", null, "INV-004", new DateOnly(2019, 4, 22), "ii-003", null),
        new("ii-005", "Gregory Hall", "Gregory", "Hall", "ghall@irbyinvestments.com", "Property Manager", "Real Estate", "Field Office", "504-555-0305", null, "INV-005", new DateOnly(2017, 11, 5), "ii-002", null),
        new("ii-006", "Megan Cooper", "Megan", "Cooper", "mcooper@irbyinvestments.com", "Accounting Manager", "Finance", "Downtown Office", "504-555-0306", "504-555-0106", "INV-006", new DateOnly(2014, 7, 1), "ii-002", null),
        new("ii-007", "Daniel Wright", "Daniel", "Wright", "dwright@irbyinvestments.com", "Leasing Agent", "Real Estate", "Field Office", "504-555-0307", null, "INV-007", new DateOnly(2021, 3, 15), "ii-005", null),
        new("ii-008", "Ashley Campbell", "Ashley", "Campbell", "acampbell@irbyinvestments.com", "Executive Assistant", "Executive", "Downtown Office", "504-555-0308", null, "INV-008", new DateOnly(2020, 8, 18), "ii-001", null),
        new("ii-009", "Kevin Mitchell", "Kevin", "Mitchell", "kmitchell@irbyinvestments.com", "Junior Analyst", "Investments", "Downtown Office", "504-555-0309", null, "INV-009", new DateOnly(2024, 6, 3), "ii-003", null),
        new("ii-010", "Christina Rivera", "Christina", "Rivera", "crivera@irbyinvestments.com", "HR Coordinator", "HR", "Downtown Office", "504-555-0310", null, "INV-010", new DateOnly(2022, 1, 10), "ii-002", null),
        new("ii-011", "Jason Brooks", "Jason", "Brooks", "jbrooks@irbyinvestments.com", "Maintenance Supervisor", "Facilities", "Field Office", "504-555-0311", null, "INV-011", new DateOnly(2016, 5, 20), "ii-005", null),
    };

    private static List<MockGraphUser> GenericEmployees(string tenantName, string tenantGuid)
    {
        var prefix = tenantName.Replace(" ", "").ToLower()[..Math.Min(3, tenantName.Length)];
        var domain = tenantName.Replace(" ", "").ToLower() + ".com";
        return new List<MockGraphUser>
        {
            new($"{prefix}-001", $"Alex Morgan", "Alex", "Morgan", $"amorgan@{domain}", "Director", "Executive", "Main Office", "555-0001", null, "E001", new DateOnly(2012, 1, 15), null, null),
            new($"{prefix}-002", $"Jordan Casey", "Jordan", "Casey", $"jcasey@{domain}", "Operations Manager", "Operations", "Main Office", "555-0002", null, "E002", new DateOnly(2016, 5, 20), $"{prefix}-001", null),
            new($"{prefix}-003", $"Taylor Reed", "Taylor", "Reed", $"treed@{domain}", "Analyst", "Operations", "Main Office", "555-0003", null, "E003", new DateOnly(2020, 3, 10), $"{prefix}-002", null),
            new($"{prefix}-004", $"Cameron Blake", "Cameron", "Blake", $"cblake@{domain}", "Office Manager", "Admin", "Main Office", "555-0004", null, "E004", new DateOnly(2018, 9, 5), $"{prefix}-001", null),
            new($"{prefix}-005", $"Riley Foster", "Riley", "Foster", $"rfoster@{domain}", "IT Support", "IT", "Main Office", "555-0005", null, "E005", new DateOnly(2022, 7, 1), $"{prefix}-002", null),
            new($"{prefix}-006", $"Avery Brooks", "Avery", "Brooks", $"abrooks@{domain}", "Accountant", "Finance", "Main Office", "555-0006", null, "E006", new DateOnly(2019, 11, 15), $"{prefix}-001", null),
            new($"{prefix}-007", $"Morgan Davis", "Morgan", "Davis", $"mdavis@{domain}", "Receptionist", "Admin", "Main Office", "555-0007", null, "E007", new DateOnly(2023, 4, 22), $"{prefix}-004", null),
            new($"{prefix}-008", $"Quinn Parker", "Quinn", "Parker", $"qparker@{domain}", "Sales Rep", "Sales", "Main Office", "555-0008", null, "E008", new DateOnly(2021, 8, 30), $"{prefix}-001", null),
            new($"{prefix}-009", $"Harper Ellis", "Harper", "Ellis", $"hellis@{domain}", "Marketing Coordinator", "Marketing", "Main Office", "555-0009", null, "E009", new DateOnly(2024, 2, 1), $"{prefix}-002", null),
            new($"{prefix}-010", $"Skyler James", "Skyler", "James", $"sjames@{domain}", "Junior Analyst", "Operations", "Main Office", "555-0010", null, "E010", new DateOnly(2025, 1, 13), $"{prefix}-003", null),
        };
    }
}
