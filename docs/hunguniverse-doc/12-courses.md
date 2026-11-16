# Quản lý Course

Tài liệu tham chiếu cho PRN232 Final v0.4 tại commit 2e3789f.

[Mục lục bộ tài liệu](01-architecture.md)

## Cách hoạt động

Course được nhận diện theo học kỳ và môn. Tài khoản có quyền thích hợp tạo, mở hoặc đóng ghép nhóm.

Danh sách sinh viên của Course tách khỏi hồ sơ Auth. Thống kê `StudentsInRoom` và `StudentsInGroup` đo hai tập hợp có ý nghĩa khác nhau.

Danh sách Course của sinh viên nối ghi danh với phòng và nhóm hiện tại. Một sinh viên có thể hiện diện trong nhiều Course.

## Cách kiểm tra

1. Dùng hai vai trò khác nhau gọi API quản lý Course để đối chiếu quyền.
2. Thử mở một Course thử mới rồi kiểm tra `Forming` và thao tác có thể thực hiện từ tài khoản đã ghi danh.

## Đối chiếu mã nguồn

Các trích đoạn dưới đây hỗ trợ tra cứu. Đường dẫn mở phần tương ứng trong repo.

### CoursesController.cs

Các endpoint Course, roster và thống kê.

[src/TeamService/Controllers/CoursesController.cs dòng 1–78](../../src/TeamService/Controllers/CoursesController.cs#L1-L78)

~~~csharp
using Exe.Contracts;
using Exe.TeamService.Infrastructure.Caching;
using Exe.Shared.Web.Paging;
using Exe.TeamService.Dtos;
using Exe.TeamService.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Exe.TeamService.Controllers;

[ApiController]
[Authorize]
[Route("api/courses")]
public sealed class CoursesController(ICourseService service, ITeamCache cache, IConfiguration configuration) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] CourseQuery query, CancellationToken ct) => Ok(await service.ListAsync(query, ct));

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct) => Ok(await service.GetAsync(id, ct));

    [HttpPost]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Create(CourseRequest request, CancellationToken ct)
    {
        var course = await service.CreateAsync(request, ct);
        return CreatedAtAction(nameof(Get), new { id = course.Id }, course);
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = Roles.AdminOrHead)]
    public async Task<IActionResult> Update(Guid id, UpdateCourseRequest request, CancellationToken ct) => Ok(await service.UpdateAsync(id, request, ct));

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await service.DeleteAsync(id, ct);
        return NoContent();
    }

    [HttpPost("{id:guid}/open")]
    [Authorize(Roles = Roles.AdminOrHead)]
    public async Task<IActionResult> Open(Guid id, CancellationToken ct) => Ok(await service.TransitionAsync(id, true, ct));

    [HttpPost("{id:guid}/close")]
    [Authorize(Roles = Roles.AdminOrHead)]
    public async Task<IActionResult> Close(Guid id, CancellationToken ct) => Ok(await service.TransitionAsync(id, false, ct));

    [HttpGet("{id:guid}/students")]
    [Authorize(Roles = Roles.Staff)]
    public async Task<IActionResult> Students(Guid id, [FromQuery] CourseStudentQuery query, CancellationToken ct) => Ok(await service.StudentsAsync(id, query, ct));

    [HttpPost("{id:guid}/students")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Enroll(Guid id, EnrollRequest request, CancellationToken ct) => Ok(await service.EnrollAsync(id, request.StudentIds, ct));

    [HttpDelete("{id:guid}/students/{studentId:guid}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Remove(Guid id, Guid studentId, CancellationToken ct)
    {
        await service.RemoveStudentAsync(id, studentId, ct);
        return NoContent();
    }

    [HttpGet("{id:guid}/stats")]
    [Authorize(Roles = Roles.Staff)]
    public async Task<IActionResult> Stats(Guid id, CancellationToken ct)
    {
        var (value, hit) = await cache.GetOrCreateAsync(TeamCacheKeys.CourseStats(id), TimeSpan.FromSeconds(configuration.GetValue("Cache:CourseStatsSeconds", 30)), token => service.StatsAsync(id, token), ct);
        Response.Headers["X-Cache"] = hit ? "HIT" : "MISS";
        return Ok(value);
    }

    [HttpGet("/api/me/courses")]
    [Authorize(Roles = Roles.Student)]
    public async Task<IActionResult> Mine([FromQuery] PageQuery query, CancellationToken ct) => Ok(await service.MyCoursesAsync(query, ct));
}
~~~

### CourseService.cs

Đọc, tạo, chuyển trạng thái, ghi danh và trả thống kê.

[src/TeamService/Services/CourseService.cs dòng 1–233](../../src/TeamService/Services/CourseService.cs#L1-L233)

~~~csharp
using Exe.Contracts.Events;
using Exe.TeamService.Infrastructure.Caching;
using Exe.Shared.Web.Errors;
using Exe.Shared.Web.Paging;
using Exe.TeamService.Abstractions;
using Exe.TeamService.Data;
using Exe.TeamService.Domain;
using Exe.TeamService.Dtos;
using Microsoft.EntityFrameworkCore;

namespace Exe.TeamService.Services;

public sealed class CourseService(TeamDbContext db, RoomService rooms, IEventPublisher publisher, ITeamCache cache) : ICourseService
{
    private IQueryable<CourseDto> Courses() => db.Courses.Select(x => new CourseDto { Id = x.Id, Code = x.Code, SemesterId = x.SemesterId, SubjectId = x.SubjectId, GroupTypeId = x.GroupTypeId, GroupTypeName = x.GroupType.Name, Status = x.Status.ToString(), StartTime = x.StartTime, Deadline = x.Deadline, StudentCount = db.StudentInCourses.Count(s => s.CourseId == x.Id) });

    private async Task<Course> EntityAsync(Guid id, CancellationToken ct)
    {
        return await db.Courses.SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw new NotFoundException("Không tìm thấy Course.");
    }

    private static void ValidateDates(DateTime start, DateTime deadline)
    {
        if (deadline <= start)
        {
            throw new BadRequestException("Hạn ghép nhóm phải sau thời gian bắt đầu.");
        }
    }

    public async Task<PagedResult<CourseDto>> ListAsync(CourseQuery query, CancellationToken ct)
    {
        var source = db.Courses.AsQueryable();
        if (query.SemesterId.HasValue)
        {
            source = source.Where(x => x.SemesterId == query.SemesterId);
        }
        if (query.SubjectId.HasValue)
        {
            source = source.Where(x => x.SubjectId == query.SubjectId);
        }
        if (Enum.TryParse<CourseStatus>(query.Status, true, out var status))
        {
            source = source.Where(x => x.Status == status);
        }
        if (!string.IsNullOrWhiteSpace(query.Q))
        {
            source = source.Where(x => x.Code.Contains(query.Q));
        }
        source = string.Equals(query.SortBy, "deadline", StringComparison.OrdinalIgnoreCase)
            ? (query.Descending ? source.OrderByDescending(x => x.Deadline) : source.OrderBy(x => x.Deadline))
            : (query.Descending ? source.OrderByDescending(x => x.Code) : source.OrderBy(x => x.Code));
        var result = await source.Select(x => new CourseDto(x.Id, x.Code, x.SemesterId, x.SubjectId, x.GroupTypeId,
            x.GroupType.Name, x.Status.ToString(), x.StartTime, x.Deadline, db.StudentInCourses.Count(s => s.CourseId == x.Id)))
            .ToPagedResultAsync(query, ct);
        return result;
    }

    public async Task<CourseDto> GetAsync(Guid id, CancellationToken ct)
    {
        return await Courses().SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw new NotFoundException("Không tìm thấy Course.");
    }

    public async Task<CourseDto> CreateAsync(CourseRequest request, CancellationToken ct)
    {
        ValidateDates(request.StartTime, request.Deadline);
        var semester = await db.Semesters.SingleOrDefaultAsync(x => x.Id == request.SemesterId, ct) ?? throw new NotFoundException("Không tìm thấy học kỳ.");
        var subject = await db.Subjects.SingleOrDefaultAsync(x => x.Id == request.SubjectId, ct) ?? throw new NotFoundException("Không tìm thấy môn học.");
        if (!await db.GroupTypes.AnyAsync(x => x.Id == request.GroupTypeId, ct))
        {
            throw new NotFoundException("Không tìm thấy loại nhóm.");
        }
        if (await db.Courses.AnyAsync(x => x.SemesterId == request.SemesterId && x.SubjectId == request.SubjectId, ct))
        {
            throw new BusinessRuleException("COURSE_EXISTS", "Course đã tồn tại.");
        }
        var course = new Course { SemesterId = request.SemesterId, SubjectId = request.SubjectId, GroupTypeId = request.GroupTypeId,
            Code = $"{semester.Code}-{subject.Code}", StartTime = request.StartTime.ToUniversalTime(), Deadline = request.Deadline.ToUniversalTime(), Status = CourseStatus.Planned };
        db.Courses.Add(course);
        await db.SaveChangesAsync(ct);
        return await GetAsync(course.Id, ct);
    }

    public async Task<CourseDto> UpdateAsync(Guid id, UpdateCourseRequest request, CancellationToken ct)
    {
        ValidateDates(request.StartTime, request.Deadline);
        var course = await EntityAsync(id, ct);
        if (course.GroupTypeId != request.GroupTypeId && course.Status != CourseStatus.Planned)
        {
            throw new BusinessRuleException("COURSE_NOT_PLANNED", "Chỉ được đổi loại nhóm khi Course chưa mở.");
        }
        if (!await db.GroupTypes.AnyAsync(x => x.Id == request.GroupTypeId, ct))
        {
            throw new NotFoundException("Không tìm thấy loại nhóm.");
        }
        course.GroupTypeId = request.GroupTypeId;
        course.StartTime = request.StartTime.ToUniversalTime();
        course.Deadline = request.Deadline.ToUniversalTime();
        await db.SaveChangesAsync(ct);
        return await GetAsync(id, ct);
    }

    public async Task DeleteAsync(Guid id, CancellationToken ct)
    {
        var course = await EntityAsync(id, ct);
        if (course.Status != CourseStatus.Planned || await db.Rooms.AnyAsync(x => x.CourseId == id, ct))
        {
            throw new BusinessRuleException("IN_USE", "Course đang được sử dụng.");
        }
        var enrollments = await db.StudentInCourses.Where(x => x.CourseId == id).ToListAsync(ct);
        db.StudentInCourses.RemoveRange(enrollments);
        db.Courses.Remove(course);
        await db.SaveChangesAsync(ct);
        await cache.RemoveAsync(TeamCacheKeys.CourseStats(id), ct);
    }

    public async Task<CourseDto> TransitionAsync(Guid id, bool open, CancellationToken ct)
    {
        var course = await EntityAsync(id, ct);
        if ((open && course.Status != CourseStatus.Planned) || (!open && course.Status != CourseStatus.Forming))
        {
            throw new BusinessRuleException("INVALID_COURSE_STATE", "Không thể chuyển trạng thái Course.");
        }
        course.Status = open ? CourseStatus.Forming : CourseStatus.Closed;
        var recipients = open ? [] : await db.StudentInRooms.Where(x => x.CourseId == id && (x.Room.Status == RoomStatus.Open || x.Room.Status == RoomStatus.Locked))
            .Select(x => new EventRecipient(x.Student.Email, x.Student.FullName)).Distinct().ToArrayAsync(ct);
        await db.SaveChangesAsync(ct);
        await cache.RemoveAsync(TeamCacheKeys.CourseStats(id), ct);
        if (!open)
        {
            await publisher.PublishAsync(RoomEventFactory.CourseClosed(course.Code, recipients), ct);
        }
        return await GetAsync(id, ct);
    }

    public async Task<PagedResult<CourseStudentDto>> StudentsAsync(Guid id, CourseStudentQuery query, CancellationToken ct)
    {
        await EntityAsync(id, ct);
        var source = db.StudentInCourses.Where(x => x.CourseId == id).Select(x => new CourseStudentDto { Id = x.StudentId, StudentCode = x.Student.StudentCode, FullName = x.Student.FullName, Email = x.Student.Email, MajorId = x.Student.MajorId, MajorCode = x.Student.Major.Code, HasRoom = db.StudentInRooms.Any(r => r.CourseId == id && r.StudentId == x.StudentId), Gpa = x.Student.Gpa, Roles = x.Student.Roles.Select(r => new RoleDto(r.TeamRole.Id, r.TeamRole.Code, r.TeamRole.Name)).ToList() });
        if (query.MajorId.HasValue)
        {
            source = source.Where(x => x.MajorId == query.MajorId);
        }
        if (query.HasRoom.HasValue)
        {
            source = source.Where(x => x.HasRoom == query.HasRoom);
        }
        if (!string.IsNullOrWhiteSpace(query.Q))
        {
            source = source.Where(x => x.StudentCode.Contains(query.Q) || x.FullName.Contains(query.Q) || x.Email.Contains(query.Q));
        }
        source = string.Equals(query.SortBy, "fullName", StringComparison.OrdinalIgnoreCase)
            ? (query.Descending ? source.OrderByDescending(x => x.FullName) : source.OrderBy(x => x.FullName))
            : (query.Descending ? source.OrderByDescending(x => x.StudentCode) : source.OrderBy(x => x.StudentCode));
        return await source.ToPagedResultAsync(query, ct);
    }

    public async Task<EnrollmentResult> EnrollAsync(Guid id, IReadOnlyList<Guid> studentIds, CancellationToken ct)
    {
        await EntityAsync(id, ct);
        var ids = studentIds.Distinct().ToArray();
        var students = await db.Students.Where(x => ids.Contains(x.Id)).Select(x => x.Id).ToListAsync(ct);
        if (students.Count != ids.Length)
        {
            throw new NotFoundException("Không tìm thấy sinh viên.");
        }
        var existing = await db.StudentInCourses.Where(x => x.CourseId == id && ids.Contains(x.StudentId)).Select(x => x.StudentId).ToListAsync(ct);
        var added = ids.Except(existing).ToArray();
        db.StudentInCourses.AddRange(added.Select(x => new StudentInCourse { CourseId = id, StudentId = x, EnrolledAt = DateTime.UtcNow }));
        await db.SaveChangesAsync(ct);
        await cache.RemoveAsync(TeamCacheKeys.CourseStats(id), ct);
        return new EnrollmentResult(added.Length, studentIds.Count - added.Length);
    }

    public async Task RemoveStudentAsync(Guid id, Guid studentId, CancellationToken ct)
    {
        var enrollment = await db.StudentInCourses.SingleOrDefaultAsync(x => x.CourseId == id && x.StudentId == studentId, ct)
            ?? throw new NotFoundException("Không tìm thấy sinh viên trong Course.");
        if (await db.StudentInRooms.AnyAsync(x => x.CourseId == id && x.StudentId == studentId, ct))
        {
            throw new BusinessRuleException("IN_USE", "Sinh viên đang ở phòng của Course.");
        }
        db.StudentInCourses.Remove(enrollment);
        await db.SaveChangesAsync(ct);
        await cache.RemoveAsync(TeamCacheKeys.CourseStats(id), ct);
    }

    public async Task<CourseStatsDto> StatsAsync(Guid id, CancellationToken ct)
    {
        await EntityAsync(id, ct);
        var total = await db.StudentInCourses.CountAsync(x => x.CourseId == id, ct);
        var inRoom = await db.StudentInRooms.CountAsync(x => x.CourseId == id, ct);
        var inGroup = await db.StudentInGroups.CountAsync(x => x.Group.CourseId == id, ct);
        var counts = await db.Rooms.Where(x => x.CourseId == id).GroupBy(x => x.Status).Select(x => new { Status = x.Key, Count = x.Count() }).ToListAsync(ct);
        var groupCount = await db.Groups.CountAsync(x => x.CourseId == id, ct);
        return new CourseStatsDto(total, inRoom, inGroup, counts.ToDictionary(x => x.Status.ToString(), x => x.Count), groupCount);
    }

    public async Task<PagedResult<MyCourseDto>> MyCoursesAsync(PageQuery query, CancellationToken ct)
    {
        var student = await rooms.CurrentStudentAsync(ct);
        var source = Courses().Where(x => db.StudentInCourses.Any(s => s.CourseId == x.Id && s.StudentId == student.Id));
        if (!string.IsNullOrWhiteSpace(query.Q))
        {
            source = source.Where(x => x.Code.Contains(query.Q));
        }
        source = query.Descending ? source.OrderByDescending(x => x.Code) : source.OrderBy(x => x.Code);
        var page = await source.ToPagedResultAsync(query, ct);
        var result = new List<MyCourseDto>();
        foreach (var course in page.Items)
        {
            var roomId = await db.StudentInRooms.Where(x => x.CourseId == course.Id && x.StudentId == student.Id).Select(x => (Guid?)x.RoomId).SingleOrDefaultAsync(ct);
            RoomDto? room = null;
            if (roomId.HasValue)
            {
                room = RoomService.Map(await rooms.LoadRoomAsync(roomId.Value, ct));
            }
            var group = await db.StudentInGroups.Where(x => x.StudentId == student.Id && x.Group.CourseId == course.Id)
                .Include(x => x.Group).ThenInclude(x => x.GroupType).Include(x => x.Group).ThenInclude(x => x.Course)
                .Include(x => x.Group).ThenInclude(x => x.Members).ThenInclude(x => x.Student).ThenInclude(x => x.Major).Select(x => x.Group).SingleOrDefaultAsync(ct);
            GroupDto? groupDto = null;
            if (group != null)
            {
                groupDto = new GroupDto(group.Id, group.Code, group.Name, group.CourseId, group.Course.Code, group.RoomId, group.GroupTypeId,
                    group.GroupType.Name, group.CreatedAt, group.Members.Select(x => new GroupMemberDto(x.StudentId, x.Student.StudentCode,
                        x.Student.FullName, x.Student.Major.Code, x.IsLeader)).ToArray());
            }
            result.Add(new MyCourseDto(course.Id, course.Code, course.SemesterId, course.SubjectId, course.GroupTypeId,
                course.GroupTypeName, course.Status, course.StartTime, course.Deadline, course.StudentCount, room, groupDto));
        }
        return new PagedResult<MyCourseDto>(result, page.Page, page.PageSize, page.TotalItems);
    }
}

~~~

### CourseDtos.cs

Hợp đồng API cho Course và danh sách sinh viên.

[src/TeamService/Dtos/CourseDtos.cs dòng 1–29](../../src/TeamService/Dtos/CourseDtos.cs#L1-L29)

~~~csharp
using Exe.Shared.Web.Paging;

namespace Exe.TeamService.Dtos;

public sealed record CourseRequest(Guid SemesterId, Guid SubjectId, Guid GroupTypeId, DateTime StartTime, DateTime Deadline);
public sealed record UpdateCourseRequest(Guid GroupTypeId, DateTime StartTime, DateTime Deadline);
public sealed record EnrollRequest(IReadOnlyList<Guid> StudentIds);
public sealed record EnrollmentResult(int Added, int Skipped);
public sealed record CourseDto(Guid Id, string Code, Guid SemesterId, Guid SubjectId, Guid GroupTypeId, string GroupTypeName, string Status, DateTime StartTime, DateTime Deadline, int StudentCount)
{
    public CourseDto() : this(default, "", default, default, default, "", "", default, default, 0) { }
}
public sealed record CourseStudentDto(Guid Id, string StudentCode, string FullName, string Email, Guid MajorId, string MajorCode, bool HasRoom, decimal? Gpa, IReadOnlyList<RoleDto> Roles)
{
    public CourseStudentDto() : this(default, "", "", "", default, "", false, null, []) { }
}
public sealed record CourseStatsDto(int TotalStudents, int StudentsInRoom, int StudentsInGroup, IReadOnlyDictionary<string, int> RoomsByStatus, int GroupCount);
public sealed record MyCourseDto(Guid Id, string Code, Guid SemesterId, Guid SubjectId, Guid GroupTypeId, string GroupTypeName, string Status, DateTime StartTime, DateTime Deadline, int StudentCount, RoomDto? MyRoom, GroupDto? MyGroup);
public sealed class CourseQuery : PageQuery
{
    public Guid? SemesterId { get; set; }
    public Guid? SubjectId { get; set; }
    public string? Status { get; set; }
}
public sealed class CourseStudentQuery : PageQuery
{
    public Guid? MajorId { get; set; }
    public bool? HasRoom { get; set; }
}
~~~
