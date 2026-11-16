using Exe.Contracts.Events;
using Exe.Shared.Web.Errors;
using Exe.TeamService.Domain;
using Microsoft.EntityFrameworkCore;

namespace Exe.TeamService.Tests;

public sealed class ApplicationSubmissionWorkflowTests : WorkflowFixture
{
    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(499)]
    [InlineData(500)]
    public async Task SupportsEmptyAndMaximumLengthUnicodeMessages(int length)
    {
        var room = await MakeLocked();
        var message = new string('ệ', length);
        Events.Clear();

        var apply = await Send(room, 8, message);

        Assert.Equal(room.Id, apply.RoomId);
        Assert.Equal(room.Code, apply.RoomCode);
        Assert.Equal(Student(8), apply.StudentId);
        Assert.Equal("Pending", apply.Status);
        Assert.Equal(message, apply.Message);
        Assert.Null(apply.DecidedAt);
        var notification = Assert.Single(Events);
        Assert.Equal(EventTypes.RoomApplyCreated, notification.Type);
        Assert.Equal("Sinh viên 08", notification.Data[EventDataKeys.ActorName]);
        Assert.Equal(message, notification.Data[EventDataKeys.Message]);
        Assert.Equal(room.Code, notification.EventKey);

        await using var reader = NewReader();
        var stored = await reader.RoomApplies.SingleAsync(x => x.Id == apply.Id, Ct);
        Assert.Equal(message, stored.Message);
        Assert.Equal(ApplyStatus.Pending, stored.Status);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task InvalidMessageDoesNotReserveApplicationOrPublish(bool missing)
    {
        var room = await MakeLocked();
        Events.Clear();
        var message = missing ? null! : new string('x', 501);

        await Assert.ThrowsAsync<BadRequestException>(() => Send(room, 8, message));

        Assert.Empty(Events);
        await using var reader = NewReader();
        Assert.False(await reader.RoomApplies.AnyAsync(Ct));
        Assert.Equal("Pending", (await Send(room, 8, "Đơn hợp lệ")).Status);
    }

    [Theory]
    [InlineData(1)]
    [InlineData(2)]
    [InlineData(6)]
    public async Task ExistingRoomMemberCannotSubmitApplication(int number)
    {
        var room = await MakeLocked();
        Events.Clear();

        var error = await Assert.ThrowsAsync<BusinessRuleException>(() => Send(room, number));

        Assert.Equal("BR05", error.Code);
        Assert.Empty(Events);
        await using var reader = NewReader();
        Assert.False(await reader.RoomApplies.AnyAsync(Ct));
    }

    [Fact]
    public async Task ApplicationsInDifferentCoursesStayIndependent()
    {
        var firstRoom = await MakeLocked();
        var secondRoom = await MakeLocked(course: SecondCourse);
        var first = await Send(firstRoom, 8, "Đơn EXE101");
        var second = await Send(secondRoom, 8, "Đơn EXE201");

        var cancelled = await Applies.CancelAsync(first.Id, Ct);

        Assert.Equal("Cancelled", cancelled.Status);
        await using var reader = NewReader();
        var pending = await reader.RoomApplies.SingleAsync(x => x.Id == second.Id, Ct);
        Assert.Equal(ApplyStatus.Pending, pending.Status);
        Assert.Equal(secondRoom.Id, pending.RoomId);
        Assert.Equal("Đơn EXE201", pending.Message);
    }

    [Fact]
    public async Task DuplicatePendingRequestPreservesOriginalMessage()
    {
        var room = await MakeLocked();
        var apply = await Send(room, 8, "Lời nhắn gốc");
        Events.Clear();

        var error = await Assert.ThrowsAsync<BusinessRuleException>(() => Send(room, 8, "Lời nhắn thứ hai"));

        Assert.Equal("APPLY_ALREADY_PENDING", error.Code);
        Assert.Empty(Events);
        await using var reader = NewReader();
        var stored = await reader.RoomApplies.SingleAsync(Ct);
        Assert.Equal(apply.Id, stored.Id);
        Assert.Equal("Lời nhắn gốc", stored.Message);
    }

    [Fact]
    public async Task ApplicantCanResubmitAfterCancellation()
    {
        var room = await MakeLocked();
        var first = await Send(room, 8, "Phiên bản đầu");
        await Applies.CancelAsync(first.Id, Ct);
        Events.Clear();

        var resubmitted = await Send(room, 8, "Phiên bản mới");

        Assert.NotEqual(first.Id, resubmitted.Id);
        Assert.Equal("Pending", resubmitted.Status);
        Assert.Equal("Phiên bản mới", resubmitted.Message);
        Assert.Equal(EventTypes.RoomApplyCreated, Assert.Single(Events).Type);
        await using var reader = NewReader();
        var history = await reader.RoomApplies.Where(x => x.StudentId == Student(8)).ToListAsync(Ct);
        Assert.Equal(2, history.Count);
        Assert.Equal(ApplyStatus.Cancelled, Assert.Single(history, x => x.Id == first.Id).Status);
        Assert.Equal(ApplyStatus.Pending, Assert.Single(history, x => x.Id == resubmitted.Id).Status);
    }

    [Theory]
    [InlineData(1)]
    [InlineData(2)]
    [InlineData(6)]
    [InlineData(7)]
    [InlineData(9)]
    public async Task CancellationIsPrivateToApplicant(int number)
    {
        var room = await MakeLocked();
        var apply = await Send(room, 8);
        AsStudent(number);
        Events.Clear();

        await Assert.ThrowsAsync<ForbiddenException>(() => Applies.CancelAsync(apply.Id, Ct));

        await using var reader = NewReader();
        Assert.Equal(ApplyStatus.Pending, (await reader.RoomApplies.SingleAsync(x => x.Id == apply.Id, Ct)).Status);
        Assert.Empty(Events);
    }

    [Fact]
    public async Task CancelledApplicationCannotBeCancelledTwice()
    {
        var room = await MakeLocked();
        var apply = await Send(room, 8);
        await Applies.CancelAsync(apply.Id, Ct);
        Events.Clear();

        var error = await Assert.ThrowsAsync<BusinessRuleException>(() => Applies.CancelAsync(apply.Id, Ct));

        Assert.Equal("APPLY_NOT_PENDING", error.Code);
        Assert.Empty(Events);
        await using var reader = NewReader();
        var stored = await reader.RoomApplies.SingleAsync(x => x.Id == apply.Id, Ct);
        Assert.Equal(ApplyStatus.Cancelled, stored.Status);
        Assert.Null(stored.DecidedAt);
    }
}
