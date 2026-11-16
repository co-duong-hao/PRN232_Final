using Exe.Shared.Web.Errors;
using Exe.TeamService.Abstractions;
using Microsoft.EntityFrameworkCore;
using Moq;

namespace Exe.TeamService.Tests;

public sealed class RecommendationWorkflowTests : WorkflowFixture
{
    [Fact]
    public async Task OnlyActiveRoomsInCourseAreSentToMatching()
    {
        var open = await MakeRoom(1);
        var locked = await MakeLocked(3, 4, 6);
        var cancelled = await MakeRoom(8);
        await Rooms.LeaveAsync(cancelled.Id, Ct);
        var otherCourse = await MakeRoom(9, SecondCourse);
        var completed = await MakeLocked(8, 9, 11);
        AsStudent(8);
        Matching.Setup(x => x.AnalyzeCompositionAsync(It.IsAny<GroupTypeRule>(), It.IsAny<IReadOnlyList<string>>(), Ct))
            .ReturnsAsync(new CompositionAnalysis(true, 3, 0, 2, 0, [], [], []));
        await Rooms.CompleteAsync(completed.Id, Ct);

        IReadOnlyList<RoomSnapshot>? observed = null;
        Matching.Setup(x => x.RecommendRoomsAsync(It.IsAny<GroupTypeRule>(), "AI", It.IsAny<IReadOnlyList<RoomSnapshot>>(), 2, Ct))
            .Callback<GroupTypeRule, string, IReadOnlyList<RoomSnapshot>, int, CancellationToken>((_, _, rooms, _, _) => observed = rooms)
            .ReturnsAsync(Array.Empty<RoomRecommendation>());
        AsStudent(7);

        await Rooms.RecommendAsync(FirstCourse, 2, Ct);

        Assert.Equal(new[] { open.Id, locked.Id }.Order(), observed!.Select(x => x.RoomId).Order());
        Assert.DoesNotContain(observed!, x => x.RoomId == cancelled.Id || x.RoomId == otherCourse.Id || x.RoomId == completed.Id);
        var first = Assert.Single(observed!, x => x.RoomId == open.Id);
        Assert.Equal("Open", first.Status);
        Assert.Equal(open.Code, first.RoomCode);
        Assert.Equal("SE", Assert.Single(first.MemberMajorCodes));
        var second = Assert.Single(observed!, x => x.RoomId == locked.Id);
        Assert.Equal("Locked", second.Status);
        Assert.Equal(new[] { "AI", "SE", "SE" }, second.MemberMajorCodes.Order());
    }

    [Theory]
    [InlineData(2)]
    [InlineData(5)]
    [InlineData(10)]
    [InlineData(20)]
    public async Task ReturnsMatchingRankingAndJoinabilityWithoutReordering(int limit)
    {
        var open = await MakeRoom();
        var locked = await MakeLocked(3, 4, 6);
        var ranked = new[]
        {
            new RoomRecommendation(locked.Id, locked.Code, 75, false, ["Send an application"]),
            new RoomRecommendation(open.Id, open.Code, 60, true, ["Eligible to join"]),
        };
        Matching.Setup(x => x.RecommendRoomsAsync(It.IsAny<GroupTypeRule>(), "GD", It.IsAny<IReadOnlyList<RoomSnapshot>>(), limit, Ct))
            .ReturnsAsync(ranked);
        AsStudent(8);

        var result = await Rooms.RecommendAsync(FirstCourse, limit, Ct);

        Assert.Equal(ranked, result);
        Assert.False(result[0].CanJoin);
        Assert.True(result[1].CanJoin);
        Matching.Verify(x => x.RecommendRoomsAsync(It.IsAny<GroupTypeRule>(), "GD",
            It.IsAny<IReadOnlyList<RoomSnapshot>>(), limit, Ct), Times.Once);
    }

    [Fact]
    public async Task OtherCourseMembershipDoesNotSuppressRecommendations()
    {
        await MakeRoom(8, SecondCourse);
        var available = await MakeRoom();
        var ranked = new[] { new RoomRecommendation(available.Id, available.Code, 50, true, ["Open room"]) };
        Matching.Setup(x => x.RecommendRoomsAsync(It.IsAny<GroupTypeRule>(), "GD", It.IsAny<IReadOnlyList<RoomSnapshot>>(), 10, Ct))
            .ReturnsAsync(ranked);
        AsStudent(8);

        var elsewhere = await Rooms.RecommendAsync(FirstCourse, 10, Ct);
        var current = await Rooms.RecommendAsync(SecondCourse, 10, Ct);

        Assert.Equal(available.Id, Assert.Single(elsewhere).RoomId);
        Assert.Empty(current);
        Matching.Verify(x => x.RecommendRoomsAsync(It.IsAny<GroupTypeRule>(), "GD",
            It.IsAny<IReadOnlyList<RoomSnapshot>>(), 10, Ct), Times.Once);
    }

    [Fact]
    public async Task NoEnrollmentStopsRecommendationBeforeMatching()
    {
        await Courses.RemoveStudentAsync(FirstCourse, Student(8), Ct);
        AsStudent(8);

        var error = await Assert.ThrowsAsync<ForbiddenException>(() => Rooms.RecommendAsync(FirstCourse, 5, Ct));

        Assert.Equal("BR02", error.Code);
        Matching.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task MatchingFailureIsPropagatedWhileDatabaseRemainsUnchanged()
    {
        var room = await MakeRoom();
        AsStudent(8);
        Matching.Setup(x => x.RecommendRoomsAsync(It.IsAny<GroupTypeRule>(), "GD", It.IsAny<IReadOnlyList<RoomSnapshot>>(), 5, Ct))
            .ThrowsAsync(new ServiceUnavailableException("Timeout contacting gRPC", "MATCHING_UNAVAILABLE"));
        Events.Clear();

        var error = await Assert.ThrowsAsync<ServiceUnavailableException>(() => Rooms.RecommendAsync(FirstCourse, 5, Ct));

        Assert.Equal("MATCHING_UNAVAILABLE", error.Code);
        await using var reader = NewReader();
        Assert.Equal(room.Id, (await reader.Rooms.SingleAsync(Ct)).Id);
        Assert.False(await reader.StudentInRooms.AnyAsync(x => x.StudentId == Student(8), Ct));
        Assert.Empty(Events);
    }

    [Fact]
    public async Task EmptyCourseSendsEmptySnapshotCollection()
    {
        AsStudent(8);
        Matching.Setup(x => x.RecommendRoomsAsync(It.IsAny<GroupTypeRule>(), "GD",
                It.Is<IReadOnlyList<RoomSnapshot>>(snapshots => snapshots.Count == 0), 3, Ct))
            .ReturnsAsync(Array.Empty<RoomRecommendation>());

        var result = await Rooms.RecommendAsync(FirstCourse, 3, Ct);

        Assert.Empty(result);
        Matching.VerifyAll();
    }

    [Fact]
    public async Task PendingApplicationDoesNotCountAsMembership()
    {
        var room = await MakeLocked();
        await Send(room, 8);
        var recommendation = new RoomRecommendation(room.Id, room.Code, 50, false, ["Send an application"]);
        Matching.Setup(x => x.RecommendRoomsAsync(It.IsAny<GroupTypeRule>(), "GD", It.IsAny<IReadOnlyList<RoomSnapshot>>(), 5, Ct))
            .ReturnsAsync(new[] { recommendation });

        var result = await Rooms.RecommendAsync(FirstCourse, 5, Ct);

        Assert.Equal(recommendation, Assert.Single(result));
        Assert.Equal("Pending", Assert.Single((await Read.MyAppliesAsync(new(), Ct)).Items).Status);
    }
}
