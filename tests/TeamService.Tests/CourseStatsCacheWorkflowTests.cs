using Exe.Shared.Web.Errors;
using Exe.TeamService.Abstractions;
using Exe.TeamService.Infrastructure.Caching;
using Exe.TeamService.Dtos;
using Moq;

namespace Exe.TeamService.Tests;

public sealed class CourseStatsCacheWorkflowTests : WorkflowFixture
{
    [Fact]
    public async Task CreationInvalidatesOnlyAffectedCourse()
    {
        var first = await ReadStats(FirstCourse);
        var second = await ReadStats(SecondCourse);
        Assert.False(first.Hit);
        Assert.False(second.Hit);

        await MakeRoom();

        var refreshed = await ReadStats(FirstCourse);
        var untouched = await ReadStats(SecondCourse);
        Assert.False(refreshed.Hit);
        Assert.Equal(1, refreshed.Value.StudentsInRoom);
        Assert.Equal(1, refreshed.Value.RoomsByStatus["Open"]);
        Assert.True(untouched.Hit);
        Assert.Equal(0, untouched.Value.StudentsInRoom);
        Assert.Empty(untouched.Value.RoomsByStatus);
    }

    [Fact]
    public async Task JoinThatLocksRoomRefreshesStatusBuckets()
    {
        var room = await MakeRoom();
        await Join(room, 2);
        var old = await ReadStats(FirstCourse);
        Assert.Equal(2, old.Value.StudentsInRoom);
        Assert.Equal(1, old.Value.RoomsByStatus["Open"]);

        await Join(room, 6);

        var refreshed = await ReadStats(FirstCourse);
        Assert.False(refreshed.Hit);
        Assert.Equal(3, refreshed.Value.StudentsInRoom);
        Assert.Equal(1, refreshed.Value.RoomsByStatus["Locked"]);
        Assert.DoesNotContain("Open", refreshed.Value.RoomsByStatus.Keys);
        Assert.True((await ReadStats(FirstCourse)).Hit);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task LeaveUpdatesCachedStatusAfterReopeningOrCancelling(bool locked)
    {
        var room = await MakeRoom();
        if (locked)
        {
            await Join(room, 2);
            await Join(room, 6);
        }
        var before = await ReadStats(FirstCourse);
        Assert.Equal(locked ? 3 : 1, before.Value.StudentsInRoom);

        await Rooms.LeaveAsync(room.Id, Ct);

        var updated = await ReadStats(FirstCourse);
        Assert.False(updated.Hit);
        Assert.Equal(locked ? 2 : 0, updated.Value.StudentsInRoom);
        Assert.Equal(1, updated.Value.RoomsByStatus[locked ? "Open" : "Cancelled"]);
        Assert.DoesNotContain(locked ? "Locked" : "Open", updated.Value.RoomsByStatus.Keys);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task ApprovalInvalidatesStatsAndRejectionKeepsValidSnapshot(bool approve)
    {
        var room = await MakeLocked();
        var application = await Send(room, 8);
        var initial = await ReadStats(FirstCourse);
        AsStudent(1);

        await Applies.DecideAsync(application.Id, approve, Ct);

        var stats = await ReadStats(FirstCourse);
        Assert.Equal(!approve, stats.Hit);
        Assert.Equal(approve ? 4 : initial.Value.StudentsInRoom, stats.Value.StudentsInRoom);
        Assert.Equal(1, stats.Value.RoomsByStatus["Locked"]);
        Assert.Equal(0, stats.Value.StudentsInGroup);
    }

    [Fact]
    public async Task ApplicationSubmissionOrCancellationKeepsStatsCached()
    {
        var room = await MakeLocked();
        await ReadStats(FirstCourse);

        var request = await Send(room, 8);
        var submitted = await ReadStats(FirstCourse);
        await Applies.CancelAsync(request.Id, Ct);
        var cancelled = await ReadStats(FirstCourse);

        Assert.True(submitted.Hit);
        Assert.True(cancelled.Hit);
        Assert.Equal(3, submitted.Value.StudentsInRoom);
        Assert.Equal(submitted.Value.StudentsInRoom, cancelled.Value.StudentsInRoom);
        Assert.Equal(submitted.Value.RoomsByStatus["Locked"], cancelled.Value.RoomsByStatus["Locked"]);
    }

    [Fact]
    public async Task EnrollmentRemovalAndReenrollmentRecalculateStudentCount()
    {
        var initial = await ReadStats(FirstCourse);
        Assert.Equal(12, initial.Value.TotalStudents);

        await Courses.RemoveStudentAsync(FirstCourse, Student(8), Ct);
        var afterRemoval = await ReadStats(FirstCourse);
        await Courses.EnrollAsync(FirstCourse, [Student(8)], Ct);
        var afterEnrollment = await ReadStats(FirstCourse);

        Assert.False(afterRemoval.Hit);
        Assert.Equal(11, afterRemoval.Value.TotalStudents);
        Assert.False(afterEnrollment.Hit);
        Assert.Equal(12, afterEnrollment.Value.TotalStudents);
        Assert.Equal(0, afterEnrollment.Value.StudentsInRoom);
    }

    [Fact]
    public async Task CompletionInvalidatesStatsAndCountsGroupMembers()
    {
        var room = await MakeLocked();
        var application = await Send(room, 8);
        AsStudent(1);
        await Applies.DecideAsync(application.Id, true, Ct);
        var initial = await ReadStats(FirstCourse);
        Matching.Setup(x => x.AnalyzeCompositionAsync(It.IsAny<GroupTypeRule>(), It.IsAny<IReadOnlyList<string>>(), Ct))
            .ReturnsAsync(new CompositionAnalysis(true, 4, 0, 3, 0, [], [], []));

        await Rooms.CompleteAsync(room.Id, Ct);

        var updated = await ReadStats(FirstCourse);
        Assert.False(updated.Hit);
        Assert.Equal(0, initial.Value.GroupCount);
        Assert.Equal(1, updated.Value.GroupCount);
        Assert.Equal(4, updated.Value.StudentsInGroup);
        Assert.Equal(4, updated.Value.StudentsInRoom);
        Assert.Equal(1, updated.Value.RoomsByStatus["Completed"]);
        Assert.DoesNotContain("Locked", updated.Value.RoomsByStatus.Keys);
    }

    [Fact]
    public async Task ClosingCourseInvalidatesOnlyItsStatsKey()
    {
        await ReadStats(FirstCourse);
        await ReadStats(SecondCourse);

        await Courses.TransitionAsync(FirstCourse, false, Ct);

        Assert.False((await ReadStats(FirstCourse)).Hit);
        Assert.True((await ReadStats(SecondCourse)).Hit);
        Assert.Equal("Closed", (await Courses.GetAsync(FirstCourse, Ct)).Status);
    }

    [Fact]
    public async Task RejectedJoinDoesNotEvictUnchangedStats()
    {
        var room = await MakeRoom(profile: new RoomProfileRequest(null, null, null, 4m, null, null));
        await ReadStats(FirstCourse);

        var error = await Assert.ThrowsAsync<BusinessRuleException>(() => Join(room, 8));

        Assert.Equal("BR19", error.Code);
        var stats = await ReadStats(FirstCourse);
        Assert.True(stats.Hit);
        Assert.Equal(1, stats.Value.StudentsInRoom);
    }

    private Task<(CourseStatsDto Value, bool Hit)> ReadStats(Guid courseId) =>
        Cache.GetOrCreateAsync(TeamCacheKeys.CourseStats(courseId), TimeSpan.FromMinutes(5),
            token => Courses.StatsAsync(courseId, token), Ct);
}
