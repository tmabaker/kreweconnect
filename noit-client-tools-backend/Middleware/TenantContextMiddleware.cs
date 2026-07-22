// RECONSTRUCTED (2026-06-12): referenced by Program.cs (app.UseMiddleware<>)
// but not surfaced by SharePoint search. Reconstructed from ITenantContext and
// the X-Tenant-Id header convention used by the controllers' ResolveTenantId.
//
// SECURITY (2026-07-18): tenant scope is now derived from the VERIFIED token,
// not from the client-supplied X-Tenant-Id header. The header is treated purely
// as a REQUEST to scope, then authorized against the caller's home tenant.

using Microsoft.EntityFrameworkCore;
using NOIT.ClientTools.Core.Interfaces;
using NOIT.ClientTools.Infrastructure.Data;

namespace NOIT.ClientTools.Api.Middleware;

/// <summary>
/// Derives the caller's home tenant from the validated bearer token (`tid`
/// claim) and populates the scoped ITenantContext. X-Tenant-Id is only a
/// request to scope, then authorized:
///   - MSP (NOIT) callers may target any tenant, or "all".
///   - every other caller is confined to their own home tenant: asking for a
///     different tenant is rejected (403); asking for "all"/nothing is silently
///     narrowed to their own tenant (never cross-tenant).
/// </summary>
public class TenantContextMiddleware
{
    private readonly RequestDelegate _next;
    private readonly Guid _mspTenantId;

    public TenantContextMiddleware(RequestDelegate next, IConfiguration config)
    {
        _next = next;
        var raw = config["Tenancy:MspTenantId"]
            ?? Environment.GetEnvironmentVariable("MSP_TENANT_ID")
            ?? "7fb15bf6-9cea-4c72-89bd-1ab9f16eec8e"; // NOIT home tenant
        _mspTenantId = Guid.TryParse(raw, out var g) ? g : Guid.Empty;
    }

    public async Task InvokeAsync(HttpContext context, ITenantContext tenantContext, AppDbContext db)
    {
        var callerTid = GetTokenTenantId(context);
        var isMsp = callerTid.HasValue && _mspTenantId != Guid.Empty && callerTid.Value == _mspTenantId;
        tenantContext.IsMspAdmin = isMsp;

        // Unauthenticated requests (Swagger, anonymous endpoints) get no tenant
        // scope; downstream [Authorize] filters reject protected endpoints.
        if (callerTid is null)
        {
            tenantContext.IsAllTenants = false;
            await _next(context);
            return;
        }

        var headerVal = context.Request.Headers["X-Tenant-Id"].FirstOrDefault();
        var wantsAllOrUnset = string.IsNullOrWhiteSpace(headerVal)
            || headerVal.Equals("all", StringComparison.OrdinalIgnoreCase);

        if (wantsAllOrUnset)
        {
            if (isMsp)
            {
                tenantContext.IsAllTenants = true;
            }
            else
            {
                // Non-MSP callers can never see "all" — pin to their own tenant.
                await ScopeToTenantAsync(tenantContext, db, callerTid.Value);
            }
            await _next(context);
            return;
        }

        // A specific tenant was requested — resolve GUID or DB id.
        Guid? requestedTid = null;
        int? requestedDbId = null;
        if (Guid.TryParse(headerVal, out var guid))
        {
            requestedTid = guid;
            requestedDbId = (await db.ClientTenants.AsNoTracking()
                .FirstOrDefaultAsync(t => t.TenantId == guid))?.Id;
        }
        else if (int.TryParse(headerVal, out var dbId))
        {
            requestedDbId = dbId;
            requestedTid = (await db.ClientTenants.AsNoTracking()
                .FirstOrDefaultAsync(t => t.Id == dbId))?.TenantId;
        }
        else
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            return;
        }

        // Authorize: the caller's own tenant is always allowed; any other tenant
        // requires MSP. This is the isolation gate for every downstream handler.
        var isOwnTenant = requestedTid.HasValue && requestedTid.Value == callerTid.Value;
        if (!isOwnTenant && !isMsp)
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            return;
        }

        tenantContext.IsAllTenants = false;
        tenantContext.TenantId = requestedTid;
        tenantContext.ClientTenantDbId = requestedDbId;
        await _next(context);
    }

    private static async Task ScopeToTenantAsync(ITenantContext ctx, AppDbContext db, Guid tid)
    {
        ctx.IsAllTenants = false;
        ctx.TenantId = tid;
        ctx.ClientTenantDbId = (await db.ClientTenants.AsNoTracking()
            .FirstOrDefaultAsync(t => t.TenantId == tid))?.Id;
    }

    private static Guid? GetTokenTenantId(HttpContext context)
    {
        var tid = context.User.FindFirst("tid")?.Value
            ?? context.User.FindFirst("http://schemas.microsoft.com/identity/claims/tenantid")?.Value;
        return Guid.TryParse(tid, out var g) ? g : (Guid?)null;
    }
}
