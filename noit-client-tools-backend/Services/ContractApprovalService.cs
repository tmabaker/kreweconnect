using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using NOIT.ClientTools.Core.DTOs;
using NOIT.ClientTools.Core.Enums;
using NOIT.ClientTools.Core.Interfaces;
using NOIT.ClientTools.Core.Models;
using NOIT.ClientTools.Infrastructure.Data;

namespace NOIT.ClientTools.Infrastructure.Services;

public class ContractApprovalService : IContractApprovalService
{
    private readonly AppDbContext _db;
    private readonly ILogger<ContractApprovalService> _logger;

    public ContractApprovalService(AppDbContext db, ILogger<ContractApprovalService> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async Task<ContractApprovalDto> RequestApprovalAsync(Guid contractId, ContractApprovalRequest request, CancellationToken ct = default)
    {
        var contract = await _db.Contracts.FirstOrDefaultAsync(c => c.Id == contractId, ct)
            ?? throw new InvalidOperationException("Contract not found");

        contract.Status = ContractStatus.UnderReview;
        contract.UpdatedAt = DateTime.UtcNow;

        var approval = new ContractApproval
        {
            Id = Guid.NewGuid(),
            ContractId = contractId,
            Status = ApprovalStatus.Pending,
            RequestedAt = DateTime.UtcNow,
            Comments = request.Comments,
        };

        _db.ContractApprovals.Add(approval);
        await _db.SaveChangesAsync(ct);

        return new ContractApprovalDto
        {
            Id = approval.Id,
            ContractId = approval.ContractId,
            RequestedById = approval.RequestedById,
            Status = approval.Status,
            RequestedAt = approval.RequestedAt,
            Comments = approval.Comments,
        };
    }

    public async Task<ContractApprovalDto?> ResolveApprovalAsync(Guid approvalId, ApprovalDecisionRequest request, CancellationToken ct = default)
    {
        var approval = await _db.ContractApprovals
            .Include(a => a.Contract)
            .FirstOrDefaultAsync(a => a.Id == approvalId, ct);

        if (approval == null) return null;

        approval.Status = request.Decision;
        approval.ResolvedAt = DateTime.UtcNow;
        approval.Comments = request.Comments ?? approval.Comments;

        // Update contract status based on decision
        if (request.Decision == ApprovalStatus.Approved)
            approval.Contract.Status = ContractStatus.Active;
        else if (request.Decision == ApprovalStatus.Rejected)
            approval.Contract.Status = ContractStatus.Draft;

        approval.Contract.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);

        return new ContractApprovalDto
        {
            Id = approval.Id,
            ContractId = approval.ContractId,
            RequestedById = approval.RequestedById,
            ApprovedById = approval.ApprovedById,
            Status = approval.Status,
            RequestedAt = approval.RequestedAt,
            ResolvedAt = approval.ResolvedAt,
            Comments = approval.Comments,
        };
    }

    public async Task<List<ContractApprovalDto>> GetApprovalsForContractAsync(Guid contractId, CancellationToken ct = default)
    {
        return await _db.ContractApprovals
            .Where(a => a.ContractId == contractId)
            .OrderByDescending(a => a.RequestedAt)
            .Select(a => new ContractApprovalDto
            {
                Id = a.Id,
                ContractId = a.ContractId,
                RequestedById = a.RequestedById,
                ApprovedById = a.ApprovedById,
                Status = a.Status,
                RequestedAt = a.RequestedAt,
                ResolvedAt = a.ResolvedAt,
                Comments = a.Comments,
            })
            .AsNoTracking()
            .ToListAsync(ct);
    }
}
