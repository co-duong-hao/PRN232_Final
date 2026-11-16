# Đơn xin vào phòng

Tài liệu tham chiếu cho PRN232 Final v0.4 tại commit 2e3789f.

[Mục lục bộ tài liệu](01-architecture.md)

## Cách hoạt động

Gửi đơn, duyệt, từ chối và hủy được thực hiện qua `RoomApplyService`. Trưởng phòng dùng thông tin GPA và vai trò để cân nhắc.

Duyệt đơn kiểm tra lại giới hạn thành viên và ràng buộc một phòng trong mỗi Course. Thêm thành viên có thể hủy các đơn chờ khác của người đó.

Bản hiện tại chỉ chấp nhận gửi đơn vào phòng `Locked`. Ca sinh viên bị chặn BR19 ở phòng `Open` có thể nhận hướng dẫn gửi đơn nhưng API trả `ROOM_NOT_LOCKED`.

## Cách kiểm tra

1. Tạo phòng đủ 3 người để khóa, gửi một đơn và thử duyệt bằng người ngoài vai trò trưởng phòng trước.
2. Tạo phòng mở yêu cầu GPA 3.0, thử vào bằng học viên GPA 2.20, rồi kiểm tra riêng kết quả endpoint gửi đơn.

## Đối chiếu mã nguồn

Các trích đoạn dưới đây hỗ trợ tra cứu. Đường dẫn mở phần tương ứng trong repo.

### RoomApplyService.cs

Thực hiện các chuyển trạng thái và phát sự kiện sau khi lưu.

[src/TeamService/Services/RoomApplyService.cs dòng 1–132](../../src/TeamService/Services/RoomApplyService.cs#L1-L132)

~~~csharp
using Exe.Contracts.Events;
using Exe.Shared.Web.Errors;
using Exe.TeamService.Abstractions;
using Exe.TeamService.Data;
using Exe.TeamService.Domain;
using Exe.TeamService.Dtos;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Exe.TeamService.Services;

public sealed class RoomApplyService(TeamDbContext db, RoomService rooms, IEventPublisher publisher, IOptions<RoomOptions> options) : IRoomApplyService
{
    private static ApplyDto Map(RoomApply apply)
    {
        return new ApplyDto(apply.Id, apply.RoomId, apply.Room.Code, apply.StudentId, apply.Student.StudentCode,
            apply.Student.FullName, apply.Student.Major.Code, apply.Message, apply.Status.ToString(), apply.DecidedAt, apply.CreatedAt) { Gpa = apply.Student.Gpa, Roles = RoomService.RoleDtos(apply.Student) };
    }

    private async Task<RoomApply> LoadAsync(Guid id, CancellationToken ct)
    {
        return await db.RoomApplies.Include(x => x.Student).ThenInclude(x => x.Major).Include(x => x.Student).ThenInclude(x => x.Roles).ThenInclude(x => x.TeamRole).Include(x => x.Room)
            .SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw new NotFoundException("Không tìm thấy đơn xin vào phòng.");
    }

    private static void CheckPending(RoomApply apply)
    {
        if (apply.Status != ApplyStatus.Pending)
        {
            throw new BusinessRuleException("APPLY_NOT_PENDING", "Đơn không còn chờ xử lý.");
        }
    }

    public async Task<ApplyDto> CreateAsync(Guid roomId, string message, CancellationToken ct)
    {
        var room = await rooms.LoadRoomAsync(roomId, ct);
        RoomService.CheckForming(room.Course);
        if (room.Status != RoomStatus.Locked)
        {
            throw new BusinessRuleException("ROOM_NOT_LOCKED", "Phòng không ở trạng thái khóa.");
        }
        var student = await rooms.CurrentStudentAsync(ct);
        await rooms.CheckEnrollmentAsync(room.CourseId, student.Id, ct);
        await rooms.CheckMembershipAsync(room.CourseId, student.Id, ct);
        if (await db.RoomApplies.AnyAsync(x => x.RoomId == roomId && x.StudentId == student.Id && x.Status == ApplyStatus.Pending, ct))
        {
            throw new BusinessRuleException("APPLY_ALREADY_PENDING", "Sinh viên đã có đơn chờ vào phòng này.");
        }
        if (message is null || message.Length > 500)
        {
            throw new BadRequestException("Lời nhắn không hợp lệ.");
        }
        var apply = new RoomApply { Room = room, Student = student, Message = message, Status = ApplyStatus.Pending, CreatedAt = DateTime.UtcNow };
        db.RoomApplies.Add(apply);
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (ex.InnerException?.Message.Contains("IX_RoomApplies_RoomId_StudentId", StringComparison.OrdinalIgnoreCase) == true ||
            ex.InnerException?.Message.Contains("RoomApplies.RoomId, RoomApplies.StudentId", StringComparison.OrdinalIgnoreCase) == true)
        {
            throw new BusinessRuleException("APPLY_ALREADY_PENDING", "Sinh viên đã có đơn chờ vào phòng này.");
        }
        await publisher.PublishAsync(RoomEventFactory.Create(EventTypes.RoomApplyCreated, room, [room.Leader],
            (EventDataKeys.ActorName, student.FullName), (EventDataKeys.Message, message)), ct);
        return Map(apply);
    }

    public async Task<ApplyDto> DecideAsync(Guid applyId, bool approve, CancellationToken ct)
    {
        var apply = await LoadAsync(applyId, ct);
        var room = await rooms.LoadRoomAsync(apply.RoomId, ct);
        RoomService.CheckForming(room.Course);
        CheckPending(apply);
        var leader = await rooms.CurrentStudentAsync(ct);
        await rooms.CheckEnrollmentAsync(room.CourseId, leader.Id, ct);
        RoomService.CheckLeader(room, leader);
        RoomService.CheckActive(room);
        Student[] previous = [];
        var locked = false;
        if (approve)
        {
            await rooms.CheckMembershipAsync(room.CourseId, apply.StudentId, ct);
            RoomService.CheckCapacity(room, apply.Student);
            previous = room.Members.Select(x => x.Student).ToArray();
            room.Members.Add(new StudentInRoom { Student = apply.Student, CourseId = room.CourseId, JoinedAt = DateTime.UtcNow });
            room.MemberCount++;
            room.Version++;
            locked = room.Status == RoomStatus.Open && room.MemberCount >= options.Value.LockThreshold;
            if (locked)
            {
                room.Status = RoomStatus.Locked;
            }
            await rooms.CancelPendingAsync(room.CourseId, apply.StudentId, apply.Id, ct);
        }
        apply.Status = approve ? ApplyStatus.Approved : ApplyStatus.Rejected;
        apply.DecidedBy = leader.Id;
        apply.DecidedAt = DateTime.UtcNow;
        await rooms.SaveMembershipAsync(ct);
        if (approve) await rooms.InvalidateStatsAsync(room.CourseId, ct);
        await publisher.PublishAsync(RoomEventFactory.Create(EventTypes.RoomApplyDecided, room, [apply.Student],
            (EventDataKeys.ActorName, leader.FullName), (EventDataKeys.Decision, apply.Status.ToString())), ct);
        if (approve)
        {
            await publisher.PublishAsync(RoomEventFactory.Create(EventTypes.RoomMemberJoined, room, previous,
                (EventDataKeys.ActorName, apply.Student.FullName), (EventDataKeys.MemberCount, room.MemberCount.ToString())), ct);
        }
        if (locked)
        {
            await publisher.PublishAsync(RoomEventFactory.Create(EventTypes.RoomLocked, room, room.Members.Select(x => x.Student),
                (EventDataKeys.MemberCount, room.MemberCount.ToString())), ct);
        }
        return Map(apply);
    }

    public async Task<ApplyDto> CancelAsync(Guid applyId, CancellationToken ct)
    {
        var apply = await LoadAsync(applyId, ct);
        var room = await rooms.LoadRoomAsync(apply.RoomId, ct);
        RoomService.CheckForming(room.Course);
        var student = await rooms.CurrentStudentAsync(ct);
        await rooms.CheckEnrollmentAsync(room.CourseId, student.Id, ct);
        if (student.Id != apply.StudentId)
        {
            throw new ForbiddenException("Chỉ người gửi được hủy đơn.");
        }
        CheckPending(apply);
        apply.Status = ApplyStatus.Cancelled;
        await db.SaveChangesAsync(ct);
        return Map(apply);
    }
}
~~~

### IRoomApplyService.cs

Hợp đồng nghiệp vụ cho thao tác đơn.

[src/TeamService/Services/IRoomApplyService.cs dòng 1–10](../../src/TeamService/Services/IRoomApplyService.cs#L1-L10)

~~~csharp
using Exe.TeamService.Dtos;

namespace Exe.TeamService.Services;

public interface IRoomApplyService
{
    Task<ApplyDto> CreateAsync(Guid roomId, string message, CancellationToken ct);
    Task<ApplyDto> DecideAsync(Guid applyId, bool approve, CancellationToken ct);
    Task<ApplyDto> CancelAsync(Guid applyId, CancellationToken ct);
}
~~~

### RoomDtos.cs

Mô hình phòng, thành viên, đơn và nhóm.

[src/TeamService/Dtos/RoomDtos.cs dòng 1–12](../../src/TeamService/Dtos/RoomDtos.cs#L1-L12)

~~~csharp
namespace Exe.TeamService.Dtos;

public sealed record RoomMemberDto(Guid StudentId, string StudentCode, string FullName, string MajorCode, bool IsLeader, DateTime JoinedAt) { public decimal? Gpa { get; init; } public IReadOnlyList<RoleDto> Roles { get; init; } = []; }
public sealed record MajorCountDto(string MajorCode, int Count);
public sealed record RoomSummaryDto(Guid Id, string Code, string Status, int MemberCount, string LeaderName, IReadOnlyList<MajorCountDto> Majors, DateTime CreatedAt) { public string? Name { get; init; } public string? ProjectName { get; init; } public string? IdeaDescription { get; init; } public decimal? RequiredGpa { get; init; } public decimal? TargetGrade { get; init; } public IReadOnlyList<RoleDto> NeededRoles { get; init; } = []; }
public sealed record RoomDto(Guid Id, string Code, string Status, int MemberCount, string LeaderName, IReadOnlyList<MajorCountDto> Majors, DateTime CreatedAt, Guid CourseId, string CourseCode, Guid LeaderId, IReadOnlyList<RoomMemberDto> Members) { public string? Name { get; init; } public string? ProjectName { get; init; } public string? IdeaDescription { get; init; } public decimal? RequiredGpa { get; init; } public decimal? TargetGrade { get; init; } public IReadOnlyList<RoleDto> NeededRoles { get; init; } = []; }
public sealed record GroupMemberDto(Guid StudentId, string StudentCode, string FullName, string MajorCode, bool IsLeader);
public sealed record GroupDto(Guid Id, string Code, string Name, Guid CourseId, string CourseCode, Guid RoomId, Guid GroupTypeId, string GroupTypeName, DateTime CreatedAt, IReadOnlyList<GroupMemberDto> Members);
public sealed record ApplyDto(Guid Id, Guid RoomId, string RoomCode, Guid StudentId, string StudentCode, string FullName, string MajorCode, string Message, string Status, DateTime? DecidedAt, DateTime CreatedAt) { public decimal? Gpa { get; init; } public IReadOnlyList<RoleDto> Roles { get; init; } = []; }
public sealed record RoomProfileRequest(string? Name, string? ProjectName, string? IdeaDescription, decimal? RequiredGpa, decimal? TargetGrade, IReadOnlyList<Guid>? NeededRoleIds);
public sealed record ChangeLeaderRequest(Guid StudentId);
public sealed record CreateApplyRequest(string Message);
~~~
