using NOIT.ClientTools.Core.DTOs;
using NOIT.ClientTools.Core.Enums;

namespace NOIT.ClientTools.Core.Interfaces;

public interface IContractService
{
    Task<PagedResult<ContractListDto>> GetAllAsync(
        int? tenantId,
        string? search,
        ContractType? contractType,
        ContractStatus? status,
        string? vendorName,
        string sortBy,
        string sortDir,
        int page,
        int pageSize,
        CancellationToken ct = default);

    Task<ContractDetailDto?> GetByIdAsync(Guid id, CancellationToken ct = default);

    Task<ContractDetailDto> CreateAsync(CreateContractRequest request, CancellationToken ct = default);

    Task<ContractDetailDto?> UpdateAsync(Guid id, UpdateContractRequest request, CancellationToken ct = default);

    Task<bool> DeleteAsync(Guid id, CancellationToken ct = default);

    Task<List<ContractVersionDto>> GetVersionsAsync(Guid contractId, CancellationToken ct = default);

    Task<ContractDocumentDto> AddDocumentAsync(Guid contractId, UploadDocumentRequest request, CancellationToken ct = default);

    Task<List<ContractDocumentDto>> GetDocumentsAsync(Guid contractId, CancellationToken ct = default);

    Task<ContractDashboardDto> GetDashboardAsync(int? tenantId, CancellationToken ct = default);

    Task<List<TagDto>> GetTagsAsync(CancellationToken ct = default);

    Task<TagDto> CreateTagAsync(CreateTagRequest request, CancellationToken ct = default);
}
