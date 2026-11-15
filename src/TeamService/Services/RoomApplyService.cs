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
            apply.Student.FullName, apply.Student.Major.Code, apply.Message, apply.Status.ToString(), apply.DecidedAt, apply.CreatedAt);
    }

    private async Task<RoomApply> LoadAsync(Guid id, CancellationToken ct)
    {
        return await db.RoomApplies.Include(x => x.Student).ThenInclude(x => x.Major).Include(x => x.Room)
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
