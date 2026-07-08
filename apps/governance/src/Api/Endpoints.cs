// KREWE Governance API surface (reconstructed from NOC-19's feature list):
// policy library (reads + staff-only writes, NOC-55), variable-collection
// wizard (NOC-19 #4), assembly (#5), and client acknowledgment.
//
// Scoping (see CallerContext): NOIT staff see everything; a client user is
// confined to its own ClientCompanyId. Library writes are staff-only.

using Microsoft.EntityFrameworkCore;
using NOIT.KreweGovernance.Data;
using NOIT.KreweGovernance.Domain;
using NOIT.KreweGovernance.Services;

namespace NOIT.KreweGovernance.Api;

public static class Endpoints
{
    public static void MapKreweGovernance(this IEndpointRouteBuilder app, bool requireAuth = false)
    {
        app.MapGet("/api/health", () => Results.Ok(new
        {
            status = "ok",
            app = "krewe-governance",
            apiVersion = "0.2.0-r3",
        }));

        var api = app.MapGroup("/api");
        if (requireAuth) api.RequireAuthorization();

        // --- Clients ---
        api.MapGet("/clients", async (CallerContext caller, KreweGovernanceDbContext db) =>
            await db.ClientCompanies.AsNoTracking()
                .Where(c => c.IsActive && (caller.IsStaff || c.Id == caller.ClientCompanyId))
                .OrderBy(c => c.Name)
                .Select(c => new { c.Id, c.Name, c.Industry, c.PrimaryContactName, c.PrimaryContactEmail, c.MitpClientId })
                .ToListAsync());

        // --- Policy library (reads) ---
        api.MapGet("/policies", async (KreweGovernanceDbContext db) =>
            await db.Policies.AsNoTracking()
                .OrderBy(p => p.Category.SortOrder).ThenBy(p => p.Title)
                .Select(p => new
                {
                    p.Id, p.Title, p.Summary, p.Status, p.CurrentVersion, p.NextReviewDate,
                    Category = p.Category.Name, p.CategoryId,
                })
                .ToListAsync());

        api.MapGet("/policies/{id:guid}", async (Guid id, CallerContext caller, KreweGovernanceDbContext db) =>
        {
            if (!caller.IsStaff) return Results.Forbid();   // full template content is staff-only
            var policy = await db.Policies.AsNoTracking()
                .Include(p => p.Category)
                .Include(p => p.Variables)
                .FirstOrDefaultAsync(p => p.Id == id);
            return policy is null ? Results.NotFound() : Results.Ok(new
            {
                policy.Id, policy.Title, policy.Summary, policy.Content, policy.Status,
                policy.CurrentVersion, policy.NextReviewDate, Category = policy.Category.Name, policy.CategoryId,
                Variables = policy.Variables.OrderBy(v => v.SortOrder)
                    .Select(v => new { v.Key, v.Label, v.Question, v.InputType, v.Options, v.IsUniversal, v.Required, v.SortOrder }),
            });
        });

        api.MapGet("/policies/{id:guid}/versions", async (Guid id, CallerContext caller, KreweGovernanceDbContext db) =>
        {
            if (!caller.IsStaff) return Results.Forbid();
            var versions = await db.PolicyVersions.AsNoTracking()
                .Where(v => v.PolicyId == id)
                .OrderByDescending(v => v.VersionNumber)
                .Select(v => new { v.Id, v.VersionNumber, v.ChangeNotes, v.CreatedAt })
                .ToListAsync();
            return Results.Ok(versions);
        });

        // --- Categories ---
        api.MapGet("/categories", async (KreweGovernanceDbContext db) =>
            await db.PolicyCategories.AsNoTracking()
                .OrderBy(c => c.SortOrder)
                .Select(c => new { c.Id, c.Name, c.Description, c.SortOrder })
                .ToListAsync());

        // --- Library writes (staff-only, NOC-55) ---
        api.MapPost("/categories", async (CategoryUpsert input, CallerContext caller, KreweGovernanceDbContext db) =>
        {
            if (!caller.IsStaff) return Results.Forbid();
            if (string.IsNullOrWhiteSpace(input.Name)) return Results.BadRequest(new { error = "name_required" });
            var now = DateTime.UtcNow;
            var category = new PolicyCategory
            {
                Id = Guid.NewGuid(),
                Name = input.Name.Trim(),
                Description = input.Description,
                SortOrder = input.SortOrder ?? 0,
                CreatedAt = now,
                UpdatedAt = now,
            };
            db.PolicyCategories.Add(category);
            await db.SaveChangesAsync();
            return Results.Created($"/api/categories/{category.Id}", new { category.Id });
        });

        api.MapPut("/categories/{id:guid}", async (Guid id, CategoryUpsert input, CallerContext caller, KreweGovernanceDbContext db) =>
        {
            if (!caller.IsStaff) return Results.Forbid();
            var category = await db.PolicyCategories.FindAsync(id);
            if (category is null) return Results.NotFound();
            if (!string.IsNullOrWhiteSpace(input.Name)) category.Name = input.Name.Trim();
            if (input.Description is not null) category.Description = input.Description;
            if (input.SortOrder is not null) category.SortOrder = input.SortOrder.Value;
            category.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Results.Ok(new { category.Id });
        });

        api.MapPost("/policies", async (PolicyCreate input, CallerContext caller, KreweGovernanceDbContext db) =>
        {
            if (!caller.IsStaff) return Results.Forbid();
            if (string.IsNullOrWhiteSpace(input.Title)) return Results.BadRequest(new { error = "title_required" });
            if (!await db.PolicyCategories.AnyAsync(c => c.Id == input.CategoryId))
                return Results.BadRequest(new { error = "unknown_category" });

            var now = DateTime.UtcNow;
            var userId = await ResolveUserIdAsync(caller, db);
            var policy = new Policy
            {
                Id = Guid.NewGuid(),
                Title = input.Title.Trim(),
                Summary = input.Summary,
                Content = input.Content,
                CategoryId = input.CategoryId,
                AssignedClientIds = "[]",
                Status = string.IsNullOrWhiteSpace(input.Status) ? "draft" : input.Status!,
                CurrentVersion = 1,
                CreatedByUserId = userId,
                NextReviewDate = input.NextReviewDate,
                CreatedAt = now,
                UpdatedAt = now,
            };
            db.Policies.Add(policy);
            if (!string.IsNullOrEmpty(input.Content))
                db.PolicyVersions.Add(NewVersion(policy.Id, 1, input.Content, "Initial version.", userId, now));
            await db.SaveChangesAsync();
            return Results.Created($"/api/policies/{policy.Id}", new { policy.Id, policy.CurrentVersion });
        });

        api.MapPut("/policies/{id:guid}", async (Guid id, PolicyUpdate input, CallerContext caller, KreweGovernanceDbContext db) =>
        {
            if (!caller.IsStaff) return Results.Forbid();
            var policy = await db.Policies.FirstOrDefaultAsync(p => p.Id == id);
            if (policy is null) return Results.NotFound();
            if (input.CategoryId is not null)
            {
                if (!await db.PolicyCategories.AnyAsync(c => c.Id == input.CategoryId))
                    return Results.BadRequest(new { error = "unknown_category" });
                policy.CategoryId = input.CategoryId.Value;
            }

            var now = DateTime.UtcNow;
            if (input.Title is not null) policy.Title = input.Title.Trim();
            if (input.Summary is not null) policy.Summary = input.Summary;
            if (input.Status is not null) policy.Status = input.Status;
            if (input.NextReviewDate is not null) policy.NextReviewDate = input.NextReviewDate;

            // Content change is versioned: bump CurrentVersion + snapshot the new body.
            var versionBumped = false;
            if (input.Content is not null && input.Content != policy.Content)
            {
                policy.Content = input.Content;
                policy.CurrentVersion += 1;
                versionBumped = true;
                db.PolicyVersions.Add(NewVersion(
                    policy.Id, policy.CurrentVersion, input.Content,
                    string.IsNullOrWhiteSpace(input.ChangeNotes) ? "Content updated." : input.ChangeNotes,
                    await ResolveUserIdAsync(caller, db), now));
            }
            policy.UpdatedAt = now;
            await db.SaveChangesAsync();
            return Results.Ok(new { policy.Id, policy.CurrentVersion, versionBumped });
        });

        // Replace a policy's wizard variable definitions (staff-only).
        api.MapPut("/policies/{id:guid}/variables", async (
            Guid id, List<VariableDefinition> definitions, CallerContext caller, KreweGovernanceDbContext db) =>
        {
            if (!caller.IsStaff) return Results.Forbid();
            var policy = await db.Policies.Include(p => p.Variables).FirstOrDefaultAsync(p => p.Id == id);
            if (policy is null) return Results.NotFound();
            var invalid = definitions.Where(d => string.IsNullOrWhiteSpace(d.Key)).ToList();
            if (invalid.Count > 0) return Results.BadRequest(new { error = "key_required" });

            db.PolicyVariables.RemoveRange(policy.Variables);
            var sort = 0;
            foreach (var d in definitions)
                db.PolicyVariables.Add(new PolicyVariable
                {
                    PolicyId = policy.Id,
                    Key = d.Key.Trim(),
                    Label = d.Label ?? d.Key,
                    Question = d.Question ?? d.Label ?? d.Key,
                    InputType = string.IsNullOrWhiteSpace(d.InputType) ? "text" : d.InputType!,
                    Options = d.Options,
                    IsUniversal = d.IsUniversal,
                    Required = d.Required,
                    SortOrder = d.SortOrder ?? sort++,
                });
            policy.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Results.Ok(new { policy.Id, count = definitions.Count });
        });

        // --- Variable-collection wizard ---
        // Questions for a policy, pre-filled with the client's existing answers
        // (universal questions first — they're shared across all policies).
        api.MapGet("/policies/{id:guid}/wizard", async (
            Guid id, Guid clientId, CallerContext caller, KreweGovernanceDbContext db, AssemblyService assembly) =>
        {
            if (!caller.CanAccessClient(clientId)) return Results.Forbid();
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
            Guid clientId, List<VariableAnswer> answers, CallerContext caller, KreweGovernanceDbContext db) =>
        {
            if (!caller.CanAccessClient(clientId)) return Results.Forbid();
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

        // --- Assembly (staff runs assembly; clients consume the output) ---
        api.MapPost("/policies/{id:guid}/assemble", async (
            Guid id, AssembleRequest request, CallerContext caller, AssemblyService assembly) =>
        {
            if (!caller.IsStaff) return Results.Forbid();
            var outcome = await assembly.AssembleAsync(id, request.ClientCompanyId, request.AssembledBy);
            return outcome is null ? Results.NotFound() : Results.Ok(outcome);
        });

        api.MapGet("/clients/{clientId:guid}/assembled", async (Guid clientId, CallerContext caller, KreweGovernanceDbContext db) =>
        {
            if (!caller.CanAccessClient(clientId)) return Results.Forbid();
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

        api.MapGet("/assembled/{id:int}", async (int id, CallerContext caller, KreweGovernanceDbContext db) =>
        {
            var assembled = await db.AssembledPolicies.AsNoTracking()
                .Include(a => a.Policy).Include(a => a.ClientCompany)
                .FirstOrDefaultAsync(a => a.Id == id);
            if (assembled is null) return Results.NotFound();
            if (!caller.CanAccessClient(assembled.ClientCompanyId)) return Results.Forbid();
            return Results.Ok(new
            {
                assembled.Id, PolicyTitle = assembled.Policy.Title, Client = assembled.ClientCompany.Name,
                assembled.AssembledContent, assembled.AssembledAt, assembled.AssembledBy,
                assembled.AcknowledgedByClient, assembled.AcknowledgedAt,
            });
        });

        // --- Acknowledgment (Phase 3d: client sign-off; PhinSec sync lands here too) ---
        api.MapPost("/assembled/{id:int}/acknowledge", async (int id, CallerContext caller, KreweGovernanceDbContext db) =>
        {
            var assembled = await db.AssembledPolicies.FindAsync(id);
            if (assembled is null) return Results.NotFound();
            if (!caller.CanAccessClient(assembled.ClientCompanyId)) return Results.Forbid();
            assembled.AcknowledgedByClient = true;
            assembled.AcknowledgedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Results.Ok(new { assembled.Id, assembled.AcknowledgedByClient, assembled.AcknowledgedAt });
        });
    }

    /// <summary>The caller's Users.Id if provisioned; Guid.Empty for tid-based staff (system).</summary>
    private static async Task<Guid> ResolveUserIdAsync(CallerContext caller, KreweGovernanceDbContext db)
    {
        if (caller.ObjectId is null) return Guid.Empty;
        var user = await db.Users.AsNoTracking()
            .FirstOrDefaultAsync(u => u.EntraObjectId == caller.ObjectId && u.IsActive);
        return user?.Id ?? Guid.Empty;
    }

    private static PolicyVersion NewVersion(
        Guid policyId, int number, string content, string? notes, Guid userId, DateTime at) => new()
    {
        Id = Guid.NewGuid(),
        PolicyId = policyId,
        VersionNumber = number,
        Content = content,
        ChangeNotes = notes,
        CreatedByUserId = userId,
        CreatedAt = at,
    };
}

public record WizardQuestion(
    string Key, string Label, string Question, string InputType, string? Options,
    bool IsUniversal, bool Required, int SortOrder, string? CurrentValue);

public record VariableAnswer(string Key, string Value);

public record AssembleRequest(Guid ClientCompanyId, string AssembledBy);

public record CategoryUpsert(string? Name, string? Description, int? SortOrder);

public record PolicyCreate(
    string Title, string? Summary, string? Content, Guid CategoryId, string? Status, DateTime? NextReviewDate);

public record PolicyUpdate(
    string? Title, string? Summary, string? Content, Guid? CategoryId, string? Status,
    DateTime? NextReviewDate, string? ChangeNotes);

public record VariableDefinition(
    string Key, string? Label, string? Question, string? InputType, string? Options,
    bool IsUniversal, bool Required, int? SortOrder);
