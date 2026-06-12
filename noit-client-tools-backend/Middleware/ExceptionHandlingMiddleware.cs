// Added 2026-06-12: surfaces TenantNotAuthorizedException as an actionable
// consent prompt for the SPA (mirrors the KreweConnect Functions API's
// "consent_required" response), and maps unhandled errors to a clean 500.

using System.Text.Json;
using NOIT.ClientTools.Infrastructure.Services;

namespace NOIT.ClientTools.Api.Middleware;

public class ExceptionHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _logger;

    public ExceptionHandlingMiddleware(RequestDelegate next, ILogger<ExceptionHandlingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (TenantNotAuthorizedException ex)
        {
            // The customer tenant hasn't granted admin consent — hand the SPA
            // the consent URL so an administrator can authorize the tenant.
            _logger.LogWarning(ex, "Tenant not authorized");
            await WriteError(context, StatusCodes.Status401Unauthorized, new
            {
                code = "consent_required",
                message = ex.Message,
                consentUrl = ex.ConsentUrl,
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled exception");
            await WriteError(context, StatusCodes.Status500InternalServerError, new
            {
                code = "internal_error",
                message = "An unexpected error occurred.",
            });
        }
    }

    private static async Task WriteError(HttpContext context, int status, object body)
    {
        if (context.Response.HasStarted) return;
        context.Response.Clear();
        context.Response.StatusCode = status;
        context.Response.ContentType = "application/json";
        await context.Response.WriteAsync(JsonSerializer.Serialize(new { error = body }));
    }
}
