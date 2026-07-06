using System.Collections.Concurrent;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
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
/// Thrown when a customer tenant has not granted admin consent to the
/// multi-tenant app (or it was revoked). Carries the admin-consent URL so the
/// UI can prompt an administrator to authorize the tenant.
/// </summary>
public class TenantNotAuthorizedException : Exception
{
    public string ConsentUrl { get; }
    public TenantNotAuthorizedException(string tenantId, string consentUrl)
        : base($"Tenant {tenantId} has not authorized this application. An administrator must grant consent first.")
    {
        ConsentUrl = consentUrl;
    }
}

/// <summary>
/// Manages GDAP relationships (tenant discovery) and per-tenant app-only token
/// acquisition. Auth model: each customer tenant grants one-time admin consent
/// to the multi-tenant app (Apps365-style); we then mint app-only Graph tokens
/// against that tenant's authority via client credentials. GDAP relationships
/// are used only to *discover* which client tenants exist — not on the auth path.
///
/// Set <c>Gdap:UseMockData=false</c> in config to use the real implementations.
/// </summary>
public class GdapService : IGdapService
{
    private readonly AppDbContext _db;
    private readonly IConfiguration _configuration;
    private readonly ILogger<GdapService> _logger;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly bool _useMockData;

    // Per-tenant token cache, keyed by "{tenantId}|{scope}". Refresh shortly before expiry.
    private static readonly ConcurrentDictionary<string, CachedToken> TokenCache = new();
    private static readonly TimeSpan ExpiryMargin = TimeSpan.FromMinutes(5);

    /// <summary>
    /// AADSTS codes meaning "the app is not consented/provisioned in this tenant"
    /// — i.e. admin consent hasn't happened (or was revoked).
    /// </summary>
    private static readonly string[] ConsentErrorCodes = { "700016", "65001", "90002" };

    public GdapService(
        AppDbContext db,
        IConfiguration configuration,
        ILogger<GdapService> logger,
        IHttpClientFactory httpClientFactory)
    {
        _db = db;
        _configuration = configuration;
        _logger = logger;
        _httpClientFactory = httpClientFactory;
        _useMockData = configuration.GetValue<bool>("Gdap:UseMockData", true);
    }

    // ─── Tenant discovery via GDAP (discovery only, not the auth path) ────────

    public async Task<IReadOnlyList<GdapRelationshipDto>> GetActiveRelationshipsAsync(CancellationToken ct = default)
    {
        if (_useMockData)
        {
            _logger.LogInformation("Returning {Count} mock GDAP relationships", MockRelationships.Count);
            return MockRelationships;
        }

        // Discovery runs against the partner (NOIT) tenant with an app-only token.
        var partnerTenantId = _configuration["Gdap:PartnerTenantId"]
            ?? _configuration["AzureAd:TenantId"]
            ?? throw new InvalidOperationException("Gdap:PartnerTenantId / AzureAd:TenantId not configured.");

        var token = await AcquireTokenForTenantAsync(
            partnerTenantId, new[] { "https://graph.microsoft.com/.default" }, ct);

        var http = _httpClientFactory.CreateClient();
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var results = new List<GdapRelationshipDto>();
        var url = "https://graph.microsoft.com/v1.0/tenantRelationships/delegatedAdminRelationships?$filter=status eq 'active'";

        while (!string.IsNullOrEmpty(url))
        {
            var page = await http.GetFromJsonAsync<GraphPage<DelegatedAdminRelationship>>(url, ct)
                ?? new GraphPage<DelegatedAdminRelationship>();

            foreach (var rel in page.Value)
            {
                results.Add(new GdapRelationshipDto
                {
                    Id = rel.Id ?? string.Empty,
                    DisplayName = rel.DisplayName ?? string.Empty,
                    CustomerTenantId = rel.Customer?.TenantId ?? string.Empty,
                    CustomerDisplayName = rel.Customer?.DisplayName ?? string.Empty,
                    RoleDefinitionIds = rel.AccessDetails?.UnifiedRoles?
                        .Select(r => r.RoleDefinitionId ?? string.Empty)
                        .Where(s => s.Length > 0).ToList() ?? new List<string>(),
                    Status = rel.Status ?? string.Empty,
                    ActivatedDateTime = rel.ActivatedDateTime,
                    EndDateTime = rel.EndDateTime,
                });
            }

            url = page.NextLink;
        }

        _logger.LogInformation("Discovered {Count} active GDAP relationships from Graph", results.Count);
        return results;
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

    // ─── Per-tenant app-only token acquisition (the auth path) ────────────────

    public async Task<string> AcquireTokenForTenantAsync(string tenantId, string[] scopes, CancellationToken ct = default)
    {
        if (_useMockData)
        {
            _logger.LogDebug("Returning mock token for tenant {TenantId}", tenantId);
            return $"mock-access-token-for-{tenantId}";
        }

        // Client credentials requires the ".default" scope form; if the caller
        // passed resource scopes, fall back to Graph's default.
        var scope = scopes is { Length: > 0 } ? string.Join(" ", scopes) : "https://graph.microsoft.com/.default";
        if (!scope.Contains("/.default"))
            scope = "https://graph.microsoft.com/.default";

        var cacheKey = $"{tenantId}|{scope}";
        if (TokenCache.TryGetValue(cacheKey, out var cached) && DateTime.UtcNow < cached.ExpiresAt - ExpiryMargin)
            return cached.AccessToken;

        var (clientId, clientSecret) = GetAppCredentials();

        var http = _httpClientFactory.CreateClient();
        var form = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["client_id"] = clientId,
            ["client_secret"] = clientSecret,
            ["grant_type"] = "client_credentials",
            ["scope"] = scope,
        });

        var response = await http.PostAsync(
            $"https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token", form, ct);

        var rawBody = await response.Content.ReadAsStringAsync(ct);

        if (!response.IsSuccessStatusCode)
        {
            // Invalid/expired backend secret is an operator problem, not a tenant-consent one.
            if (rawBody.Contains("AADSTS7000215"))
                throw new InvalidOperationException("Backend client secret is invalid or expired — rotate AzureAd:ClientSecret.");

            if (ConsentErrorCodes.Any(code => rawBody.Contains($"AADSTS{code}")))
                throw new TenantNotAuthorizedException(tenantId, BuildConsentUrl(clientId, tenantId));

            throw new InvalidOperationException(
                $"Token acquisition failed for tenant {tenantId}: {(int)response.StatusCode} {rawBody}");
        }

        var token = JsonSerializer.Deserialize<TokenResponse>(rawBody)
            ?? throw new InvalidOperationException("Empty token response from Entra.");

        TokenCache[cacheKey] = new CachedToken(
            token.AccessToken ?? string.Empty,
            DateTime.UtcNow.AddSeconds(token.ExpiresIn));

        return token.AccessToken ?? string.Empty;
    }

    public async Task<bool> ValidateTenantAccessAsync(string tenantId, CancellationToken ct = default)
    {
        if (!Guid.TryParse(tenantId, out var tenantGuid))
            return false;

        return await _db.ClientTenants.AnyAsync(
            t => t.TenantId == tenantGuid && t.Status == TenantStatus.Active, ct);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private (string clientId, string clientSecret) GetAppCredentials()
    {
        var clientId = _configuration["AzureAd:ClientId"]
            ?? throw new InvalidOperationException("AzureAd:ClientId not configured.");
        var clientSecret = _configuration["AzureAd:ClientSecret"]
            ?? throw new InvalidOperationException("AzureAd:ClientSecret not configured.");
        return (clientId, clientSecret);
    }

    private string BuildConsentUrl(string clientId, string tenantId)
    {
        var redirectUri = _configuration["Gdap:ConsentRedirectUri"] ?? "https://techtools.noitgroup.com";
        var query = $"client_id={Uri.EscapeDataString(clientId)}&redirect_uri={Uri.EscapeDataString(redirectUri)}";
        return $"https://login.microsoftonline.com/{tenantId}/adminconsent?{query}";
    }

    private readonly record struct CachedToken(string AccessToken, DateTime ExpiresAt);

    private sealed class TokenResponse
    {
        [JsonPropertyName("access_token")] public string? AccessToken { get; set; }
        [JsonPropertyName("expires_in")] public int ExpiresIn { get; set; }
    }

    // Microsoft Graph delegatedAdminRelationships shapes (subset).
    private sealed class GraphPage<T>
    {
        [JsonPropertyName("value")] public List<T> Value { get; set; } = new();
        [JsonPropertyName("@odata.nextLink")] public string? NextLink { get; set; }
    }

    private sealed class DelegatedAdminRelationship
    {
        [JsonPropertyName("id")] public string? Id { get; set; }
        [JsonPropertyName("displayName")] public string? DisplayName { get; set; }
        [JsonPropertyName("status")] public string? Status { get; set; }
        [JsonPropertyName("activatedDateTime")] public DateTime? ActivatedDateTime { get; set; }
        [JsonPropertyName("endDateTime")] public DateTime? EndDateTime { get; set; }
        [JsonPropertyName("customer")] public GdapCustomer? Customer { get; set; }
        [JsonPropertyName("accessDetails")] public GdapAccessDetails? AccessDetails { get; set; }
    }

    private sealed class GdapCustomer
    {
        [JsonPropertyName("tenantId")] public string? TenantId { get; set; }
        [JsonPropertyName("displayName")] public string? DisplayName { get; set; }
    }

    private sealed class GdapAccessDetails
    {
        [JsonPropertyName("unifiedRoles")] public List<GdapUnifiedRole>? UnifiedRoles { get; set; }
    }

    private sealed class GdapUnifiedRole
    {
        [JsonPropertyName("roleDefinitionId")] public string? RoleDefinitionId { get; set; }
    }

    // Mock GDAP relationships for development (Gdap:UseMockData=true).
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
}
