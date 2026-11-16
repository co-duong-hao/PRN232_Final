using Exe.Shared.Web.Paging;
using Exe.TeamService.Dtos;

namespace Exe.TeamService.Services;

public sealed class RoomListQuery : PageQuery
{
    public string? Status { get; set; }
    public decimal? Gpa { get; set; }
    public Guid[]? RoleIds { get; set; }
}

public sealed class ApplyListQuery : PageQuery
{
    public string? Status { get; set; }
    public Guid? CourseId { get; set; }
}

public interface ITeamReadService
{
    Task<PagedResult<RoomSummaryDto>> RoomsAsync(Guid courseId, RoomListQuery query, CancellationToken ct);
    Task<PagedResult<ApplyDto>> RoomAppliesAsync(Guid roomId, ApplyListQuery query, CancellationToken ct);
    Task<PagedResult<ApplyDto>> MyAppliesAsync(ApplyListQuery query, CancellationToken ct);
}

public interface IGroupService
{
    Task<PagedResult<GroupDto>> GroupsAsync(Guid courseId, PageQuery query, CancellationToken ct);
    Task<GroupDto> GroupAsync(Guid id, CancellationToken ct);
}
