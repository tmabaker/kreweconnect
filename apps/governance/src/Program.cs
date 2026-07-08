// KREWE Governance — reconstructed backend entry point.
// Database-first against the EXISTING krewe-governance-db: no EnsureCreated, no
// migrations. Connection string comes from ConnectionStrings:KreweGovernance or
// the KREWE_GOVERNANCE_SQL environment variable (value lives in AWS Secrets
// Manager `noit/krewe-governance-sql` — never in this repo).
//
// Auth (NOC-55): Entra JWT bearer on the shared `eaeafccb` app registration,
// multi-tenant (/organizations) — the same model as the consolidated backend.
// KREWE_AUTH_DISABLED=true bypasses auth entirely (local dev + tools/smoke
// only; never set it on a deployed instance).

using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.Identity.Web;
using NOIT.KreweGovernance.Api;
using NOIT.KreweGovernance.Data;
using NOIT.KreweGovernance.Services;

var builder = WebApplication.CreateBuilder(args);

var connectionString =
    builder.Configuration.GetConnectionString("KreweGovernance")
    ?? Environment.GetEnvironmentVariable("KREWE_GOVERNANCE_SQL")
    ?? throw new InvalidOperationException(
        "No database connection configured. Set ConnectionStrings:KreweGovernance or KREWE_GOVERNANCE_SQL " +
        "(value: AWS Secrets Manager noit/krewe-governance-sql).");

builder.Services.AddDbContext<KreweGovernanceDbContext>(options =>
    options.UseSqlServer(connectionString, sql => sql.EnableRetryOnFailure()));
builder.Services.AddScoped<AssemblyService>();
builder.Services.AddScoped<CallerContext>();

var authDisabled = builder.Configuration.GetValue<bool>("KREWE_AUTH_DISABLED");
if (!authDisabled)
{
    builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddMicrosoftIdentityWebApi(builder.Configuration.GetSection("AzureAd"));
    builder.Services.AddAuthorization();
}

var app = builder.Build();

if (authDisabled)
{
    app.Logger.LogWarning(
        "KREWE_AUTH_DISABLED is set — ALL requests run as NOIT staff. Local dev/smoke only.");
    app.Use(async (http, next) =>
    {
        http.RequestServices.GetRequiredService<CallerContext>().IsStaff = true;
        await next(http);
    });
}
else
{
    app.UseAuthentication();
    app.UseAuthorization();
    app.UseMiddleware<CallerResolutionMiddleware>();
}

app.MapKreweGovernance(requireAuth: !authDisabled);

app.Run();
