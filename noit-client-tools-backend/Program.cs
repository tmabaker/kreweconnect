using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.Identity.Web;
using Microsoft.OpenApi.Models;
using NOIT.ClientTools.Api.Middleware;
using NOIT.ClientTools.Core.Interfaces;
using NOIT.ClientTools.Infrastructure.Data;
using NOIT.ClientTools.Infrastructure.Services;

var builder = WebApplication.CreateBuilder(args);

// ----- Authentication -----
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddMicrosoftIdentityWebApi(options =>
    {
        builder.Configuration.Bind("AzureAd", options);
        options.TokenValidationParameters.ValidateIssuer = true;
    }, options =>
    {
        builder.Configuration.Bind("AzureAd", options);
    });

// ----- Database -----
builder.Services.AddDbContext<AppDbContext>(options =>
{
    var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
    if (string.IsNullOrWhiteSpace(connectionString) || connectionString.Contains("placeholder"))
    {
        // Use in-memory database for development
        options.UseInMemoryDatabase("NOITClientTools");
    }
    else
    {
        options.UseSqlServer(connectionString, sql => sql.MigrationsAssembly("NOIT.ClientTools.Infrastructure"));
    }
});

// ----- Services -----
builder.Services.AddScoped<ITenantContext, TenantContext>();
builder.Services.AddScoped<IGdapService, GdapService>();
builder.Services.AddScoped<IAuditService, AuditService>();
builder.Services.AddScoped<IEmployeeSyncService, EmployeeSyncService>();
builder.Services.AddScoped<IEmployeeService, EmployeeService>();
builder.Services.AddScoped<IContractService, ContractService>();
builder.Services.AddScoped<IContractApprovalService, ContractApprovalService>();
builder.Services.AddScoped<IRenewalAlertService, RenewalAlertService>();
builder.Services.AddHttpContextAccessor();

// ----- Redis (optional) -----
var redisConnection = builder.Configuration.GetConnectionString("Redis");
if (!string.IsNullOrWhiteSpace(redisConnection) && !redisConnection.Contains("placeholder"))
{
    builder.Services.AddStackExchangeRedisCache(options =>
    {
        options.Configuration = redisConnection;
        options.InstanceName = "noit-client-tools:";
    });
}
else
{
    builder.Services.AddDistributedMemoryCache();
}

// ----- CORS -----
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        var origins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
            ?? new[] { "https://techtools.noitgroup.com", "http://localhost:5173", "http://localhost:3000" };

        policy.WithOrigins(origins)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

// ----- Controllers & Swagger -----
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
        options.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
    });

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "NOIT Client Tools API",
        Version = "v1",
        Description = "API for KreweConnect (Employee Directory) and Contract Lifecycle Manager",
        Contact = new OpenApiContact { Name = "NOIT Group", Email = "tammy@noitgroup.com" }
    });

    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Description = "JWT Authorization via Microsoft Entra ID. Enter 'Bearer {token}'",
        Name = "Authorization",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT"
    });

    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme { Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" } },
            Array.Empty<string>()
        }
    });
});

// ----- Application Insights -----
if (!string.IsNullOrWhiteSpace(builder.Configuration["ApplicationInsights:ConnectionString"]))
{
    builder.Services.AddApplicationInsightsTelemetry();
}

var app = builder.Build();

// ----- Middleware pipeline -----
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(c => c.SwaggerEndpoint("/swagger/v1/swagger.json", "NOIT Client Tools API v1"));
}

app.UseCors("AllowFrontend");
app.UseAuthentication();
app.UseAuthorization();
app.UseMiddleware<TenantContextMiddleware>();
app.MapControllers();

// ----- Seed mock data in development -----
if (app.Environment.IsDevelopment())
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    var gdap = scope.ServiceProvider.GetRequiredService<IGdapService>();

    // Ensure DB created (in-memory)
    await db.Database.EnsureCreatedAsync();

    // Auto-seed tenants from mock GDAP data if empty
    if (!await db.ClientTenants.AnyAsync())
    {
        await gdap.SyncTenantRegistryAsync();
    }

    // Auto-seed employees from mock data if empty
    if (!await db.Employees.AnyAsync())
    {
        var syncService = scope.ServiceProvider.GetRequiredService<IEmployeeSyncService>();
        var tenants = await db.ClientTenants.ToListAsync();
        foreach (var tenant in tenants)
        {
            await syncService.SyncTenantAsync(tenant.Id);
        }
    }

    // Auto-seed contracts from mock data if empty
    if (!await db.Contracts.AnyAsync())
    {
        await SeedContractData(db);
    }
}

static async Task SeedContractData(NOIT.ClientTools.Infrastructure.Data.AppDbContext db)
{
    var tenants = await db.ClientTenants.ToListAsync();
    if (!tenants.Any()) return;

    var bayou = tenants.FirstOrDefault(t => t.DisplayName.Contains("Bayou"));
    var fishman = tenants.FirstOrDefault(t => t.DisplayName.Contains("Fishman"));
    var irby = tenants.FirstOrDefault(t => t.DisplayName.Contains("Irby"));

    // Create tags
    var tags = new Dictionary<string, NOIT.ClientTools.Core.Models.Tag>();
    var tagData = new[] {
        ("Critical", "#D13438"), ("Security", "#0078D4"), ("Productivity", "#107C10"),
        ("Backup", "#8764B8"), ("Monitoring", "#FF8C00"), ("Infrastructure", "#004E8C"),
        ("Compliance", "#C239B3"), ("Cloud", "#00BCF2")
    };
    foreach (var (name, color) in tagData)
    {
        var tag = new NOIT.ClientTools.Core.Models.Tag { Id = Guid.NewGuid(), Name = name, Color = color };
        db.Tags.Add(tag);
        tags[name] = tag;
    }

    var today = DateOnly.FromDateTime(DateTime.UtcNow);
    var contracts = new List<(int tenantId, string vendor, string title, NOIT.ClientTools.Core.Enums.ContractType type, decimal value, NOIT.ClientTools.Core.Enums.ContractStatus status, DateOnly start, DateOnly? end, bool autoRenew, string? sla, string[] tagNames)>
    {
        // Bayou Automotive contracts
        (bayou!.Id, "Microsoft", "Microsoft 365 Business Premium", NOIT.ClientTools.Core.Enums.ContractType.Subscription, 9600m, NOIT.ClientTools.Core.Enums.ContractStatus.Active, today.AddMonths(-10), today.AddMonths(14), true, "99.9% uptime", new[] { "Critical", "Productivity", "Cloud" }),
        (bayou.Id, "Datto", "Datto RMM - Endpoint Management", NOIT.ClientTools.Core.Enums.ContractType.Subscription, 4800m, NOIT.ClientTools.Core.Enums.ContractStatus.Active, today.AddMonths(-6), today.AddMonths(18), true, "4hr response time", new[] { "Critical", "Monitoring" }),
        (bayou.Id, "SentinelOne", "SentinelOne Singularity - EDR", NOIT.ClientTools.Core.Enums.ContractType.Subscription, 7200m, NOIT.ClientTools.Core.Enums.ContractStatus.Active, today.AddMonths(-3), today.AddMonths(9), true, "24/7 SOC monitoring", new[] { "Critical", "Security" }),
        (bayou.Id, "Cisco Meraki", "Meraki MX Firewall + Licensing", NOIT.ClientTools.Core.Enums.ContractType.Hardware, 3600m, NOIT.ClientTools.Core.Enums.ContractStatus.Active, today.AddMonths(-12), today.AddDays(25), false, null, new[] { "Infrastructure", "Security" }),
        (bayou.Id, "IT Glue", "IT Glue Documentation Platform", NOIT.ClientTools.Core.Enums.ContractType.Subscription, 2400m, NOIT.ClientTools.Core.Enums.ContractStatus.Active, today.AddMonths(-8), today.AddMonths(16), true, null, new[] { "Productivity" }),
        (bayou.Id, "Adobe", "Adobe Creative Cloud - Team License", NOIT.ClientTools.Core.Enums.ContractType.Software, 1800m, NOIT.ClientTools.Core.Enums.ContractStatus.Active, today.AddMonths(-4), today.AddMonths(8), true, null, new[] { "Productivity" }),

        // Fishman Haygood contracts
        (fishman!.Id, "Microsoft", "Microsoft 365 E3 Enterprise", NOIT.ClientTools.Core.Enums.ContractType.Subscription, 18000m, NOIT.ClientTools.Core.Enums.ContractStatus.Active, today.AddMonths(-5), today.AddMonths(7), true, "99.9% uptime, Advanced compliance", new[] { "Critical", "Productivity", "Compliance", "Cloud" }),
        (fishman.Id, "ConnectWise", "ConnectWise Automate - RMM", NOIT.ClientTools.Core.Enums.ContractType.Subscription, 6000m, NOIT.ClientTools.Core.Enums.ContractStatus.Active, today.AddMonths(-9), today.AddMonths(3), true, "2hr response SLA", new[] { "Critical", "Monitoring" }),
        (fishman.Id, "Spanning", "Spanning Backup for Microsoft 365", NOIT.ClientTools.Core.Enums.ContractType.Subscription, 3600m, NOIT.ClientTools.Core.Enums.ContractStatus.Active, today.AddMonths(-7), today.AddMonths(5), true, "RPO: 24hrs", new[] { "Backup", "Cloud" }),
        (fishman.Id, "ThreatLocker", "ThreatLocker Zero Trust - Ringfencing", NOIT.ClientTools.Core.Enums.ContractType.Subscription, 5400m, NOIT.ClientTools.Core.Enums.ContractStatus.Active, today.AddMonths(-2), today.AddMonths(10), true, "Zero trust enforcement", new[] { "Critical", "Security" }),
        (fishman.Id, "RocketCyber", "RocketCyber MDR Platform", NOIT.ClientTools.Core.Enums.ContractType.Service, 8400m, NOIT.ClientTools.Core.Enums.ContractStatus.Active, today.AddMonths(-11), today.AddDays(15), true, "24/7 SOC, 15-min response", new[] { "Security", "Monitoring" }),
        (fishman.Id, "Vonahi Security", "vPenTest - Automated Penetration Testing", NOIT.ClientTools.Core.Enums.ContractType.Service, 4200m, NOIT.ClientTools.Core.Enums.ContractStatus.UnderReview, today.AddMonths(-1), today.AddMonths(11), false, "Quarterly pen tests", new[] { "Security", "Compliance" }),
        (fishman.Id, "Kaseya", "DarkWeb ID - Dark Web Monitoring", NOIT.ClientTools.Core.Enums.ContractType.Subscription, 2100m, NOIT.ClientTools.Core.Enums.ContractStatus.Active, today.AddMonths(-6), today.AddMonths(6), true, null, new[] { "Security" }),

        // Irby Investments contracts
        (irby!.Id, "Microsoft", "Microsoft 365 Business Standard", NOIT.ClientTools.Core.Enums.ContractType.Subscription, 6600m, NOIT.ClientTools.Core.Enums.ContractStatus.Active, today.AddMonths(-4), today.AddMonths(8), true, "99.9% uptime", new[] { "Critical", "Productivity", "Cloud" }),
        (irby.Id, "Datto", "Datto BCDR - Business Continuity", NOIT.ClientTools.Core.Enums.ContractType.Service, 5400m, NOIT.ClientTools.Core.Enums.ContractStatus.Active, today.AddMonths(-10), today.AddMonths(2), true, "15-min RPO, 1-hr RTO", new[] { "Critical", "Backup" }),
        (irby.Id, "Phinsec", "Phinsec Security Awareness Training", NOIT.ClientTools.Core.Enums.ContractType.Service, 1800m, NOIT.ClientTools.Core.Enums.ContractStatus.Active, today.AddMonths(-3), today.AddMonths(9), true, null, new[] { "Security", "Compliance" }),
        (irby.Id, "SaaS Alerts", "SaaS Alerts - Cloud App Monitoring", NOIT.ClientTools.Core.Enums.ContractType.Subscription, 1500m, NOIT.ClientTools.Core.Enums.ContractStatus.Draft, today, today.AddMonths(12), false, null, new[] { "Monitoring", "Cloud" }),
        (irby.Id, "Cisco Meraki", "Meraki MR Access Points - Office WiFi", NOIT.ClientTools.Core.Enums.ContractType.Hardware, 2400m, NOIT.ClientTools.Core.Enums.ContractStatus.Expired, today.AddMonths(-18), today.AddDays(-10), false, null, new[] { "Infrastructure" }),
        (irby.Id, "Scalepad", "Scalepad Lifecycle Manager", NOIT.ClientTools.Core.Enums.ContractType.Subscription, 1200m, NOIT.ClientTools.Core.Enums.ContractStatus.Active, today.AddMonths(-5), today.AddMonths(7), true, null, new[] { "Monitoring" }),
    };

    foreach (var (tenantId, vendor, title, type, value, status, start, end, autoRenew, sla, tagNames) in contracts)
    {
        var contract = new NOIT.ClientTools.Core.Models.Contract
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            VendorName = vendor,
            Title = title,
            ContractType = type,
            Value = value,
            Status = status,
            StartDate = start,
            EndDate = end,
            RenewalDate = end?.AddDays(-30),
            AutoRenew = autoRenew,
            SLATerms = sla,
            Currency = "USD",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };
        db.Contracts.Add(contract);

        // Initial version
        db.ContractVersions.Add(new NOIT.ClientTools.Core.Models.ContractVersion
        {
            Id = Guid.NewGuid(),
            ContractId = contract.Id,
            VersionNumber = 1,
            Summary = "Contract created",
            ChangedAt = DateTime.UtcNow,
            ChangeNotes = "Initial creation",
        });

        // Tags
        foreach (var tagName in tagNames)
        {
            if (tags.TryGetValue(tagName, out var tag))
            {
                db.ContractTags.Add(new NOIT.ClientTools.Core.Models.ContractTag
                {
                    Id = Guid.NewGuid(),
                    ContractId = contract.Id,
                    TagId = tag.Id,
                });
            }
        }

        // Renewal alerts for contracts expiring within 90 days
        if (end.HasValue)
        {
            var daysLeft = end.Value.DayNumber - today.DayNumber;
            if (daysLeft > 0 && daysLeft <= 90)
            {
                db.RenewalAlerts.Add(new NOIT.ClientTools.Core.Models.RenewalAlert
                {
                    Id = Guid.NewGuid(),
                    ContractId = contract.Id,
                    AlertDate = today,
                    AlertType = daysLeft <= 30 ? NOIT.ClientTools.Core.Enums.AlertType.ThirtyDay
                              : daysLeft <= 60 ? NOIT.ClientTools.Core.Enums.AlertType.SixtyDay
                              : NOIT.ClientTools.Core.Enums.AlertType.NinetyDay,
                });
            }
        }

        // Mock documents for some contracts
        if (status == NOIT.ClientTools.Core.Enums.ContractStatus.Active && value > 5000)
        {
            db.ContractDocuments.Add(new NOIT.ClientTools.Core.Models.ContractDocument
            {
                Id = Guid.NewGuid(),
                ContractId = contract.Id,
                FileName = $"{vendor.ToLower().Replace(" ", "-")}-contract-signed.pdf",
                FileSize = 245760,
                ContentType = "application/pdf",
                StoragePath = $"contracts/{contract.Id}/{vendor.ToLower().Replace(" ", "-")}-contract-signed.pdf",
                UploadedAt = DateTime.UtcNow.AddDays(-30),
            });
        }
    }

    await db.SaveChangesAsync();
}

app.Run();
