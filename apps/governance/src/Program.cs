// KREWE Governance — reconstructed backend entry point.
// Database-first against the EXISTING krewe-governance-db: no EnsureCreated, no
// migrations. Connection string comes from ConnectionStrings:KreweGovernance or
// the KREWE_GOVERNANCE_SQL environment variable (value lives in AWS Secrets
// Manager `noit/krewe-governance-sql` — never in this repo).

using Microsoft.EntityFrameworkCore;
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

var app = builder.Build();

app.MapKreweGovernance();

app.Run();
