using Exe.Contracts;
using Exe.Contracts.Events;
using Exe.Shared.Web.Errors;
using Exe.TeamService.Domain;
using Microsoft.EntityFrameworkCore;

namespace Exe.TeamService.Tests;

public sealed class RoomMembershipWorkflowTests : WorkflowFixture
{
    [Fact]
    public async Task TransferPublishesToAllMembersAndKeepsRoster()
    {
        var room = await MakeLocked();
        AsStudent(1);
        Events.Clear();

        var result = await Rooms.ChangeLeaderAsync(room.Id, Student(2), Ct);

        Assert.Equal(3, result.MemberCount);
        Assert.Equal("Locked", result.Status);
        Assert.Equal(Student(2), result.LeaderId);
        Assert.Equal(Student(2), Assert.Single(result.Members, x => x.IsLeader).StudentId);
        Assert.Equal(new[] { Student(1), Student(2), Student(6) }, result.Members.Select(x => x.StudentId).Order());
        var change = Assert.Single(Events);
        Assert.Equal(EventTypes.RoomLeaderChanged, change.Type);
        Assert.Equal(room.Code, change.EventKey);
        Assert.Equal("Sinh viên 02", change.Data[EventDataKeys.ActorName]);
        Assert.Equal(3, change.Recipients.Count);

        await using var reader = NewReader();
        Assert.Equal(Student(2), (await reader.Rooms.SingleAsync(x => x.Id == room.Id, Ct)).LeaderId);
    }

    [Fact]
    public async Task PreviousLeaderCanLeaveAfterTransfer()
    {
        var room = await MakeLocked();
        AsStudent(1);
        await Rooms.ChangeLeaderAsync(room.Id, Student(2), Ct);

        await Rooms.LeaveAsync(room.Id, Ct);

        var reopened = await Rooms.GetAsync(room.Id, Ct);
        Assert.Equal("Open", reopened.Status);
        Assert.Equal(2, reopened.MemberCount);
        Assert.DoesNotContain(reopened.Members, x => x.StudentId == Student(1));
        Assert.Equal(Student(2), reopened.LeaderId);
        var replacement = await Join(reopened, 8);
        Assert.Equal("Locked", replacement.Status);
        Assert.Equal(3, replacement.MemberCount);
    }

    [Theory]
    [InlineData(1)]
    [InlineData(3)]
    [InlineData(8)]
    [InlineData(12)]
    [InlineData(99)]
    public async Task CannotTransferToSelfOrStudentOutsideRoom(int number)
    {
        var room = await MakeLocked();
        AsStudent(1);
        Events.Clear();

        var error = await Assert.ThrowsAsync<BusinessRuleException>(() => Rooms.ChangeLeaderAsync(room.Id, Student(number), Ct));

        Assert.Equal("NOT_A_MEMBER", error.Code);
        var stored = await Rooms.GetAsync(room.Id, Ct);
        Assert.Equal(Student(1), stored.LeaderId);
        Assert.Single(stored.Members, x => x.IsLeader);
        Assert.Empty(Events);
    }

    [Theory]
    [InlineData(2)]
    [InlineData(6)]
    [InlineData(8)]
    [InlineData(11)]
    public async Task LeadershipIsRequiredForTransferEvenWhenTargetIsMember(int number)
    {
        var room = await MakeLocked();
        AsStudent(number);
        Events.Clear();

        var error = await Assert.ThrowsAsync<ForbiddenException>(() => Rooms.ChangeLeaderAsync(room.Id, Student(2), Ct));

        Assert.Equal("NOT_ROOM_LEADER", error.Code);
        Assert.Equal(Student(1), (await Rooms.GetAsync(room.Id, Ct)).LeaderId);
        Assert.Empty(Events);
    }

    [Fact]
    public async Task LeavingLastMemberCancelsPendingApplication()
    {
        var room = await MakeLocked();
        var request = await Send(room, 8);
        AsStudent(2);
        await Rooms.LeaveAsync(room.Id, Ct);
        AsStudent(6);
        await Rooms.LeaveAsync(room.Id, Ct);

        AsStudent(1);
        await Rooms.LeaveAsync(room.Id, Ct);

        await using var reader = NewReader();
        Assert.Equal(RoomStatus.Cancelled, (await reader.Rooms.SingleAsync(x => x.Id == room.Id, Ct)).Status);
        Assert.False(await reader.StudentInRooms.AnyAsync(x => x.RoomId == room.Id, Ct));
        Assert.Equal(ApplyStatus.Cancelled, (await reader.RoomApplies.SingleAsync(x => x.Id == request.Id, Ct)).Status);
        Assert.DoesNotContain(Events, e => e.Type == EventTypes.RoomApplyDecided);
    }

    [Fact]
    public async Task LeavingOneCoursePreservesMembershipInAnother()
    {
        var original = await MakeRoom();
        var other = await MakeRoom(course: SecondCourse);
        Assert.NotEqual(original.Code, other.Code);

        await Rooms.LeaveAsync(original.Id, Ct);

        await using var reader = NewReader();
        var membership = Assert.Single(await reader.StudentInRooms.Where(x => x.StudentId == Student(1)).ToListAsync(Ct));
        Assert.Equal(other.Id, membership.RoomId);
        Assert.Equal(SecondCourse, membership.CourseId);
        Assert.Equal("Open", (await Rooms.GetAsync(other.Id, Ct)).Status);
    }

    [Fact]
    public async Task CancelledRoomVisibleToAdminWithEmptyRoster()
    {
        var room = await MakeRoom();
        await Rooms.LeaveAsync(room.Id, Ct);

        await Assert.ThrowsAsync<NotFoundException>(() => Rooms.GetAsync(room.Id, Ct));
        AsRole(Roles.Admin);
        var detail = await Rooms.GetAsync(room.Id, Ct);

        Assert.Equal("Cancelled", detail.Status);
        Assert.Equal(0, detail.MemberCount);
        Assert.Empty(detail.Members);
        Assert.Empty(detail.Majors);
    }

    [Fact]
    public async Task DuplicateJoinDoesNotChangeMemberCountOrEvents()
    {
        var room = await MakeRoom();
        await Join(room, 6);
        var eventCount = Events.Count;

        var error = await Assert.ThrowsAsync<BusinessRuleException>(() => Join(room, 6));

        Assert.Equal("BR05", error.Code);
        var read = await Rooms.GetAsync(room.Id, Ct);
        Assert.Equal(2, read.MemberCount);
        Assert.Single(read.Members, x => x.StudentId == Student(6));
        Assert.Equal(eventCount, Events.Count);
    }
}
