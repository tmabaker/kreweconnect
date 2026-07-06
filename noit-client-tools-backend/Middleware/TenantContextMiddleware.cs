// RECONSTRUCTED (2026-06-12): referenced by Program.cs (app.UseMiddleware<>)
// but not surfaced by SharePoint search. Reconstructed from ITenantContext and
// the X-Tenant-Id header convention used by the controllers' ResolveTenantId.

using Microsoft.EntityFrameworkCore;
using NOIT.ClientTools.Core.Interfaces;
using NOIT.ClientTools.Infrastructure.Data;

namespace NOIT.ClientTools.Api.Middleware;

/// <summary>
/// Reads the X-Tenant-Id header and populates the scoped ITenantContext for
/// the request. "all" (or absent) means cross-tenant. A GUID is resolved to the
/// local ClientTenant DB id; a bare int is treated as the DB id directly.
/// </summary>
public class TenantContextMiddleware
{
    private readonly RequestDelegate _next;

    public TenantContextMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context, ITenantContext tenantContext, AppDbContext db)
    {
        var headerVal = context.Request.Headers["X-Tenant-Id"].FirstOrDefault();

        if (string.IsNullOrWhiteSpace(headerVal) || headerVal.Equals("all", StringComparison.OrdinalIgnoreCase))
        {
            tenantContext.IsAllTenants = true;
        }
        else if (Guid.TryParse(headerVal, out var guid))
        {
            tenantContext.TenantId = guid;
            var tenant = await db.ClientTenants.AsNoTracking().FirstOrDefaultAsync(t => t.TenantId == guid);
            tenantContext.ClientTenantDbId = tenant?.Id;
        }
        else if (int.TryParse(headerVal, out var dbId))
        {
            tenantContext.ClientTenantDbId = dbId;
            var tenant = await db.ClientTenants.AsNoTracking().FirstOrDefaultAsync(t => t.Id == dbId);
            tenantContext.TenantId = tenant?.TenantId;
        }

        await _next(context);
    }
}
