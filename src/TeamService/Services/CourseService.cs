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

