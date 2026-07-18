// KREWE Governance — reconstructed backend entry point.
// Database-first against the EXISTING krewe-governance-db: no EnsureCreated, no
// migrations. Connection string comes from ConnectionStrings:KreweGovernance or
// the KREWE_GOVERNANCE_SQL environment variable (value lives in AWS Secrets
// Manager `noit/krewe-governance-sql` — never in this repo).

using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
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

// --- Authentication / authorization ---
// This API exposes client governance data and must NEVER run unauthenticated.
// Tokens are Entra (Azure AD) v2 access tokens. Authority defaults to the NOIT
// home tenant; audience (this API's App ID URI / client ID) has no safe default
// and is a hard startup requirement — the app fails fast if it is not set, so a
// misconfigured deploy cannot come up accepting unvalidated tokens.
var authAuthority =
    builder.Configuration["Governance:Auth:Authority"]
    ?? Environment.GetEnvironmentVariable("KREWE_GOVERNANCE_AUTHORITY")
    ?? "https://login.microsoftonline.com/7fb15bf6-9cea-4c72-89bd-1ab9f16eec8e/v2.0"; // NOIT tenant

var authAudience =
    builder.Configuration["Governance:Auth:Audience"]
    ?? Environment.GetEnvironmentVariable("KREWE_GOVERNANCE_AUDIENCE")
    ?? throw new InvalidOperationException(
        "No API audience configured. Set Governance:Auth:Audience or KREWE_GOVERNANCE_AUDIENCE " +
        "(this API's App ID URI, e.g. api://<clientId>). Refusing to start without authentication configured.");

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Authority = authAuthority;
        options.Audience = authAudience;
        options.MapInboundClaims = false; // keep raw claim names (tid, scp, oid)
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ClockSkew = TimeSpan.FromMinutes(2),
        };
    });
builder.Services.AddAuthorization();

var app = builder.Build();

app.UseAuthentication();
app.UseAuthorization();

app.MapKreweGovernance();

app.Run();
