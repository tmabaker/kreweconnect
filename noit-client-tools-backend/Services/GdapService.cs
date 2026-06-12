using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using NOIT.ClientTools.Core.DTOs;
using NOIT.ClientTools.Core.Enums;
using NOIT.ClientTools.Core.Interfaces;
using NOIT.ClientTools.Core.Models;
using NOIT.ClientTools.Infrastructure.Data;

namespace NOIT.ClientTools.Infrastructure.Services;

/// <summary>
/// Manages GDAP relationships and token acquisition for client tenants.
/// In development mode, returns mock data. In production, calls Microsoft Graph API.
/// </summary>
public class GdapService : IGdapService
{
    private readonly AppDbContext _db;
    private readonly IConfiguration _configuration;
    private readonly ILogger<GdapService> _logger;
    private readonly bool _useMockData;

    // Mock GDAP relationships for development
    private static readonly List<GdapRelationshipDto> MockRelationships = new()
    {
        new() { Id = "gdap-rel-001", DisplayName = "Bayou Automotive Admin", CustomerTenantId = "aaaaaaaa-1111-2222-3333-444444444444", CustomerDisplayName = "Bayou Automotive", RoleDefinitionIds = new() { "88d8e3e3-8f55-4a1e-953a-9b9898b8876b" }, Status = "active", ActivatedDateTime = DateTime.Parse("2025-01-15"), EndDateTime = DateTime.Parse("2027-01-15") },
        new() { Id = "gdap-rel-002", DisplayName = "Fishman Haygood Admin", CustomerTenantId = "bbbbbbbb-1111-2222-3333-444444444444", CustomerDisplayName = "Fishman Haygood", RoleDefinitionIds = new() { "88d8e3e3-8f55-4a1e-953a-9b9898b8876b" }, Status = "active", ActivatedDateTime = DateTime.Parse("2025-02-01"), EndDateTime = DateTime.Parse("2027-02-01") },
        new() { Id = "gdap-rel-003", DisplayName = "Irby Investments Admin", CustomerTenantId = "cccccccc-1111-2222-3333-444444444444", CustomerDisplayName = "Irby Investments", RoleDefinitionIds = new() { "88d8e3e3-8f55-4a1e-953a-9b9898b8876b" }, Status = "active", ActivatedDateTime = DateTime.Parse("2025-03-01"), EndDateTime = DateTime.Parse("2027-03-01") },
        new() { Id = "gdap-rel-004", DisplayName = "Pac Gulf Admin", CustomerTenantId = "dddddddd-1111-2222-3333-444444444444", CustomerDisplayName = "Pac-Gulf", RoleDefinitionIds = new() { "88d8e3e3-8f55-4a1e-953a-9b9898b8876b" }, Status = "active", ActivatedDateTime = DateTime.Parse("2025-04-01"), EndDateTime = DateTime.Parse("2027-04-01") },
        new() { Id = "gdap-rel-005", DisplayName = "Level BR Admin", CustomerTenantId = "eeeeeeee-1111-2222-3333-444444444444", CustomerDisplayName = "Level BR", RoleDefinitionIds = new() { "88d8e3e3-8f55-4a1e-953a-9b9898b8876b" }, Status = "active", ActivatedDateTime = DateTime.Parse("2025-05-01"), EndDateTime = DateTime.Parse("2027-05-01") },
        new() { Id = "gdap-rel-006", DisplayName = "True Title Admin", CustomerTenantId = "ffffffff-1111-2222-3333-444444444444", CustomerDisplayName = "True Title", RoleDefinitionIds = new() { "88d8e3e3-8f55-4a1e-953a-9b9898b8876b" }, Status = "active", ActivatedDateTime = DateTime.Parse("2025-06-01"), EndDateTime = DateTime.Parse("2027-06-01") },
        new() { Id = "gdap-rel-007", DisplayName = "Corporate Realty Admin", CustomerTenantId = "11111111-aaaa-bbbb-cccc-dddddddddddd", CustomerDisplayName = "Corporate Realty", RoleDefinitionIds = new() { "88d8e3e3-8f55-4a1e-953a-9b9898b8876b" }, Status = "active", ActivatedDateTime = DateTime.Parse("2025-07-01"), EndDateTime = DateTime.Parse("2027-07-01") },
        new() { Id = "gdap-rel-008", DisplayName = "Xtreme Automotive Admin", CustomerTenantId = "22222222-aaaa-bbbb-cccc-dddddddddddd", CustomerDisplayName = "Xtreme Automotive", RoleDefinitionIds = new() { "88d8e3e3-8f55-4a1e-953a-9b9898b8876b" }, Status = "active", ActivatedDateTime = DateTime.Parse("2025-08-01"), EndDateTime = DateTime.Parse("2027-08-01") },
    };

    public GdapService(AppDbContext db, IConfiguration configuration, ILogger<GdapService> logger)
    {
        _db = db;
        _configuration = configuration;
        _logger = logger;
        _useMockData = configuration.GetValue<bool>("Gdap:UseMockData", true);
    }

    public async Task<IReadOnlyList<GdapRelationshipDto>> GetActiveRelationshipsAsync(CancellationToken ct = default)
    {
        if (_useMockData)
        {
            _logger.LogInformation("Returning {Count} mock GDAP relationships", MockRelationships.Count);
            return MockRelationships;
        }

        // TODO: Implement real Graph API call
        // GET https://graph.microsoft.com/v1.0/tenantRelationships/delegatedAdminRelationships?$filter=status eq 'active'
        throw new NotImplementedException("Real GDAP API integration not yet implemented. Set Gdap:UseMockData=true.");
    }

    public async Task<GdapSyncResultDto> SyncTenantRegistryAsync(CancellationToken ct = default)
    {
        var relationships = await GetActiveRelationshipsAsync(ct);
        int newCount = 0, updatedCount = 0, expiredCount = 0;

        foreach (var rel in relationships)
        {
            if (!Guid.TryParse(rel.CustomerTenantId, out var tenantGuid))
            {
                _logger.LogWarning("Skipping relationship {Id} — invalid tenant ID: {TenantId}", rel.Id, rel.CustomerTenantId);
                continue;
            }

            var existing = await _db.ClientTenants.FirstOrDefaultAsync(t => t.TenantId == tenantGuid, ct);

            if (existing == null)
            {
                _db.ClientTenants.Add(new ClientTenant
                {
                    TenantId = tenantGuid,
                    DisplayName = rel.CustomerDisplayName,
                    GdapRelationshipId = rel.Id,
                    Status = TenantStatus.Active,
                    GdapExpiresAt = rel.EndDateTime,
                    GdapRolesJson = JsonSerializer.Serialize(rel.RoleDefinitionIds),
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow,
                });
                newCount++;
            }
            else
            {
                existing.DisplayName = rel.CustomerDisplayName;
                existing.GdapRelationshipId = rel.Id;
                existing.GdapExpiresAt = rel.EndDateTime;
                existing.GdapRolesJson = JsonSerializer.Serialize(rel.RoleDefinitionIds);
                existing.UpdatedAt = DateTime.UtcNow;

                if (rel.EndDateTime.HasValue && rel.EndDateTime.Value < DateTime.UtcNow)
                {
                    existing.Status = TenantStatus.Expired;
                    expiredCount++;
                }
                else
                {
                    existing.Status = TenantStatus.Active;
                    updatedCount++;
                }
            }
        }

        await _db.SaveChangesAsync(ct);

        _logger.LogInformation("GDAP sync complete: {New} new, {Updated} updated, {Expired} expired",
            newCount, updatedCount, expiredCount);

        return new GdapSyncResultDto
        {
            TenantsDiscovered = relationships.Count,
            NewTenants = newCount,
            UpdatedTenants = updatedCount,
            ExpiredTenants = expiredCount,
        };
    }

    public Task<string> AcquireTokenForTenantAsync(string tenantId, string[] scopes, CancellationToken ct = default)
    {
        if (_useMockData)
        {
            _logger.LogDebug("Returning mock token for tenant {TenantId}", tenantId);
            return Task.FromResult($"mock-access-token-for-{tenantId}");
        }

        // TODO: Implement real token acquisition via OBO or client credentials + GDAP
        throw new NotImplementedException("Real token acquisition not yet implemented.");
    }

    public async Task<bool> ValidateTenantAccessAsync(string tenantId, CancellationToken ct = default)
    {
        if (!Guid.TryParse(tenantId, out var tenantGuid))
            return false;

        return await _db.ClientTenants.AnyAsync(
            t => t.TenantId == tenantGuid && t.Status == TenantStatus.Active, ct);
    }
}
