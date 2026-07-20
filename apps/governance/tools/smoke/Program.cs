// KREWE Governance smoke test (NOC-54 / milestone R2).
//
// Exercises the live database + a running API instance end-to-end:
//   DB connect → seed (idempotent SQL file) → ensure a TEST client → API health
//   → policy library → wizard round-trip (questions, answer upsert, prefill)
//   → assemble → assembled views → acknowledge.
//
// Touches ONLY the fixed ZZ-TEST client row (D1000000-0000-4000-8000-000000000001)
// plus the idempotent seed rows — never real client data. Prints no secrets.
//
// Env:  KREWE_GOVERNANCE_SQL  (required — connection string; never logged)
//       SMOKE_API_BASE        (default http://127.0.0.1:5099)
// Args: [0] optional path to a seed .sql file to execute before testing.

using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Data.SqlClient;

var connectionString = Environment.GetEnvironmentVariable("KREWE_GOVERNANCE_SQL")
    ?? throw new InvalidOperationException("KREWE_GOVERNANCE_SQL not set");
var apiBase = Environment.GetEnvironmentVariable("SMOKE_API_BASE") ?? "http://127.0.0.1:5099";
var seedPath = args.Length > 0 ? args[0] : null;

var testClientId = Guid.Parse("d1000000-0000-4000-8000-000000000001");
const string TestClientName = "ZZ-TEST Claude Smoke (safe to delete)";

int passed = 0, failed = 0;
void Check(string step, bool ok, string detail = "")
{
    Console.WriteLine($"{(ok ? "PASS" : "FAIL")}  {step}{(detail.Length > 0 ? " — " + detail : "")}");
    if (ok) passed++; else failed++;
}

// ---------- 1. Database ----------
await using var sql = new SqlConnection(connectionString);
await sql.OpenAsync();
Check("db.connect", true, $"server version {sql.ServerVersion}, db [{sql.Database}]");

async Task<int> Scalar(string query)
{
    await using var cmd = new SqlCommand(query, sql);
    return Convert.ToInt32(await cmd.ExecuteScalarAsync());
}

foreach (var t in new[] { "PolicyCategories", "Policies", "PolicyVariables", "PolicyVersions",
                          "ClientCompanies", "ClientVariables", "AssembledPolicies" })
    Console.WriteLine($"      rows {t}: {await Scalar($"SELECT COUNT(*) FROM [{t}]")}");

if (seedPath is not null)
{
    var script = await File.ReadAllTextAsync(seedPath);
    await using var cmd = new SqlCommand(script, sql) { CommandTimeout = 120 };
    await cmd.ExecuteNonQueryAsync();
    Check("db.seed", true, $"executed {Path.GetFileName(seedPath)}; Policies now {await Scalar("SELECT COUNT(*) FROM Policies")}");
}

// Ensure the TEST client exists (fixed GUID; the API has no client-create endpoint).
await using (var cmd = new SqlCommand("""
    IF NOT EXISTS (SELECT 1 FROM ClientCompanies WHERE Id = @id)
        INSERT INTO ClientCompanies (Id, Name, PrimaryContactName, PrimaryContactEmail, Industry,
                                     IsActive, MitpClientId, CreatedAt, UpdatedAt)
        VALUES (@id, @name, NULL, NULL, N'Test', 1, NULL, SYSUTCDATETIME(), SYSUTCDATETIME());
    """, sql))
{
    cmd.Parameters.AddWithValue("@id", testClientId);
    cmd.Parameters.AddWithValue("@name", TestClientName);
    await cmd.ExecuteNonQueryAsync();
}
Check("db.testClient", true, testClientId.ToString());

// ---------- 2. API ----------
using var http = new HttpClient { BaseAddress = new Uri(apiBase), Timeout = TimeSpan.FromSeconds(60) };

// wait for the API to come up (it may still be restoring/compiling)
JsonElement? health = null;
for (var i = 0; i < 60; i++)
{
    try { health = await http.GetFromJsonAsync<JsonElement>("/api/health"); break; }
    catch { await Task.Delay(2000); }
}
Check("api.health", health?.GetProperty("status").GetString() == "ok",
    health is null ? "no response after 120s" : health.Value.ToString());
if (health is null) { Console.WriteLine($"RESULT: {passed} passed, {failed} failed"); return 1; }

var clients = await http.GetFromJsonAsync<JsonElement>("/api/clients");
Check("api.clients", clients.EnumerateArray().Any(c => c.GetProperty("id").GetGuid() == testClientId),
    $"{clients.GetArrayLength()} active client(s); test client visible");

var policies = await http.GetFromJsonAsync<JsonElement>("/api/policies");
var inventory = policies.EnumerateArray()
    .FirstOrDefault(p => p.GetProperty("title").GetString() == "Device & Application Inventory Policy");
Check("api.policies", inventory.ValueKind == JsonValueKind.Object,
    $"{policies.GetArrayLength()} policies; inventory policy found");
var policyId = inventory.GetProperty("id").GetGuid();

var detail = await http.GetFromJsonAsync<JsonElement>($"/api/policies/{policyId}");
var varCount = detail.GetProperty("variables").GetArrayLength();
Check("api.policyDetail", varCount == 7, $"{varCount} variables (expect 7)");

// Wizard: questions (pre-answers)
var wizard = await http.GetFromJsonAsync<JsonElement>($"/api/policies/{policyId}/wizard?clientId={testClientId}");
Check("api.wizard.questions", wizard.GetProperty("questions").GetArrayLength() == 7,
    $"{wizard.GetProperty("questions").GetArrayLength()} questions");

// Wizard: save answers (the full Part B token set)
var answers = new[]
{
    new { key = "Company.LegalName", value = "ZZ-Test Industries, LLC" },
    new { key = "Company.ShortName", value = "ZZ-Test" },
    new { key = "Company.Address", value = "123 Smoke Test Ave, New Orleans, LA" },
    new { key = "IT.Manager", value = "Terry Tester, IT Director" },
    new { key = "IT.ProviderName", value = "NOIT Group" },
    new { key = "Policy.EffectiveDate", value = "2026-08-01" },
    new { key = "Policy.ReviewCadence", value = "annually" },
    new { key = "Training.Frequency", value = "annually, with quarterly phishing sims" },
};
var put = await http.PutAsJsonAsync($"/api/clients/{testClientId}/variables", answers);
Check("api.wizard.saveAnswers", put.IsSuccessStatusCode, $"HTTP {(int)put.StatusCode}");

// Wizard: prefill on revisit
wizard = await http.GetFromJsonAsync<JsonElement>($"/api/policies/{policyId}/wizard?clientId={testClientId}");
var prefilled = wizard.GetProperty("questions").EnumerateArray()
    .Count(q => q.GetProperty("currentValue").ValueKind == JsonValueKind.String);
Check("api.wizard.prefill", prefilled == 7, $"{prefilled}/7 questions prefilled");

// Assemble
var asm = await http.PostAsJsonAsync($"/api/policies/{policyId}/assemble",
    new { clientCompanyId = testClientId, assembledBy = "claude-smoke" });
Check("api.assemble", asm.IsSuccessStatusCode, $"HTTP {(int)asm.StatusCode}");
var outcome = await asm.Content.ReadFromJsonAsync<JsonElement>();
var missing = outcome.GetProperty("missingVariables").GetArrayLength();
var assembledId = outcome.GetProperty("assembledPolicyId").GetInt32();
Check("api.assemble.noMissingVars", missing == 0, $"{missing} missing variables");

// Assembled content is fully substituted
var assembled = await http.GetFromJsonAsync<JsonElement>($"/api/assembled/{assembledId}");
var content = assembled.GetProperty("assembledContent").GetString() ?? "";
Check("api.assembled.substituted",
    !content.Contains("{{") && content.Contains("ZZ-Test Industries, LLC"),
    $"content {content.Length} chars, no {{{{tokens}}}} left");

// Acknowledge
var ack = await http.PostAsync($"/api/assembled/{assembledId}/acknowledge", null);
var ackBody = await ack.Content.ReadFromJsonAsync<JsonElement>();
Check("api.acknowledge", ack.IsSuccessStatusCode && ackBody.GetProperty("acknowledgedByClient").GetBoolean());

// Client's assembled list reflects it
var list = await http.GetFromJsonAsync<JsonElement>($"/api/clients/{testClientId}/assembled");
Check("api.assembledList", list.EnumerateArray().Any(a =>
        a.GetProperty("id").GetInt32() == assembledId &&
        a.GetProperty("acknowledgedByClient").GetBoolean()),
    $"{list.GetArrayLength()} assembled record(s) for test client");

// ---------- 3. Library writes (NOC-55; requires the API to run with KREWE_AUTH_DISABLED=true,
//                which the smoke harness does — the bypass acts as NOIT staff) ----------
var catResp = await http.PostAsJsonAsync("/api/categories",
    new { name = "ZZ-TEST Category (safe to delete)", sortOrder = 999 });
Check("api.write.category", catResp.StatusCode == System.Net.HttpStatusCode.Created, $"HTTP {(int)catResp.StatusCode}");
var catId = (await catResp.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

var polResp = await http.PostAsJsonAsync("/api/policies", new
{
    title = "ZZ-TEST Policy (safe to delete)",
    summary = "Smoke-test policy.",
    content = "Hello {{Company.ShortName}} v1.",
    categoryId = catId,
});
Check("api.write.policy", polResp.StatusCode == System.Net.HttpStatusCode.Created, $"HTTP {(int)polResp.StatusCode}");
var newPolicyId = (await polResp.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

var updResp = await http.PutAsJsonAsync($"/api/policies/{newPolicyId}", new
{
    content = "Hello {{Company.ShortName}} v2.",
    changeNotes = "Smoke: content bump.",
});
var upd = await updResp.Content.ReadFromJsonAsync<JsonElement>();
Check("api.write.versionBump",
    updResp.IsSuccessStatusCode && upd.GetProperty("currentVersion").GetInt32() == 2 && upd.GetProperty("versionBumped").GetBoolean(),
    $"CurrentVersion={upd.GetProperty("currentVersion").GetInt32()}");

var versions = await http.GetFromJsonAsync<JsonElement>($"/api/policies/{newPolicyId}/versions");
Check("api.write.versionHistory", versions.GetArrayLength() == 2, $"{versions.GetArrayLength()} versions (expect 2)");

var defsResp = await http.PutAsJsonAsync($"/api/policies/{newPolicyId}/variables", new[]
{
    new { key = "Company.ShortName", label = "Company short name",
          question = "What short name should policies use in-text?",
          inputType = "text", isUniversal = true, required = true },
});
Check("api.write.variables", defsResp.IsSuccessStatusCode,
    $"HTTP {(int)defsResp.StatusCode}");

var newDetail = await http.GetFromJsonAsync<JsonElement>($"/api/policies/{newPolicyId}");
Check("api.write.variablesPersisted", newDetail.GetProperty("variables").GetArrayLength() == 1);

Console.WriteLine($"RESULT: {passed} passed, {failed} failed");
return failed == 0 ? 0 : 1;
