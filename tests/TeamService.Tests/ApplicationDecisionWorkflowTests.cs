using Exe.Contracts.Events;
using Exe.Shared.Web.Errors;
using Exe.TeamService.Domain;
using Microsoft.EntityFrameworkCore;

namespace Exe.TeamService.Tests;

public sealed class ApplicationDecisionWorkflowTests : WorkflowFixture
{
    [Theory]
    [InlineData(true, "Approved")]
    [InlineData(false, "Rejected")]
    public async Task DecisionRecordsLeaderAndNotifiesApplicant(bool approve, string status)
    {
        var room = await MakeLocked();
        var request = await Send(room, 8);
        AsStudent(1);
        Events.Clear();
        var before = DateTime.UtcNow;

        var decided = await Applies.DecideAsync(request.Id, approve, Ct);

        Assert.Equal(status, decided.Status);
        Assert.InRange(decided.DecidedAt!.Value, before, DateTime.UtcNow);
        var evt = Assert.Single(Events, x => x.Type == EventTypes.RoomApplyDecided);
        Assert.Equal(status, evt.Data[EventDataKeys.Decision]);
        Assert.Equal("Sinh viên 01", evt.Data[EventDataKeys.ActorName]);
        Assert.Equal("student08@exe.local", Assert.Single(evt.Recipients).Email);
        Assert.Equal(room.Code, evt.EventKey);

        await using var reader = NewReader();
        var stored = await reader.RoomApplies.SingleAsync(x => x.Id == request.Id, Ct);
        Assert.Equal(Student(1), stored.DecidedBy);
        Assert.Equal(decided.DecidedAt, stored.DecidedAt);
        Assert.Equal(approve, await reader.StudentInRooms.AnyAsync(x => x.RoomId == room.Id && x.StudentId == Student(8), Ct));
    }

    [Fact]
    public async Task ApprovalCancelsOtherPendingInSameCourseOnly()
    {
        var first = await MakeLocked();
        var other = await MakeLocked(3, 4, 7);
        var anotherCourse = await MakeLocked(course: SecondCourse);
        var accepted = await Send(first, 8);
        var competing = await Send(other, 8);
        var independent = await Send(anotherCourse, 8);
        AsStudent(1);
        Events.Clear();

        await Applies.DecideAsync(accepted.Id, true, Ct);

        await using var reader = NewReader();
        var applications = await reader.RoomApplies.ToDictionaryAsync(x => x.Id, x => x.Status, Ct);
        Assert.Equal(ApplyStatus.Approved, applications[accepted.Id]);
        Assert.Equal(ApplyStatus.Cancelled, applications[competing.Id]);
        Assert.Equal(ApplyStatus.Pending, applications[independent.Id]);
        var decision = Assert.Single(Events, x => x.Type == EventTypes.RoomApplyDecided);
        Assert.Equal(first.Code, decision.EventKey);
        var joined = Assert.Single(Events, x => x.Type == EventTypes.RoomMemberJoined);
        Assert.Equal(first.Code, joined.EventKey);
        Assert.Equal("4", joined.Data[EventDataKeys.MemberCount]);
        Assert.Equal(new[] { "student01@exe.local", "student02@exe.local", "student06@exe.local" },
            joined.Recipients.Select(x => x.Email).Order());
    }

    [Fact]
    public async Task RejectionLeavesOtherApplicationPending()
    {
        var first = await MakeLocked();
        var other = await MakeLocked(3, 4, 7);
        var rejected = await Send(first, 8);
        var pending = await Send(other, 8);
        AsStudent(1);
        Events.Clear();

        await Applies.DecideAsync(rejected.Id, false, Ct);

        await using var reader = NewReader();
        Assert.Equal(ApplyStatus.Pending, (await reader.RoomApplies.SingleAsync(x => x.Id == pending.Id, Ct)).Status);
        Assert.False(await reader.StudentInRooms.AnyAsync(x => x.StudentId == Student(8), Ct));
        Assert.Equal(EventTypes.RoomApplyDecided, Assert.Single(Events).Type);
    }

    [Fact]
    public async Task PreviousLeaderLosesAuthorizationToDecide()
    {
        var room = await MakeLocked();
        var request = await Send(room, 8);
        AsStudent(1);
        await Rooms.ChangeLeaderAsync(room.Id, Student(2), Ct);
        Events.Clear();

        var error = await Assert.ThrowsAsync<ForbiddenException>(() => Applies.DecideAsync(request.Id, true, Ct));

        Assert.Equal("NOT_ROOM_LEADER", error.Code);
        Assert.Empty(Events);
        AsStudent(2);
        var approved = await Applies.DecideAsync(request.Id, true, Ct);
        Assert.Equal("Approved", approved.Status);
        Assert.Equal("Sinh viên 02", Assert.Single(Events, x => x.Type == EventTypes.RoomApplyDecided)
            .Data[EventDataKeys.ActorName]);
    }

    [Theory]
    [InlineData(true, true)]
    [InlineData(true, false)]
    [InlineData(false, false)]
    [InlineData(false, true)]
    public async Task CompletedDecisionCannotBeReplayedOrReversed(bool approvedFirst, bool nextDecision)
    {
        var room = await MakeLocked();
        var request = await Send(room, 8);
        AsStudent(1);
        var decision = await Applies.DecideAsync(request.Id, approvedFirst, Ct);
        Events.Clear();

        var error = await Assert.ThrowsAsync<BusinessRuleException>(() => Applies.DecideAsync(request.Id, nextDecision, Ct));

        Assert.Equal("APPLY_NOT_PENDING", error.Code);
        Assert.Empty(Events);
        await using var reader = NewReader();
        var stored = await reader.RoomApplies.SingleAsync(x => x.Id == request.Id, Ct);
        Assert.Equal(decision.Status, stored.Status.ToString());
        Assert.Equal(decision.DecidedAt, stored.DecidedAt);
        Assert.Equal(approvedFirst, await reader.StudentInRooms.AnyAsync(x => x.RoomId == room.Id && x.StudentId == Student(8), Ct));
    }

    [Fact]
    public async Task ApprovingAtMajorCapLeavesApplicationPending()
    {
        var room = await MakeLocked(1, 2, 3);
        var request = await Send(room, 4);
        AsStudent(1);
        Events.Clear();

        var error = await Assert.ThrowsAsync<BusinessRuleException>(() => Applies.DecideAsync(request.Id, true, Ct));

        Assert.Equal("BR11", error.Code);
        Assert.Empty(Events);
        await using var reader = NewReader();
        Assert.Equal(ApplyStatus.Pending, (await reader.RoomApplies.SingleAsync(x => x.Id == request.Id, Ct)).Status);
        Assert.Equal(3, await reader.StudentInRooms.CountAsync(x => x.RoomId == room.Id, Ct));
    }

    [Fact]
    public async Task ApprovingAtRoomCapacityLeavesWaitingStudentOut()
    {
        var room = await MakeLocked();
        foreach (var student in new[] { 8, 9, 11 })
        {
            var application = await Send(room, student);
            AsStudent(1);
            await Applies.DecideAsync(application.Id, true, Ct);
        }
        var waiting = await Send(room, 12);
        Events.Clear();
        AsStudent(1);

        var error = await Assert.ThrowsAsync<BusinessRuleException>(() => Applies.DecideAsync(waiting.Id, true, Ct));

        Assert.Equal("BR11", error.Code);
        Assert.Empty(Events);
        await using var reader = NewReader();
        Assert.Equal(6, await reader.StudentInRooms.CountAsync(x => x.RoomId == room.Id, Ct));
        Assert.Equal(ApplyStatus.Pending, (await reader.RoomApplies.SingleAsync(x => x.Id == waiting.Id, Ct)).Status);
    }

    [Fact]
    public async Task ApprovalAfterRoomReopensCanLockItAgain()
    {
        var room = await MakeLocked();
        var request = await Send(room, 8);
        AsStudent(2);
        await Rooms.LeaveAsync(room.Id, Ct);
        Assert.Equal("Open", (await Rooms.GetAsync(room.Id, Ct)).Status);
        AsStudent(1);
        Events.Clear();

        await Applies.DecideAsync(request.Id, true, Ct);

        var after = await Rooms.GetAsync(room.Id, Ct);
        Assert.Equal("Locked", after.Status);
        Assert.Equal(3, after.MemberCount);
        Assert.Equal(new[] { EventTypes.RoomApplyDecided, EventTypes.RoomMemberJoined, EventTypes.RoomLocked },
            Events.Select(x => x.Type));
        Assert.Equal(3, Events[^1].Recipients.Count);
    }
}
