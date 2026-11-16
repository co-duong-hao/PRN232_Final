using Exe.TeamService.Infrastructure.Caching;
using Exe.Contracts;
using Exe.Contracts.Events;
using Exe.Shared.Web.Auth;
using Exe.Shared.Web.Errors;
using Exe.TeamService.Abstractions;
using Exe.TeamService.Data;
using Exe.TeamService.Domain;
using Exe.TeamService.Dtos;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Exe.TeamService.Services;

public sealed class RoomService(TeamDbContext db, ICurrentUser user, IMatchingClient matching, IEventPublisher publisher, IOptions<RoomOptions> options, ITeamCache cache, IReferenceService references, IConfiguration configuration) : IRoomService
{
    private int Threshold => options.Value.LockThreshold;

    internal async Task<Student> CurrentStudentAsync(CancellationToken ct)
    {
        return await db.Students.Include(x => x.Major).Include(x => x.Roles).ThenInclude(x => x.TeamRole).SingleOrDefaultAsync(x => x.UserId == user.UserId, ct)
            ?? throw new ForbiddenException("Tài khoản không gắn với sinh viên nào.", "NOT_A_STUDENT");
    }

    internal async Task CheckEnrollmentAsync(Guid courseId, Guid studentId, CancellationToken ct)
    {
        if (!await db.StudentInCourses.AnyAsync(x => x.CourseId == courseId && x.StudentId == studentId, ct))
        {
            throw new ForbiddenException("Sinh viên không thuộc Course.", "BR02");
        }
    }

    internal static void CheckForming(Course course)
    {
        if (course.Status != CourseStatus.Forming)
        {
            throw new BusinessRuleException("COURSE_NOT_FORMING", "Course không trong trạng thái ghép nhóm.");
        }
    }

    internal async Task CheckMembershipAsync(Guid courseId, Guid studentId, CancellationToken ct)
    {
        if (await db.StudentInRooms.AnyAsync(x => x.CourseId == courseId && x.StudentId == studentId, ct))
        {
            throw new BusinessRuleException("BR05", "Sinh viên đã ở một phòng khác trong Course.");
        }
    }

    internal async Task<Room> LoadRoomAsync(Guid id, CancellationToken ct)
    {
        return await db.Rooms.Include(x => x.Course).ThenInclude(x => x.GroupType).ThenInclude(x => x.Majors).ThenInclude(x => x.Major)
            .Include(x => x.NeededRoles).ThenInclude(x => x.TeamRole)
            .Include(x => x.Members).ThenInclude(x => x.Student).ThenInclude(x => x.Roles).ThenInclude(x => x.TeamRole)
            .Include(x => x.Leader)
            .Include(x => x.Members).ThenInclude(x => x.Student).ThenInclude(x => x.Major)
            .SingleOrDefaultAsync(x => x.Id == id, ct)
            ?? throw new NotFoundException("Không tìm thấy phòng.");
    }

    private async Task<List<TeamRole>> ValidateProfileAsync(RoomProfileRequest? profile, CancellationToken ct)
    {
        var ids = profile?.NeededRoleIds ?? [];
        if (profile is not null && ((profile.Name?.Length ?? 0) > 100 || (profile.ProjectName?.Length ?? 0) > 200 || (profile.IdeaDescription?.Length ?? 0) > 1000 || profile.RequiredGpa is < 0 or > 4 || profile.TargetGrade is < 0 or > 10 || (profile.RequiredGpa.HasValue && decimal.Round(profile.RequiredGpa.Value, 2) != profile.RequiredGpa) || ids.Count > 5 || ids.Distinct().Count() != ids.Count)) throw new BadRequestException("Thông tin tuyển không hợp lệ.");
        var roles = await db.TeamRoles.Where(x => ids.Contains(x.Id)).ToListAsync(ct);
        if (roles.Count != ids.Count) throw new BadRequestException("Vai trò không tồn tại.");
        return roles;
    }
    private static void ApplyProfile(Room room, RoomProfileRequest? profile, List<TeamRole> roles)
    {
        room.Name = profile?.Name; room.ProjectName = profile?.ProjectName; room.IdeaDescription = profile?.IdeaDescription; room.RequiredGpa = profile?.RequiredGpa; room.TargetGrade = profile?.TargetGrade;
        foreach (var role in roles) room.NeededRoles.Add(new RoomNeededRole { TeamRole = role });
    }
    public async Task<RoomDto> UpdateProfileAsync(Guid id, RoomProfileRequest profile, CancellationToken ct)
    {
        var room = await LoadRoomAsync(id, ct); CheckForming(room.Course);
        var student = await CurrentStudentAsync(ct); await CheckEnrollmentAsync(room.CourseId, student.Id, ct);
        CheckLeader(room, student); CheckActive(room);
        var roles = await ValidateProfileAsync(profile, ct);
        foreach (var old in room.NeededRoles.Where(x => roles.All(r => r.Id != x.TeamRoleId)).ToArray()) { db.RoomNeededRoles.Remove(old); room.NeededRoles.Remove(old); }
        var added = roles.Where(r => room.NeededRoles.All(x => x.TeamRoleId != r.Id)).ToList();
        ApplyProfile(room, profile, added); room.Version++; await db.SaveChangesAsync(ct); return Map(room);
    }
    public async Task<StudentDto> UpdateStudentProfileAsync(StudentProfileRequest request, CancellationToken ct)
    {
        var ids = request.RoleIds;
        if (request.Gpa is < 0 or > 4 || (request.Gpa.HasValue && decimal.Round(request.Gpa.Value, 2) != request.Gpa) || ids is null || ids.Count is < 1 or > 3 || ids.Distinct().Count() != ids.Count) throw new BadRequestException("Hồ sơ sinh viên không hợp lệ.");
        var roles = await db.TeamRoles.Where(x => ids.Contains(x.Id)).ToListAsync(ct);
        if (roles.Count != ids.Count) throw new BadRequestException("Vai trò không tồn tại.");
        var student = await CurrentStudentAsync(ct); student.Gpa = request.Gpa;
        foreach (var old in student.Roles.Where(x => !ids.Contains(x.TeamRoleId)).ToArray()) { db.StudentTeamRoles.Remove(old); student.Roles.Remove(old); }
        foreach (var role in roles.Where(r => student.Roles.All(x => x.TeamRoleId != r.Id))) student.Roles.Add(new StudentTeamRole { TeamRole = role });
        await db.SaveChangesAsync(ct); return await references.StudentAsync(student.Id, ct);
    }

    internal static GroupTypeRule Rule(GroupType type)
    {
        return new GroupTypeRule(type.MinMemberCount, type.MaxMemberCount, type.MinMajorCount,
            type.Majors.Select(x => new MajorRule(x.Major.Code, x.MinQuantity, x.MaxQuantity)).ToArray());
    }

    private async Task<GroupTypeRule> CachedRuleAsync(Guid id, CancellationToken ct)
    {
        var (type, _) = await cache.GetOrCreateAsync(TeamCacheKeys.GroupType(id), TimeSpan.FromMinutes(configuration.GetValue("Cache:GroupTypeMinutes", 10)), token => references.GroupTypeAsync(id, token), ct);
        return new GroupTypeRule(type.MinMemberCount, type.MaxMemberCount, type.MinMajorCount,
            type.Majors.Select(x => new MajorRule(x.MajorCode, x.MinQuantity, x.MaxQuantity)).ToArray());
    }

    internal Task InvalidateStatsAsync(Guid courseId, CancellationToken ct) => cache.RemoveAsync(TeamCacheKeys.CourseStats(courseId), ct);

    internal static RoomDto Map(Room room)
    {
        return new RoomDto(room.Id, room.Code, room.Status.ToString(), room.MemberCount, room.Leader.FullName,
            room.Members.GroupBy(x => x.Student.Major.Code).Select(x => new MajorCountDto(x.Key, x.Count())).ToArray(),
            room.CreatedAt, room.CourseId, room.Course.Code, room.LeaderId,
            room.Members.Select(x => new RoomMemberDto(x.StudentId, x.Student.StudentCode, x.Student.FullName,
                x.Student.Major.Code, x.StudentId == room.LeaderId, x.JoinedAt) { Gpa = x.Student.Gpa, Roles = RoleDtos(x.Student) }).ToArray()) { Name = room.Name, ProjectName = room.ProjectName, IdeaDescription = room.IdeaDescription, RequiredGpa = room.RequiredGpa, TargetGrade = room.TargetGrade, NeededRoles = room.NeededRoles.Select(x => new RoleDto(x.TeamRole.Id, x.TeamRole.Code, x.TeamRole.Name)).ToArray() };
    }

    internal static RoleDto[] RoleDtos(Student student) => student.Roles.Select(x => new RoleDto(x.TeamRole.Id, x.TeamRole.Code, x.TeamRole.Name)).ToArray();

    internal static void CheckCapacity(Room room, Student student)
    {
        var type = room.Course.GroupType;
        var rule = type.Majors.SingleOrDefault(x => x.MajorId == student.MajorId);
        if (room.MemberCount >= type.MaxMemberCount ||
            (rule != null && room.Members.Count(x => x.Student.MajorId == student.MajorId) >= rule.MaxQuantity))
        {
            throw new BusinessRuleException("BR11", "Phòng hoặc ngành của sinh viên đã đủ số lượng.");
        }
    }

    internal async Task CancelPendingAsync(Guid courseId, Guid studentId, Guid? exceptId, CancellationToken ct)
    {
        var applies = await db.RoomApplies.Where(x => x.Room.CourseId == courseId && x.StudentId == studentId &&
            x.Status == ApplyStatus.Pending && x.Id != exceptId).ToListAsync(ct);
        foreach (var apply in applies)
        {
            apply.Status = ApplyStatus.Cancelled;
        }
    }

    internal async Task SaveMembershipAsync(CancellationToken ct)
    {
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw;
        }
        catch (DbUpdateException ex) when (ex.InnerException?.Message.Contains("StudentInRooms.CourseId, StudentInRooms.StudentId", StringComparison.OrdinalIgnoreCase) == true ||
            ex.InnerException?.Message.Contains("IX_StudentInRooms_CourseId_StudentId", StringComparison.OrdinalIgnoreCase) == true)
        {
            throw new BusinessRuleException("BR05", "Sinh viên đã ở một phòng khác trong Course.");
        }
    }

    public Task<RoomDto> CreateAsync(Guid courseId, CancellationToken ct) => CreateAsync(courseId, null, ct);

    public async Task<RoomDto> CreateAsync(Guid courseId, RoomProfileRequest? profile, CancellationToken ct)
    {
        var student = await CurrentStudentAsync(ct);
        var roles = await ValidateProfileAsync(profile, ct);
        for (var attempt = 0; attempt < 3; attempt++)
        {
            var course = await db.Courses.SingleOrDefaultAsync(x => x.Id == courseId, ct)
                ?? throw new NotFoundException("Không tìm thấy Course.");
            CheckForming(course);
            await CheckEnrollmentAsync(courseId, student.Id, ct);
            await CheckMembershipAsync(courseId, student.Id, ct);
            course.RoomSequence++;
            var room = new Room
            {
                Course = course,
                Leader = student,
                Code = $"{course.Code}-R{course.RoomSequence:000}",
                Status = RoomStatus.Open,
                MemberCount = 1,
                Version = 1,
                CreatedAt = DateTime.UtcNow
            };
            ApplyProfile(room, profile, roles);
            room.Members.Add(new StudentInRoom { Student = student, CourseId = courseId, JoinedAt = DateTime.UtcNow });
            db.Rooms.Add(room);
            await CancelPendingAsync(courseId, student.Id, null, ct);
            try
            {
                await SaveMembershipAsync(ct);
            }
            catch (DbUpdateConcurrencyException) when (attempt < 2)
            {
                db.ChangeTracker.Clear();
                student = await CurrentStudentAsync(ct);
                continue;
            }
            await InvalidateStatsAsync(courseId, ct);
            await publisher.PublishAsync(RoomEventFactory.Create(EventTypes.RoomCreated, room, [student]), ct);
            return Map(room);
        }
        throw new InvalidOperationException("Không thể tạo phòng.");
    }

    public async Task<RoomDto> JoinAsync(Guid roomId, CancellationToken ct)
    {
        var room = await LoadRoomAsync(roomId, ct);
        CheckForming(room.Course);
        if (room.Status != RoomStatus.Open)
        {
            throw new BusinessRuleException("ROOM_NOT_OPEN", "Phòng không mở để vào trực tiếp.");
        }
        var student = await CurrentStudentAsync(ct);
        await CheckEnrollmentAsync(room.CourseId, student.Id, ct);
        await CheckMembershipAsync(room.CourseId, student.Id, ct);
        if (room.RequiredGpa.HasValue && (!student.Gpa.HasValue || student.Gpa < room.RequiredGpa)) throw new BusinessRuleException("BR19", "GPA chưa đáp ứng yêu cầu của phòng; hãy gửi đơn.");
        CheckCapacity(room, student);
        var previous = room.Members.Select(x => x.Student).ToArray();
        room.Members.Add(new StudentInRoom { Student = student, CourseId = room.CourseId, JoinedAt = DateTime.UtcNow });
        room.MemberCount++;
        room.Version++;
        var locked = room.MemberCount >= Threshold;
        if (locked)
        {
            room.Status = RoomStatus.Locked;
        }
        await CancelPendingAsync(room.CourseId, student.Id, null, ct);
        await SaveMembershipAsync(ct);
        await InvalidateStatsAsync(room.CourseId, ct);
        await publisher.PublishAsync(RoomEventFactory.Create(EventTypes.RoomMemberJoined, room, previous,
            (EventDataKeys.ActorName, student.FullName), (EventDataKeys.MemberCount, room.MemberCount.ToString())), ct);
        if (locked)
        {
            await publisher.PublishAsync(RoomEventFactory.Create(EventTypes.RoomLocked, room, room.Members.Select(x => x.Student),
                (EventDataKeys.MemberCount, room.MemberCount.ToString())), ct);
        }
        return Map(room);
    }

    public async Task LeaveAsync(Guid roomId, CancellationToken ct)
    {
        var room = await LoadRoomAsync(roomId, ct);
        CheckForming(room.Course);
        var student = await CurrentStudentAsync(ct);
        await CheckEnrollmentAsync(room.CourseId, student.Id, ct);
        var member = room.Members.SingleOrDefault(x => x.StudentId == student.Id)
            ?? throw new BusinessRuleException("NOT_A_MEMBER", "Sinh viên không phải thành viên của phòng.");
        if (room.Status == RoomStatus.Completed)
        {
            throw new BusinessRuleException("BR18", "Phòng đã hoàn tất, không thể rời phòng.");
        }
        if (room.LeaderId == student.Id && room.MemberCount > 1)
        {
            throw new BusinessRuleException("BR13", "Trưởng phòng phải chuyển quyền trước khi rời phòng.");
        }
        db.StudentInRooms.Remove(member);
        room.MemberCount--;
        room.Version++;
        if (room.MemberCount == 0)
        {
            room.Status = RoomStatus.Cancelled;
            var applies = await db.RoomApplies.Where(x => x.RoomId == roomId && x.Status == ApplyStatus.Pending).ToListAsync(ct);
            foreach (var apply in applies)
            {
                apply.Status = ApplyStatus.Cancelled;
            }
        }
        else if (room.Status == RoomStatus.Locked && room.MemberCount < Threshold)
        {
            room.Status = RoomStatus.Open;
        }
        await db.SaveChangesAsync(ct);
        await InvalidateStatsAsync(room.CourseId, ct);
    }

    public async Task<RoomDto> ChangeLeaderAsync(Guid roomId, Guid studentId, CancellationToken ct)
    {
        var room = await LoadRoomAsync(roomId, ct);
        CheckForming(room.Course);
        var student = await CurrentStudentAsync(ct);
        await CheckEnrollmentAsync(room.CourseId, student.Id, ct);
        CheckLeader(room, student);
        var next = room.Members.SingleOrDefault(x => x.StudentId == studentId && x.StudentId != student.Id)
            ?? throw new BusinessRuleException("NOT_A_MEMBER", "Sinh viên không phải thành viên khác của phòng.");
        CheckActive(room);
        room.LeaderId = studentId;
        room.Leader = next.Student;
        room.Version++;
        await db.SaveChangesAsync(ct);
        await publisher.PublishAsync(RoomEventFactory.Create(EventTypes.RoomLeaderChanged, room, room.Members.Select(x => x.Student),
            (EventDataKeys.ActorName, next.Student.FullName)), ct);
        return Map(room);
    }

    internal static void CheckLeader(Room room, Student student)
    {
        if (room.LeaderId != student.Id)
        {
            throw new ForbiddenException("Chỉ trưởng phòng được thực hiện.", "NOT_ROOM_LEADER");
        }
    }

    internal static void CheckActive(Room room)
    {
        if (room.Status != RoomStatus.Open && room.Status != RoomStatus.Locked)
        {
            throw new BusinessRuleException("ROOM_NOT_ACTIVE", "Phòng không còn hoạt động.");
        }
    }

    private async Task CheckViewAsync(Room room, CancellationToken ct)
    {
        if (user.IsInRole(Roles.Student) && !user.IsInRole(Roles.Admin) && !user.IsInRole(Roles.HeadOfDepartment) && !user.IsInRole(Roles.Lecturer))
        {
            var student = await CurrentStudentAsync(ct);
            await CheckEnrollmentAsync(room.CourseId, student.Id, ct);
        }
    }

    public async Task<RoomDto> GetAsync(Guid roomId, CancellationToken ct)
    {
        var room = await LoadRoomAsync(roomId, ct);
        if (room.Status == RoomStatus.Cancelled && !user.IsInRole(Roles.Admin)) throw new NotFoundException("Không tìm thấy phòng.");
        await CheckViewAsync(room, ct);
        return Map(room);
    }

    public async Task<CompositionAnalysis> CompositionAsync(Guid roomId, CancellationToken ct)
    {
        var room = await LoadRoomAsync(roomId, ct);
        await CheckViewAsync(room, ct);
        return await matching.AnalyzeCompositionAsync(await CachedRuleAsync(room.Course.GroupTypeId, ct), room.Members.Select(x => x.Student.Major.Code).ToArray(), ct);
    }

    public async Task<GroupDto> CompleteAsync(Guid roomId, CancellationToken ct)
    {
        var room = await LoadRoomAsync(roomId, ct);
        CheckForming(room.Course);
        var student = await CurrentStudentAsync(ct);
        await CheckEnrollmentAsync(room.CourseId, student.Id, ct);
        CheckLeader(room, student);
        CheckActive(room);
        var analysis = await matching.AnalyzeCompositionAsync(await CachedRuleAsync(room.Course.GroupTypeId, ct), room.Members.Select(x => x.Student.Major.Code).ToArray(), ct);
        if (!analysis.Satisfied)
        {
            throw new BusinessRuleException("BR16", "Phòng chưa thỏa cơ cấu nhóm: " + string.Join(" ", analysis.Violations));
        }
        var groupCode = room.Code[..room.Code.LastIndexOf("-R", StringComparison.Ordinal)] + "-G" + room.Code[(room.Code.LastIndexOf("-R", StringComparison.Ordinal) + 2)..];
        var group = new Group { CourseId = room.CourseId, RoomId = room.Id, GroupTypeId = room.Course.GroupTypeId, Code = groupCode, Name = room.Name ?? groupCode, CreatedAt = DateTime.UtcNow };
        foreach (var member in room.Members)
        {
            group.Members.Add(new StudentInGroup { StudentId = member.StudentId, IsLeader = member.StudentId == room.LeaderId });
        }
        db.Groups.Add(group);
        room.Status = RoomStatus.Completed;
        room.Version++;
        var applies = await db.RoomApplies.Where(x => x.RoomId == roomId && x.Status == ApplyStatus.Pending).ToListAsync(ct);
        foreach (var apply in applies)
        {
            apply.Status = ApplyStatus.Cancelled;
        }
        await db.SaveChangesAsync(ct);
        await InvalidateStatsAsync(room.CourseId, ct);
        await publisher.PublishAsync(RoomEventFactory.Create(EventTypes.RoomCompleted, room, room.Members.Select(x => x.Student),
            (EventDataKeys.GroupCode, groupCode)), ct);
        return new GroupDto(group.Id, group.Code, group.Name, room.CourseId, room.Course.Code, room.Id, group.GroupTypeId,
            room.Course.GroupType.Name, group.CreatedAt, room.Members.Select(x => new GroupMemberDto(x.StudentId, x.Student.StudentCode,
                x.Student.FullName, x.Student.Major.Code, x.StudentId == room.LeaderId)).ToArray());
    }

    public async Task<IReadOnlyList<RoomRecommendation>> RecommendAsync(Guid courseId, int limit, CancellationToken ct)
    {
        var student = await CurrentStudentAsync(ct);
        var course = await db.Courses.Include(x => x.GroupType).ThenInclude(x => x.Majors).ThenInclude(x => x.Major)
            .SingleOrDefaultAsync(x => x.Id == courseId, ct) ?? throw new NotFoundException("Không tìm thấy Course.");
        await CheckEnrollmentAsync(courseId, student.Id, ct);
        if (await db.StudentInRooms.AnyAsync(x => x.CourseId == courseId && x.StudentId == student.Id, ct))
        {
            return [];
        }
        var rooms = await db.Rooms.Where(x => x.CourseId == courseId && (x.Status == RoomStatus.Open || x.Status == RoomStatus.Locked))
            .Include(x => x.Members).ThenInclude(x => x.Student).ThenInclude(x => x.Major).ToListAsync(ct);
        var snapshots = rooms.Select(x => new RoomSnapshot(x.Id, x.Code, x.Status.ToString(), x.Members.Select(m => m.Student.Major.Code).ToArray())).ToArray();
        return await matching.RecommendRoomsAsync(await CachedRuleAsync(course.GroupTypeId, ct), student.Major.Code, snapshots, limit, ct);
    }
}
