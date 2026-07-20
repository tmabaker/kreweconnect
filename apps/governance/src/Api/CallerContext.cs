// Caller identity + tenant scoping for KREWE Governance (NOC-55).
//
// The recovered schema has no tenant column on ClientCompanies, so scoping is:
//   - NOIT staff  = token `tid` equals the NOIT (MSP) tenant → full access.
//   - Client user = Users row matched on token `oid` (EntraObjectId) → scoped
//     to that row's ClientCompanyId; no active row → 403.
// Writes (library management) are staff-only.

using Microsoft.EntityFrameworkCore;
using NOIT.KreweGovernance.Data;

namespace NOIT.KreweGovernance.Api;

public class CallerContext
{
    public bool IsStaff { get; set; }
    public Guid? ClientCompanyId { get; set; }
    public string? ObjectId { get; set; }

    public bool CanAccessClient(Guid clientCompanyId) =>
        IsStaff || ClientCompanyId == clientCompanyId;
}

/// <summary>Populates the scoped CallerContext from the validated JWT.</summary>
public class CallerResolutionMiddleware(RequestDelegate next, IConfiguration config)
{
    private const string TidClaim = "http://schemas.microsoft.com/identity/claims/tenantid";
    private const string OidClaim = "http://schemas.microsoft.com/identity/claims/objectidentifier";

    private readonly string _mspTenantId =
        config["MspTenantId"] ?? "7fb15bf6-9cea-4c72-89bd-1ab9f16eec8e";

    public async Task InvokeAsync(HttpContext http, CallerContext caller, KreweGovernanceDbContext db)
    {
        var user = http.User;
        if (user.Identity?.IsAuthenticated == true)
        {
            var tid = user.FindFirst(TidClaim)?.Value ?? user.FindFirst("tid")?.Value;
            var oid = user.FindFirst(OidClaim)?.Value ?? user.FindFirst("oid")?.Value;
            caller.ObjectId = oid;

            if (string.Equals(tid, _mspTenantId, StringComparison.OrdinalIgnoreCase))
            {
                caller.IsStaff = true;
            }
            else if (oid is not null)
            {
                var row = await db.Users.AsNoTracking()
                    .FirstOrDefaultAsync(u => u.EntraObjectId == oid && u.IsActive);
                if (row is null)
                {
                    http.Response.StatusCode = StatusCodes.Status403Forbidden;
                    await http.Response.WriteAsJsonAsync(new
                    {
                        error = "not_provisioned",
                        message = "No active KREWE Governance user is mapped to this account.",
                    });
                    return;
                }
                caller.ClientCompanyId = row.ClientCompanyId;
                // A client-tenant user whose row has no company is treated as staff
                // only if their row says so; otherwise they can access nothing.
                caller.IsStaff = row.ClientCompanyId is null;
            }
        }

        await next(http);
    }
}
