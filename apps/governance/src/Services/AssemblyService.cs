// The assembly engine (NOC-19 deliverable #5, reconstructed): merges a client's
// collected variable answers into a policy template and persists the result as
// an AssembledPolicy row in the existing krewe-governance-db.

using Microsoft.EntityFrameworkCore;
using NOIT.KreweGovernance.Data;
using NOIT.KreweGovernance.Domain;

namespace NOIT.KreweGovernance.Services;

public class AssemblyService(KreweGovernanceDbContext db)
{
    public async Task<AssemblyOutcome?> AssembleAsync(
        Guid policyId, Guid clientCompanyId, string assembledBy, CancellationToken ct = default)
    {
        var policy = await db.Policies.AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == policyId, ct);
        var client = await db.ClientCompanies.AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == clientCompanyId, ct);
        if (policy is null || client is null || string.IsNullOrEmpty(policy.Content))
            return null;

        var values = await GetClientValuesAsync(clientCompanyId, ct);
        var result = TemplateEngine.Render(policy.Content, values);

        var assembled = new AssembledPolicy
        {
            PolicyId = policy.Id,
            ClientCompanyId = client.Id,
            AssembledContent = result.Content,
            AssembledAt = DateTime.UtcNow,
            AssembledBy = assembledBy,
            AcknowledgedByClient = false,
        };
        db.AssembledPolicies.Add(assembled);
        await db.SaveChangesAsync(ct);

        return new AssemblyOutcome(assembled.Id, policy.Title, client.Name, result.MissingVariables);
    }

    /// <summary>A client's collected answers as a case-insensitive key→value map (latest value wins).</summary>
    public async Task<Dictionary<string, string>> GetClientValuesAsync(
        Guid clientCompanyId, CancellationToken ct = default)
    {
        var rows = await db.ClientVariables.AsNoTracking()
            .Where(v => v.ClientCompanyId == clientCompanyId)
            .OrderBy(v => v.UpdatedAt ?? v.CollectedAt)
            .ToListAsync(ct);

        var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var row in rows)
            map[row.Key] = row.Value;
        return map;
    }
}

public record AssemblyOutcome(
    int AssembledPolicyId,
    string PolicyTitle,
    string ClientName,
    IReadOnlyList<string> MissingVariables);
