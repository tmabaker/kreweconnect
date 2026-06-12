namespace NOIT.ClientTools.Core.DTOs;

public record PagedResult<T>
{
    public IReadOnlyList<T> Data { get; init; } = Array.Empty<T>();
    public PaginationInfo Pagination { get; init; } = new();
}

public record PaginationInfo
{
    public int Page { get; init; } = 1;
    public int PageSize { get; init; } = 25;
    public int TotalItems { get; init; }
    public int TotalPages => PageSize > 0 ? (int)Math.Ceiling((double)TotalItems / PageSize) : 0;
    public bool HasNext => Page < TotalPages;
    public bool HasPrevious => Page > 1;
}
