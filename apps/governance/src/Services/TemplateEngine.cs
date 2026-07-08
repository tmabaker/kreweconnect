// The {{variable_key}} template engine (NOC-19 deliverable #3, reconstructed).
// Substitutes tokens from a key→value map; unresolved tokens are left visible in
// the output and reported as missing (NOC-19's "missingVariables[]" — the live
// schema has no column for it, so it travels in the API response, not the DB).

using System.Text.RegularExpressions;

namespace NOIT.KreweGovernance.Services;

public static class TemplateEngine
{
    private static readonly Regex TokenPattern =
        new(@"\{\{\s*([A-Za-z0-9_.\-]+)\s*\}\}", RegexOptions.Compiled);

    public static TemplateResult Render(string template, IReadOnlyDictionary<string, string> values)
    {
        var missing = new SortedSet<string>(StringComparer.OrdinalIgnoreCase);

        var content = TokenPattern.Replace(template, m =>
        {
            var key = m.Groups[1].Value;
            if (values.TryGetValue(key, out var value) && !string.IsNullOrWhiteSpace(value))
                return value;
            missing.Add(key);
            return m.Value;
        });

        return new TemplateResult(content, missing.ToList());
    }

    /// <summary>Extract the distinct token keys a template references.</summary>
    public static IReadOnlyList<string> ExtractKeys(string template) =>
        TokenPattern.Matches(template)
            .Select(m => m.Groups[1].Value)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
}

public record TemplateResult(string Content, IReadOnlyList<string> MissingVariables);
