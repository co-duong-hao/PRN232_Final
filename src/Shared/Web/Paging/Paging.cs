using Microsoft.EntityFrameworkCore;

namespace Exe.Shared.Web.Paging;

/// <summary>
/// Common list query parameters: <c>?page=1&amp;pageSize=20&amp;sortBy=code&amp;sortDir=desc&amp;q=text</c>.
/// Bind with <c>[FromQuery] PageQuery query</c>; derive from it to add filters.
/// </summary>
public class PageQuery
{
    public const int DefaultPageSize = 20;
    public const int MaxPageSize = 100;

    private int _page = 1;
    private int _pageSize = DefaultPageSize;

    /// <summary>1-based.</summary>
    public int Page
    {
        get => _page;
        set => _page = value < 1 ? 1 : value;
    }

    public int PageSize
    {
        get => _pageSize;
        set => _pageSize = value < 1 ? DefaultPageSize : Math.Min(value, MaxPageSize);
    }

    /// <summary>Field name, case-insensitive. Each endpoint documents the fields it accepts.</summary>
    public string? SortBy { get; set; }

    /// <summary>"asc" (default) or "desc".</summary>
    public string? SortDir { get; set; }

    /// <summary>Free-text search.</summary>
    public string? Q { get; set; }

    public bool Descending => string.Equals(SortDir, "desc", StringComparison.OrdinalIgnoreCase);
}

public sealed record PagedResult<T>(IReadOnlyList<T> Items, int Page, int PageSize, int TotalItems)
{
    public int TotalPages => PageSize <= 0 ? 0 : (int)Math.Ceiling(TotalItems / (double)PageSize);
}

public static class PagingExtensions
{
    /// <summary>Counts, then fetches one page. Apply filtering and ordering before calling.</summary>
    public static async Task<PagedResult<T>> ToPagedResultAsync<T>(
        this IQueryable<T> query, PageQuery page, CancellationToken cancellationToken = default)
    {
        var total = await query.CountAsync(cancellationToken);
        var items = await query
            .Skip((page.Page - 1) * page.PageSize)
            .Take(page.PageSize)
            .ToListAsync(cancellationToken);
        return new PagedResult<T>(items, page.Page, page.PageSize, total);
    }
}
