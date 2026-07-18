// KREWE Governance API surface (reconstructed from NOC-19's feature list):
// policy library, variable-collection wizard (NOC-19 #4), assembly (#5), and
// client acknowledgment (the AssembledPolicies.Acknowledged* columns — Phase 3d).
// Entra auth is deliberately deferred to the kreweconnect transplant, where the
// existing token/tenant middleware is ported in front of these routes.

using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using NOIT.KreweGovernance.Data;
using NOIT.KreweGovernance.Domain;
using NOIT.KreweGovernance.Services;

namespace NOIT.KreweGovernance.Api;

public static class Endpoints
{
    public static void MapKreweGovernance(this IEndpointRouteBuilder app)
    {
        // Every route under /api requires a validated bearer token. Health is
        // the only anonymous endpoint (liveness probes must not need a token).
        var api = app.MapGroup("/api").RequireAuthorization();

        api.MapGet("/health", () => Results.Ok(new { status = "ok", app = "krewe-governance", apiVersion = "0.1.0-reconstruction" }))
            .AllowAnonymous();

        // --- Clients ---
        api.MapGet("/clients", async (KreweGovernanceDbContext db) =>
            await db.ClientCompanies.AsNoTracking()
                .Where(c => c.IsActive)
                .OrderBy(c => c.Name)
                .Select(c => new { c.Id, c.Name, c.Industry, c.PrimaryContactName, c.PrimaryContactEmail, c.MitpClientId })
                .ToListAsync());

        // --- Policy library ---
        api.MapGet("/policies", async (KreweGovernanceDbContext db) =>
            await db.Policies.AsNoTracking()
                .OrderBy(p => p.Category.SortOrder).ThenBy(p => p.Title)
                .Select(p => new
                {
                    p.Id, p.Title, p.Summary, p.Status, p.CurrentVersion, p.NextReviewDate,
                    Category = p.Category.Name,
                })
                .ToListAsync());

        api.MapGet("/policies/{id:guid}", async (Guid id, KreweGovernanceDbContext db) =>
        {
            var policy = await db.Policies.AsNoTracking()
                .Include(p => p.Category)
                .Include(p => p.Variables)
                .FirstOrDefaultAsync(p => p.Id == id);
            return policy is null ? Results.NotFound() : Results.Ok(new
            {
                policy.Id, policy.Title, policy.Summary, policy.Content, policy.Status,
                policy.CurrentVersion, policy.NextReviewDate, Category = policy.Category.Name,
                Variables = policy.Variables.OrderBy(v => v.SortOrder)
                    .Select(v => new { v.Key, v.Label, v.Question, v.InputType, v.Options, v.IsUniversal, v.Required, v.SortOrder }),
            });
        });

        // --- Variable-collection wizard ---
        // Questions for a policy, pre-filled with the client's existing answers
        // (universal questions first — they're shared across all policies).
        api.MapGet("/policies/{id:guid}/wizard", async (
            Guid id, Guid clientId, ClaimsPrincipal user, IConfiguration config,
            KreweGovernanceDbContext db, AssemblyService assembly) =>
        {
            var denied = GovernanceAuth.EnforceClientAccess(user, config, clientId);
            if (denied is not null) return denied;

            var policy = await db.Policies.AsNoTracking()
                .Include(p => p.Variables)
                .FirstOrDefaultAsync(p => p.Id == id);
            if (policy is null) return Results.NotFound();

            var existing = await assembly.GetClientValuesAsync(clientId);

            var questions = policy.Variables
                .OrderByDescending(v => v.IsUniversal).ThenBy(v => v.SortOrder)
                .Select(v => new WizardQuestion(
                    v.Key, v.Label, v.Question, v.InputType, v.Options,
                    v.IsUniversal, v.Required, v.SortOrder,
                    existing.TryGetValue(v.Key, out var val) ? val : null))
                .ToList();

            return Results.Ok(new { policy.Id, policy.Title, ClientId = clientId, Questions = questions });
        });

        // Upsert a client's answers (the wizard's save).
        api.MapPut("/clients/{clientId:guid}/variables", async (
            Guid clientId, List<VariableAnswer> answers, ClaimsPrincipal user,
            IConfiguration config, KreweGovernanceDbContext db) =>
        {
            var denied = GovernanceAuth.EnforceClientAccess(user, config, clientId);
            if (denied is not null) return denied;

            var client = await db.ClientCompanies.FindAsync(clientId);
            if (client is null) return Results.NotFound();

            var now = DateTime.UtcNow;
            var existing = await db.ClientVariables
                .Where(v => v.ClientCompanyId == clientId)
                .ToDictionaryAsync(v => v.Key, StringComparer.OrdinalIgnoreCase);

            foreach (var answer in answers.Where(a => !string.IsNullOrWhiteSpace(a.Key)))
            {
                if (existing.TryGetValue(answer.Key, out var row))
                {
                    row.Value = answer.Value;
                    row.UpdatedAt = now;
                }
                else
                {
                    db.ClientVariables.Add(new ClientVariable
                    {
                        ClientCompanyId = clientId,
                        Key = answer.Key,
                        Value = answer.Value,
                        CollectedAt = now,
                    });
                }
            }
            await db.SaveChangesAsync();
            return Results.Ok(new { saved = answers.Count });
        });

        // --- Assembly ---
        api.MapPost("/policies/{id:guid}/assemble", async (
            Guid id, AssembleRequest request, ClaimsPrincipal user, IConfiguration config,
            AssemblyService assembly) =>
        {
            var denied = GovernanceAuth.EnforceClientAccess(user, config, request.ClientCompanyId);
            if (denied is not null) return denied;

            var outcome = await assembly.AssembleAsync(id, request.ClientCompanyId, request.AssembledBy);
            return outcome is null ? Results.NotFound() : Results.Ok(outcome);
        });

        api.MapGet("/clients/{clientId:guid}/assembled", async (
            Guid clientId, ClaimsPrincipal user, IConfiguration config, KreweGovernanceDbContext db) =>
        {
            var denied = GovernanceAuth.EnforceClientAccess(user, config, clientId);
            if (denied is not null) return denied;

            return Results.Ok(await db.AssembledPolicies.AsNoTracking()
                .Where(a => a.ClientCompanyId == clientId)
                .OrderByDescending(a => a.AssembledAt)
                .Select(a => new
                {
                    a.Id, a.PolicyId, PolicyTitle = a.Policy.Title,
                    a.AssembledAt, a.AssembledBy, a.AcknowledgedByClient, a.AcknowledgedAt,
                })
                .ToListAsync());
        });

        // SECURITY: this by-id lookup is not client-scoped. Under the current
        // NOIT-only authority every authenticated caller is an MSP admin, so
        // this is safe today; when client (non-MSP) tokens are enabled, load the
        // row's ClientCompanyId and run GovernanceAuth.EnforceClientAccess on it.
        api.MapGet("/assembled/{id:int}", async (int id, KreweGovernanceDbContext db) =>
        {
            var assembled = await db.AssembledPolicies.AsNoTracking()
                .Include(a => a.Policy).Include(a => a.ClientCompany)
                .FirstOrDefaultAsync(a => a.Id == id);
            return assembled is null ? Results.NotFound() : Results.Ok(new
            {
                assembled.Id, PolicyTitle = assembled.Policy.Title, Client = assembled.ClientCompany.Name,
                assembled.AssembledContent, assembled.AssembledAt, assembled.AssembledBy,
                assembled.AcknowledgedByClient, assembled.AcknowledgedAt,
            });
        });

        // --- Acknowledgment (Phase 3d: client sign-off; PhinSec sync lands here too) ---
        // SECURITY: like GET /assembled/{id}, this mutates a row addressed by its
        // assembled id, not a clientId. Authentication is enforced (group-level).
        // When client (non-MSP) tokens are enabled, load the row's ClientCompanyId
        // and gate with GovernanceAuth.EnforceClientAccess before mutating.
        api.MapPost("/assembled/{id:int}/acknowledge", async (int id, KreweGovernanceDbContext db) =>
        {
            var assembled = await db.AssembledPolicies.FindAsync(id);
            if (assembled is null) return Results.NotFound();
            assembled.AcknowledgedByClient = true;
            assembled.AcknowledgedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Results.Ok(new { assembled.Id, assembled.AcknowledgedByClient, assembled.AcknowledgedAt });
        });
    }
}

/// <summary>
/// Caller authorization helpers mirroring the tenant-isolation intent of
/// api/src/lib/authMiddleware.ts: MSP-tenant (NOIT) callers may act across all
/// client companies; everyone else is confined to their own.
/// </summary>
internal static class GovernanceAuth
{
    // NOIT home tenant — callers whose token `tid` matches are MSP admins.
    // Kept in sync with the auth authority default in Program.cs.
    public const string DefaultMspTenantId = "7fb15bf6-9cea-4c72-89bd-1ab9f16eec8e";

    private static string MspTenantId(IConfiguration config) =>
        config["Governance:Auth:MspTenantId"]
        ?? Environment.GetEnvironmentVariable("KREWE_GOVERNANCE_MSP_TENANT_ID")
        ?? DefaultMspTenantId;

    public static bool IsMspAdmin(ClaimsPrincipal user, IConfiguration config)
    {
        var tid = user.FindFirst("tid")?.Value
            ?? user.FindFirst("http://schemas.microsoft.com/identity/claims/tenantid")?.Value;
        return !string.IsNullOrEmpty(tid)
            && string.Equals(tid, MspTenantId(config), StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Returns <c>null</c> when the caller may act on <paramref name="clientId"/>,
    /// or a 403 result when the request must be denied.
    /// </summary>
    public static IResult? EnforceClientAccess(ClaimsPrincipal user, IConfiguration config, Guid clientId)
    {
        // MSP admins (NOIT staff) may act across every client company.
        if (IsMspAdmin(user, config)) return null;

        // SECURITY: client (non-MSP) callers are not yet mapped to a specific
        // ClientCompany, so there is no verified way to prove this clientId is
        // theirs. Fail closed until that token-tenant -> ClientCompany mapping
        // exists, so a client can never reach another client's governance data.
        return Results.Problem(
            statusCode: StatusCodes.Status403Forbidden,
            title: "Not authorized to access this client.");
    }
}

public record WizardQuestion(
    string Key, string Label, string Question, string InputType, string? Options,
    bool IsUniversal, bool Required, int SortOrder, string? CurrentValue);

public record VariableAnswer(string Key, string Value);

public record AssembleRequest(Guid ClientCompanyId, string AssembledBy);
