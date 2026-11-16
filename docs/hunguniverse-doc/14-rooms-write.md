# Tạo phòng và quản lý thành viên

Tài liệu tham chiếu cho PRN232 Final v0.4 tại commit 2e3789f.

[Mục lục bộ tài liệu](01-architecture.md)

## Cách hoạt động

Tạo phòng là thao tác trên một Course. Hệ thống kiểm tra ghi danh, phòng hiện có, sinh mã phòng và gán người tạo làm trưởng phòng.

Vào phòng trực tiếp kiểm tra trạng thái `Open`, giới hạn thành viên/ngành và GPA nếu phòng đặt ngưỡng. Đạt ngưỡng khóa làm phòng chuyển `Locked`.

Thành viên có thể rời phòng trước khi hoàn tất. Trưởng phòng phải chuyển quyền trước nếu còn người khác. Khi người cuối rời, phòng chuyển `Cancelled`.

## Cách kiểm tra

1. Tạo phòng ở EXE101 rồi tạo phòng ở EXE201 bằng cùng một sinh viên để kiểm tra phạm vi BR05.
2. Thử nhiều người tạo phòng cùng lúc với `neededRoleIds` giống nhau. Bản hiện tại có thể trả HTTP 500 khi thử lại sau xung đột và ghi trùng `PK_TeamRoles`.

## Đối chiếu mã nguồn

Các trích đoạn dưới đây hỗ trợ tra cứu. Đường dẫn mở phần tương ứng trong repo.

### RoomsController.cs

Endpoint tạo, vào, rời, đổi trưởng phòng và hoàn tất phòng.

[src/TeamService/Controllers/RoomsController.cs dòng 1–79](../../src/TeamService/Controllers/RoomsController.cs#L1-L79)

~~~csharp
using Exe.Contracts;
using Exe.TeamService.Dtos;
using Exe.TeamService.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;

namespace Exe.TeamService.Controllers;

[ApiController]
[Authorize]
public sealed class RoomsController(IRoomService rooms, IRoomApplyService applies) : ControllerBase
{
    [HttpGet("api/rooms/{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct) => Ok(await rooms.GetAsync(id, ct));

    [HttpPost("api/courses/{courseId:guid}/rooms")]
    [Authorize(Roles = Roles.Student)]
    public async Task<IActionResult> Create(Guid courseId, [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] RoomProfileRequest? profile, CancellationToken ct)
    {
        var room = await rooms.CreateAsync(courseId, profile, ct);
        return CreatedAtAction(nameof(Get), new { id = room.Id }, room);
    }

    [HttpPut("api/rooms/{id:guid}/profile")]
    [Authorize(Roles = Roles.Student)]
    public async Task<IActionResult> Profile(Guid id, RoomProfileRequest profile, CancellationToken ct) => Ok(await rooms.UpdateProfileAsync(id, profile, ct));

    [HttpPost("api/rooms/{id:guid}/join")]
    [Authorize(Roles = Roles.Student)]
    public async Task<IActionResult> Join(Guid id, CancellationToken ct) => Ok(await rooms.JoinAsync(id, ct));

    [HttpPost("api/rooms/{id:guid}/leave")]
    [Authorize(Roles = Roles.Student)]
    public async Task<IActionResult> Leave(Guid id, CancellationToken ct)
    {
        await rooms.LeaveAsync(id, ct);
        return NoContent();
    }

    [HttpPut("api/rooms/{id:guid}/leader")]
    [Authorize(Roles = Roles.Student)]
    public async Task<IActionResult> ChangeLeader(Guid id, ChangeLeaderRequest request, CancellationToken ct) => Ok(await rooms.ChangeLeaderAsync(id, request.StudentId, ct));

    [HttpGet("api/rooms/{id:guid}/composition")]
    public async Task<IActionResult> Composition(Guid id, CancellationToken ct) => Ok(await rooms.CompositionAsync(id, ct));

    [HttpPost("api/rooms/{id:guid}/complete")]
    [Authorize(Roles = Roles.Student)]
    public async Task<IActionResult> Complete(Guid id, CancellationToken ct)
    {
        var group = await rooms.CompleteAsync(id, ct);
        return Created($"/api/groups/{group.Id}", group);
    }

    [HttpGet("api/courses/{courseId:guid}/rooms/recommendations")]
    [Authorize(Roles = Roles.Student)]
    public async Task<IActionResult> Recommend(Guid courseId, [FromQuery] int limit = 10, CancellationToken ct = default) => Ok(await rooms.RecommendAsync(courseId, limit, ct));

    [HttpPost("api/rooms/{id:guid}/applies")]
    [Authorize(Roles = Roles.Student)]
    public async Task<IActionResult> Apply(Guid id, CreateApplyRequest request, CancellationToken ct)
    {
        var apply = await applies.CreateAsync(id, request.Message, ct);
        return Created($"/api/room-applies/{apply.Id}", apply);
    }

    [HttpPost("api/room-applies/{id:guid}/approve")]
    [Authorize(Roles = Roles.Student)]
    public async Task<IActionResult> Approve(Guid id, CancellationToken ct) => Ok(await applies.DecideAsync(id, true, ct));

    [HttpPost("api/room-applies/{id:guid}/reject")]
    [Authorize(Roles = Roles.Student)]
    public async Task<IActionResult> Reject(Guid id, CancellationToken ct) => Ok(await applies.DecideAsync(id, false, ct));

    [HttpPost("api/room-applies/{id:guid}/cancel")]
    [Authorize(Roles = Roles.Student)]
    public async Task<IActionResult> Cancel(Guid id, CancellationToken ct) => Ok(await applies.CancelAsync(id, ct));
}
~~~

### RoomService.cs

Điều kiện ghi danh, trạng thái và phòng đã tham gia.

[src/TeamService/Services/RoomService.cs dòng 19–58](../../src/TeamService/Services/RoomService.cs#L19-L58)

~~~csharp
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
~~~

### RoomService.cs

Kiểm tra sức chứa, hủy đơn chờ, lưu thành viên, tạo, vào, rời và đổi trưởng phòng.

[src/TeamService/Services/RoomService.cs dòng 121–309](../../src/TeamService/Services/RoomService.cs#L121-L309)

~~~csharp
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

~~~
