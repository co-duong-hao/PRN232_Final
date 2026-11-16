using Exe.Contracts.Events;
using Exe.Shared.Web.Errors;
using Exe.Shared.Web.Paging;
using Exe.TeamService.Abstractions;
using Exe.TeamService.Domain;
using Exe.TeamService.Dtos;
using Microsoft.EntityFrameworkCore;
using Moq;

namespace Exe.TeamService.Tests;

public sealed class GroupFinalizationWorkflowTests : WorkflowFixture
{
    [Fact]
    public async Task MatchingReceivesActualMajorsAndGroupRule()
    {
        var room = await MakeLocked();
        GroupTypeRule? sentRule = null;
        IReadOnlyList<string>? sentMajors = null;
        var result = new CompositionAnalysis(false, 3, 1, 2, 1, [new MajorGap("GD", 0, 1)], [], ["missing major"]);
        Matching.Setup(x => x.AnalyzeCompositionAsync(It.IsAny<GroupTypeRule>(), It.IsAny<IReadOnlyList<string>>(), Ct))
            .Callback<GroupTypeRule, IReadOnlyList<string>, CancellationToken>((rule, majors, _) =>
            {
                sentRule = rule;
                sentMajors = majors;
            })
            .ReturnsAsync(result);

        var analysis = await Rooms.CompositionAsync(room.Id, Ct);

        Assert.Same(result, analysis);
        Assert.Equal(new[] { "AI", "SE", "SE" }, sentMajors!.Order());
        Assert.Equal(4, sentRule!.MinMemberCount);
        Assert.Equal(6, sentRule.MaxMemberCount);
        Assert.Equal(3, sentRule.MinMajorCount);
        var major = Assert.Single(sentRule.MajorRules);
        Assert.Equal(new MajorRule("SE", 2, 3), major);
    }

    [Fact]
    public async Task GroupSnapshotUsesRoomNameAndTransferredLeader()
    {
        var room = await MakeLocked();
        AsStudent(1);
        await Rooms.UpdateProfileAsync(room.Id, new RoomProfileRequest("Nhóm Campus", "Dự án Campus", null, null, null, []), Ct);
        var application = await Send(room, 8);
        AsStudent(1);
        await Applies.DecideAsync(application.Id, true, Ct);
        await Rooms.ChangeLeaderAsync(room.Id, Student(2), Ct);
        AllowCompletion();
        AsStudent(2);

        var group = await Rooms.CompleteAsync(room.Id, Ct);

        Assert.Equal("Nhóm Campus", group.Name);
        Assert.Equal(room.Code.Replace("-R", "-G", StringComparison.Ordinal), group.Code);
        Assert.Equal(room.Id, group.RoomId);
        Assert.Equal(room.CourseId, group.CourseId);
        Assert.Equal(4, group.Members.Count);
        Assert.Equal(Student(2), Assert.Single(group.Members, x => x.IsLeader).StudentId);

        await using var reader = NewReader();
        var dbGroup = await reader.Groups.Include(x => x.Members).SingleAsync(x => x.Id == group.Id, Ct);
        Assert.Equal(Student(2), Assert.Single(dbGroup.Members, x => x.IsLeader).StudentId);
        Assert.Equal(group.Members.Select(x => x.StudentId).Order(), dbGroup.Members.Select(x => x.StudentId).Order());
    }

    [Fact]
    public async Task CompletionCancelsOnlyPendingApplicationsAndNotifiesMembers()
    {
        var room = await MakeLocked();
        var accepted = await Send(room, 8);
        var rejected = await Send(room, 9);
        var pending = await Send(room, 11);
        AsStudent(1);
        await Applies.DecideAsync(accepted.Id, true, Ct);
        await Applies.DecideAsync(rejected.Id, false, Ct);
        AllowCompletion();
        Events.Clear();

        var group = await Rooms.CompleteAsync(room.Id, Ct);

        var completed = Assert.Single(Events);
        Assert.Equal(EventTypes.RoomCompleted, completed.Type);
        Assert.Equal(room.Code, completed.EventKey);
        Assert.Equal(group.Code, completed.Data[EventDataKeys.GroupCode]);
        Assert.Equal(new[] { "student01@exe.local", "student02@exe.local", "student06@exe.local", "student08@exe.local" },
            completed.Recipients.Select(x => x.Email).Order());
        await using var reader = NewReader();
        var statuses = await reader.RoomApplies.ToDictionaryAsync(x => x.Id, x => x.Status, Ct);
        Assert.Equal(ApplyStatus.Approved, statuses[accepted.Id]);
        Assert.Equal(ApplyStatus.Rejected, statuses[rejected.Id]);
        Assert.Equal(ApplyStatus.Cancelled, statuses[pending.Id]);
    }

    [Fact]
    public async Task MatchingUnavailableLeavesRoomAndApplicationsUntouched()
    {
        var room = await MakeLocked();
        var pending = await Send(room, 8);
        AsStudent(1);
        Matching.Setup(x => x.AnalyzeCompositionAsync(It.IsAny<GroupTypeRule>(), It.IsAny<IReadOnlyList<string>>(), Ct))
            .ThrowsAsync(new ServiceUnavailableException("Matching unavailable"));
        Events.Clear();

        await Assert.ThrowsAsync<ServiceUnavailableException>(() => Rooms.CompleteAsync(room.Id, Ct));

        await using var reader = NewReader();
        Assert.False(await reader.Groups.AnyAsync(Ct));
        Assert.Equal(RoomStatus.Locked, (await reader.Rooms.SingleAsync(x => x.Id == room.Id, Ct)).Status);
        Assert.Equal(ApplyStatus.Pending, (await reader.RoomApplies.SingleAsync(x => x.Id == pending.Id, Ct)).Status);
        Assert.Empty(Events);
    }

    [Fact]
    public async Task MatchingRejectionPreservesStatusAndReturnsViolationDetails()
    {
        var room = await MakeLocked();
        var pending = await Send(room, 8);
        AsStudent(1);
        Matching.Setup(x => x.AnalyzeCompositionAsync(It.IsAny<GroupTypeRule>(), It.IsAny<IReadOnlyList<string>>(), Ct))
            .ReturnsAsync(new CompositionAnalysis(false, 3, 1, 2, 1, [new MajorGap("GD", 0, 1)], [], ["Require four members", "Require three majors"]));
        Events.Clear();

        var error = await Assert.ThrowsAsync<BusinessRuleException>(() => Rooms.CompleteAsync(room.Id, Ct));

        Assert.Equal("BR16", error.Code);
        Assert.Contains("Require four members", error.Message);
        Assert.Contains("Require three majors", error.Message);
        await using var reader = NewReader();
        Assert.False(await reader.Groups.AnyAsync(Ct));
        Assert.Equal(ApplyStatus.Pending, (await reader.RoomApplies.SingleAsync(x => x.Id == pending.Id, Ct)).Status);
        Assert.Empty(Events);
    }

    [Theory]
    [InlineData(2)]
    [InlineData(6)]
    [InlineData(8)]
    [InlineData(11)]
    public async Task OnlyLeaderCanCompleteBeforeCallingMatching(int number)
    {
        var room = await MakeLocked();
        AsStudent(number);
        Events.Clear();

        var error = await Assert.ThrowsAsync<ForbiddenException>(() => Rooms.CompleteAsync(room.Id, Ct));

        Assert.Equal("NOT_ROOM_LEADER", error.Code);
        Matching.VerifyNoOtherCalls();
        Assert.Empty(Events);
    }

    [Fact]
    public async Task CompletedGroupIsVisibleInPersonalCourseAndGroupList()
    {
        var room = await MakeLocked();
        var application = await Send(room, 8);
        AsStudent(1);
        await Applies.DecideAsync(application.Id, true, Ct);
        AllowCompletion();
        var group = await Rooms.CompleteAsync(room.Id, Ct);
        AsStudent(8);

        var personal = await Courses.MyCoursesAsync(new PageQuery { Q = "EXE101" }, Ct);
        var listed = await Read.GroupsAsync(FirstCourse, new PageQuery { Q = group.Code }, Ct);
        var secondCourse = await Read.GroupsAsync(SecondCourse, new PageQuery(), Ct);

        var course = Assert.Single(personal.Items);
        Assert.Equal(room.Id, course.MyRoom!.Id);
        Assert.Equal("Completed", course.MyRoom.Status);
        Assert.Equal(group.Id, course.MyGroup!.Id);
        Assert.Equal(group.Id, Assert.Single(listed.Items).Id);
        Assert.Empty(secondCourse.Items);
    }

    [Fact]
    public async Task CompletedRoomRejectsSecondCompletionAndMemberLeave()
    {
        var room = await MakeLocked();
        var application = await Send(room, 8);
        AsStudent(1);
        await Applies.DecideAsync(application.Id, true, Ct);
        AllowCompletion();
        var group = await Rooms.CompleteAsync(room.Id, Ct);
        Events.Clear();

        var repeat = await Assert.ThrowsAsync<BusinessRuleException>(() => Rooms.CompleteAsync(room.Id, Ct));
        AsStudent(8);
        var leave = await Assert.ThrowsAsync<BusinessRuleException>(() => Rooms.LeaveAsync(room.Id, Ct));

        Assert.Equal("ROOM_NOT_ACTIVE", repeat.Code);
        Assert.Equal("BR18", leave.Code);
        var detail = await Read.GroupAsync(group.Id, Ct);
        Assert.Equal(4, detail.Members.Count);
        Assert.Contains(detail.Members, x => x.StudentId == Student(8));
        Assert.Empty(Events);
    }

    private void AllowCompletion() => Matching
        .Setup(x => x.AnalyzeCompositionAsync(It.IsAny<GroupTypeRule>(), It.IsAny<IReadOnlyList<string>>(), Ct))
        .ReturnsAsync(new CompositionAnalysis(true, 4, 0, 3, 0, [], [], []));
}
