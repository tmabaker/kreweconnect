using NOIT.ClientTools.Core.DTOs;

namespace NOIT.ClientTools.Core.Interfaces;

public interface IContractApprovalService
{
    Task<ContractApprovalDto> RequestApprovalAsync(Guid contractId, ContractApprovalRequest request, CancellationToken ct = default);
    Task<ContractApprovalDto?> ResolveApprovalAsync(Guid approvalId, ApprovalDecisionRequest request, CancellationToken ct = default);
    Task<List<ContractApprovalDto>> GetApprovalsForContractAsync(Guid contractId, CancellationToken ct = default);
}
