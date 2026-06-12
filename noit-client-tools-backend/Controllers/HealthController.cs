using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NOIT.ClientTools.Infrastructure.Data;

namespace NOIT.ClientTools.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[AllowAnonymous]
public class HealthController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IConfiguration _configuration;

    public HealthController(AppDbContext db, IConfiguration configuration)
    {
        _db = db;
        _configuration = configuration;
    }

    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var dbHealthy = false;
        try
        {
            dbHealthy = await _db.Database.CanConnectAsync();
        }
        catch { /* DB unreachable */ }

        return Ok(new
        {
            status = dbHealthy ? "healthy" : "degraded",
            timestamp = DateTime.UtcNow,
            version = "1.0.0",
            environment = _configuration["ASPNETCORE_ENVIRONMENT"] ?? "Unknown",
            checks = new
            {
                database = dbHealthy ? "connected" : "unavailable",
                // redis = "not_configured" // TODO: add Redis health check
            }
        });
    }
}
