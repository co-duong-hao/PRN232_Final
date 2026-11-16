using Exe.Contracts;
using Exe.Shared.Web.Errors;
using Exe.TeamService.Services;
using Microsoft.EntityFrameworkCore;

namespace Exe.TeamService.Tests;

public sealed class ApplicationReadWorkflowTests : WorkflowFixture
{
    [Theory]
    [InlineData(Roles.Student)]
    [InlineData(Roles.Admin)]
    [InlineData(Roles.Lecturer)]
    [InlineData(Roles.HeadOfDepartment)]
    public async Task StaffAndLeaderCanViewApplicantProfile(string role)
    {
        var room = await MakeLocked();
        var application = await Send(room, 9, "Có kinh nghiệm thiết kế");
        AsStudent(1);
        AsRole(role);

        var result = await Read.RoomAppliesAsync(room.Id, new ApplyListQuery(), Ct);

        var read = Assert.Single(result.Items);
        Assert.Equal(application.Id, read.Id);
        Assert.Equal(application.Message, read.Message);
        Assert.Equal("GD", read.MajorCode);
        Assert.Equal(2.40m, read.Gpa);
        Assert.Equal(new[] { "FE", "UIUX" }, read.Roles.Select(x => x.Code).Order());
    }

    [Theory]
    [InlineData(2)]
    [InlineData(6)]
    [InlineData(8)]
    [InlineData(9)]
    [InlineData(11)]
    public async Task NonLeadersCannotViewRoomInbox(int student)
    {
        var room = await MakeLocked();
        await Send(room, 8);
        AsStudent(student);

        var error = await Assert.ThrowsAsync<ForbiddenException>(() => Read.RoomAppliesAsync(room.Id, new ApplyListQuery(), Ct));

        Assert.Equal("NOT_ROOM_LEADER", error.Code);
    }

    [Fact]
    public async Task MyApplicationHistoryIsPrivateAndFilterableByCourse()
    {
        var firstRoom = await MakeLocked();
        var secondRoom = await MakeLocked(course: SecondCourse);
        var first = await Send(firstRoom, 8);
        var second = await Send(secondRoom, 8);
        await Send(firstRoom, 9);
        AsStudent(8);

        var all = await Read.MyAppliesAsync(new ApplyListQuery(), Ct);
        var filtered = await Read.MyAppliesAsync(new ApplyListQuery { CourseId = SecondCourse, Status = "pending" }, Ct);

        Assert.Equal(new[] { first.Id, second.Id }.Order(), all.Items.Select(x => x.Id).Order());
        Assert.All(all.Items, x => Assert.Equal(Student(8), x.StudentId));
        Assert.Equal(second.Id, Assert.Single(filtered.Items).Id);
    }

    [Theory]
    [InlineData("Approved")]
    [InlineData("Rejected")]
    [InlineData("Cancelled")]
    [InlineData("Pending")]
    public async Task StatusFilterSeparatesApprovedRejectedCancelledAndPending(string status)
    {
        var room = await MakeLocked();
        var accepted = await Send(room, 8);
        var rejected = await Send(room, 9);
        var cancelled = await Send(room, 10);
        await Applies.CancelAsync(cancelled.Id, Ct);
        var pending = await Send(room, 11);
        AsStudent(1);
        await Applies.DecideAsync(accepted.Id, true, Ct);
        await Applies.DecideAsync(rejected.Id, false, Ct);
        var ids = new Dictionary<string, Guid>
        {
            ["Approved"] = accepted.Id,
            ["Rejected"] = rejected.Id,
            ["Cancelled"] = cancelled.Id,
            ["Pending"] = pending.Id,
        };

        var result = await Read.RoomAppliesAsync(room.Id, new ApplyListQuery { Status = status }, Ct);

        var match = Assert.Single(result.Items);
        Assert.Equal(ids[status], match.Id);
        Assert.Equal(status, match.Status);
    }

    [Theory]
    [InlineData("asc", 1)]
    [InlineData("asc", 2)]
    [InlineData("desc", 1)]
    [InlineData("desc", 2)]
    public async Task InboxOrdersBySubmissionTimeBeforePaging(string direction, int page)
    {
        var room = await MakeLocked();
        var oldest = await Send(room, 8);
        var middle = await Send(room, 9);
        var newest = await Send(room, 11);
        var byId = await Db.RoomApplies.ToDictionaryAsync(x => x.Id, Ct);
        var start = new DateTime(2026, 11, 1, 0, 0, 0, DateTimeKind.Utc);
        byId[oldest.Id].CreatedAt = start;
        byId[middle.Id].CreatedAt = start.AddHours(1);
        byId[newest.Id].CreatedAt = start.AddHours(2);
        await Db.SaveChangesAsync(Ct);
        AsStudent(1);

        var result = await Read.RoomAppliesAsync(room.Id,
            new ApplyListQuery { PageSize = 2, Page = page, SortDir = direction }, Ct);

        var order = direction == "asc" ? new[] { oldest.Id, middle.Id, newest.Id } : new[] { newest.Id, middle.Id, oldest.Id };
        Assert.Equal(order.Skip((page - 1) * 2).Take(2), result.Items.Select(x => x.Id));
        Assert.Equal(3, result.TotalItems);
        Assert.Equal(2, result.TotalPages);
    }

    [Fact]
    public async Task LeadershipTransferMovesInboxAccessToNewLeader()
    {
        var room = await MakeLocked();
        var request = await Send(room, 8);
        AsStudent(1);
        await Rooms.ChangeLeaderAsync(room.Id, Student(2), Ct);

        await Assert.ThrowsAsync<ForbiddenException>(() => Read.RoomAppliesAsync(room.Id, new ApplyListQuery(), Ct));
        AsStudent(2);
        var result = await Read.RoomAppliesAsync(room.Id, new ApplyListQuery(), Ct);

        Assert.Equal(request.Id, Assert.Single(result.Items).Id);
    }
}
