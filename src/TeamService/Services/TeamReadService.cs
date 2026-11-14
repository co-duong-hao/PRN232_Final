using Exe.Contracts;
using Exe.Shared.Web.Auth;
using Exe.Shared.Web.Errors;
using Exe.Shared.Web.Paging;
using Exe.TeamService.Data;
using Exe.TeamService.Domain;
using Exe.TeamService.Dtos;
using Microsoft.EntityFrameworkCore;

namespace Exe.TeamService.Services;

public sealed class TeamReadService(TeamDbContext db, ICurrentUser user, RoomService rooms) : ITeamReadService, IGroupService
{
    private bool IsStaff => user.IsInRole(Roles.Admin) || user.IsInRole(Roles.HeadOfDepartment) || user.IsInRole(Roles.Lecturer);

    private async Task CheckCourseAsync(Guid id, CancellationToken ct)
    {
        if (!await db.Courses.AnyAsync(x => x.Id == id, ct))
        {
            throw new NotFoundException("Không tìm thấy Course.");
        }
        if (!IsStaff && user.IsInRole(Roles.Student))
        {
            var student = await rooms.CurrentStudentAsync(ct);
            await rooms.CheckEnrollmentAsync(id, student.Id, ct);
        }
    }

    private static PagedResult<TOut> MapPage<TIn, TOut>(PagedResult<TIn> page, Func<TIn, TOut> map)
    {
        return new PagedResult<TOut>(page.Items.Select(map).ToArray(), page.Page, page.PageSize, page.TotalItems);
    }

    public async Task<PagedResult<RoomSummaryDto>> RoomsAsync(Guid courseId, RoomListQuery query, CancellationToken ct)
    {
        await CheckCourseAsync(courseId, ct);
        var source = db.Rooms.Where(x => x.CourseId == courseId).Include(x => x.Course).Include(x => x.Leader)
            .Include(x => x.Members).ThenInclude(x => x.Student).ThenInclude(x => x.Major).AsQueryable();
        if (!string.IsNullOrWhiteSpace(query.Q))
        {
            source = source.Where(x => x.Code.Contains(query.Q));
        }
        if (Enum.TryParse<RoomStatus>(query.Status, true, out var status))
        {
            source = source.Where(x => x.Status == status);
        }
        source = query.SortBy?.ToLowerInvariant() switch
        {
            "createdat" => query.Descending ? source.OrderByDescending(x => x.CreatedAt) : source.OrderBy(x => x.CreatedAt),
            "membercount" => query.Descending ? source.OrderByDescending(x => x.MemberCount) : source.OrderBy(x => x.MemberCount),
            _ => query.Descending ? source.OrderByDescending(x => x.Code) : source.OrderBy(x => x.Code)
        };
        return MapPage(await source.ToPagedResultAsync(query, ct), x => new RoomSummaryDto(x.Id, x.Code, x.Status.ToString(), x.MemberCount, x.Leader.FullName,
            x.Members.GroupBy(m => m.Student.Major.Code).Select(m => new MajorCountDto(m.Key, m.Count())).ToArray(), x.CreatedAt));
    }

    private static ApplyDto MapApply(RoomApply x)
    {
        return new ApplyDto(x.Id, x.RoomId, x.Room.Code, x.StudentId, x.Student.StudentCode, x.Student.FullName,
            x.Student.Major.Code, x.Message, x.Status.ToString(), x.DecidedAt, x.CreatedAt);
    }

    private async Task<PagedResult<ApplyDto>> AppliesAsync(IQueryable<RoomApply> source, ApplyListQuery query, CancellationToken ct)
    {
        source = source.Include(x => x.Room).Include(x => x.Student).ThenInclude(x => x.Major);
        if (Enum.TryParse<ApplyStatus>(query.Status, true, out var status))
        {
            source = source.Where(x => x.Status == status);
        }
        if (query.CourseId.HasValue)
        {
            source = source.Where(x => x.Room.CourseId == query.CourseId);
        }
        source = string.Equals(query.SortDir, "asc", StringComparison.OrdinalIgnoreCase)
            ? source.OrderBy(x => x.CreatedAt) : source.OrderByDescending(x => x.CreatedAt);
        return MapPage(await source.ToPagedResultAsync(query, ct), MapApply);
    }

    public async Task<PagedResult<ApplyDto>> RoomAppliesAsync(Guid roomId, ApplyListQuery query, CancellationToken ct)
    {
        var room = await rooms.LoadRoomAsync(roomId, ct);
        if (!IsStaff)
        {
            var student = await rooms.CurrentStudentAsync(ct);
            await rooms.CheckEnrollmentAsync(room.CourseId, student.Id, ct);
            RoomService.CheckLeader(room, student);
        }
        return await AppliesAsync(db.RoomApplies.Where(x => x.RoomId == roomId), query, ct);
    }

    public async Task<PagedResult<ApplyDto>> MyAppliesAsync(ApplyListQuery query, CancellationToken ct)
    {
        var student = await rooms.CurrentStudentAsync(ct);
        return await AppliesAsync(db.RoomApplies.Where(x => x.StudentId == student.Id), query, ct);
    }

    private static GroupDto MapGroup(Group group)
    {
        return new GroupDto(group.Id, group.Code, group.Name, group.CourseId, group.Course.Code, group.RoomId,
            group.GroupTypeId, group.GroupType.Name, group.CreatedAt, group.Members.Select(x => new GroupMemberDto(x.StudentId,
                x.Student.StudentCode, x.Student.FullName, x.Student.Major.Code, x.IsLeader)).ToArray());
    }

    private IQueryable<Group> GroupQuery()
    {
        return db.Groups.Include(x => x.Course).Include(x => x.GroupType)
            .Include(x => x.Members).ThenInclude(x => x.Student).ThenInclude(x => x.Major);
    }

    public async Task<PagedResult<GroupDto>> GroupsAsync(Guid courseId, PageQuery query, CancellationToken ct)
    {
        if (!await db.Courses.AnyAsync(x => x.Id == courseId, ct))
        {
            throw new NotFoundException("Không tìm thấy Course.");
        }
        var source = GroupQuery().Where(x => x.CourseId == courseId);
        if (!string.IsNullOrWhiteSpace(query.Q))
        {
            source = source.Where(x => x.Code.Contains(query.Q));
        }
        source = string.Equals(query.SortBy, "createdAt", StringComparison.OrdinalIgnoreCase)
            ? (query.Descending ? source.OrderByDescending(x => x.CreatedAt) : source.OrderBy(x => x.CreatedAt))
            : (query.Descending ? source.OrderByDescending(x => x.Code) : source.OrderBy(x => x.Code));
        return MapPage(await source.ToPagedResultAsync(query, ct), MapGroup);
    }

    public async Task<GroupDto> GroupAsync(Guid id, CancellationToken ct)
    {
        var group = await GroupQuery().SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw new NotFoundException("Không tìm thấy nhóm.");
        return MapGroup(group);
    }
}
