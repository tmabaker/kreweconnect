using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NOIT.ClientTools.Core.DTOs;
using NOIT.ClientTools.Core.Enums;
using NOIT.ClientTools.Core.Models;
using NOIT.ClientTools.Infrastructure.Data;

namespace NOIT.ClientTools.Api.Controllers;

[ApiController]
[Route("api/v1/[controller]")]
[Authorize]
public class UsersController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ILogger<UsersController> _logger;

    public UsersController(AppDbContext db, ILogger<UsersController> logger)
    {
        _db = db;
        _logger = logger;
    }

    /// <summary>
    /// Get the current authenticated user's profile.
    /// Auto-provisions the user record on first login.
    /// </summary>
    [HttpGet("me")]
    public async Task<IActionResult> GetMe()
    {
        var oid = User.FindFirst("http://schemas.microsoft.com/identity/claims/objectidentifier")?.Value
            ?? User.FindFirst("oid")?.Value;
        var email = User.FindFirst(ClaimTypes.Email)?.Value
            ?? User.FindFirst("preferred_username")?.Value
            ?? "unknown@noitgroup.com";
        var name = User.FindFirst("name")?.Value
            ?? User.FindFirst(ClaimTypes.Name)?.Value
            ?? email;

        if (string.IsNullOrEmpty(oid))
        {
            return Unauthorized(new { error = new { code = "MISSING_OID", message = "Token missing object identifier claim." } });
        }

        var entraId = Guid.Parse(oid);

        // Auto-provision user on first login
        var user = await _db.AppUsers
            .Include(u => u.TenantAccess)
                .ThenInclude(ta => ta.ClientTenant)
            .FirstOrDefaultAsync(u => u.EntraObjectId == entraId);

        if (user == null)
        {
            _logger.LogInformation("Auto-provisioning new user: {Email} ({Oid})", email, oid);

            user = new AppUser
            {
                EntraObjectId = entraId,
                Email = email,
                DisplayName = name,
                Role = AppUserRole.Staff, // Default role; admins set manually
                IsActive = true,
                LastLoginAt = DateTime.UtcNow,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
            };

            _db.AppUsers.Add(user);
            await _db.SaveChangesAsync();

            // Reload with includes
            user = await _db.AppUsers
                .Include(u => u.TenantAccess)
                    .ThenInclude(ta => ta.ClientTenant)
                .FirstAsync(u => u.Id == user.Id);
        }
        else
        {
            // Update last login
            user.LastLoginAt = DateTime.UtcNow;
            user.DisplayName = name;
            user.Email = email;
            user.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();
        }

        return Ok(new CurrentUserDto
        {
            Id = user.Id,
            EntraObjectId = user.EntraObjectId,
            Email = user.Email,
            DisplayName = user.DisplayName,
            Role = user.Role,
            IsActive = user.IsActive,
            LastLoginAt = user.LastLoginAt,
            TenantAccess = user.TenantAccess.Select(ta => new TenantAccessDto
            {
                ClientTenantId = ta.ClientTenantId,
                TenantId = ta.ClientTenant.TenantId,
                DisplayName = ta.ClientTenant.DisplayName,
                AccessLevel = ta.AccessLevel,
            }).ToList(),
        });
    }

    /// <summary>
    /// List all users. Admin only.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetUsers([FromQuery] int page = 1, [FromQuery] int pageSize = 25)
    {
        var totalItems = await _db.AppUsers.CountAsync();

        var users = await _db.AppUsers
            .AsNoTracking()
            .OrderBy(u => u.DisplayName)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(u => new
            {
                u.Id,
                u.EntraObjectId,
                u.Email,
                u.DisplayName,
                u.Role,
                u.IsActive,
                u.LastLoginAt,
                u.CreatedAt,
            })
            .ToListAsync();

        return Ok(new { data = users, pagination = new PaginationInfo { Page = page, PageSize = pageSize, TotalItems = totalItems } });
    }
}
