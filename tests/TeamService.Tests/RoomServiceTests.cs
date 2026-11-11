using Exe.Contracts.Events;
using Exe.TeamService.Infrastructure.Caching;
using Microsoft.Extensions.Configuration;
using Exe.Shared.Web.Auth;
using Exe.Shared.Web.Errors;
using Exe.TeamService.Abstractions;
using Exe.TeamService.Data;
using Exe.TeamService.Domain;
using Exe.TeamService.Dtos;
using Exe.TeamService.Services;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Moq;

namespace Exe.TeamService.Tests;

public sealed class RoomServiceTests : IAsyncLifetime
{
    private readonly SqliteConnection connection = new("DataSource=:memory:");
    private readonly Mock<ICurrentUser> user = new();
    private readonly Mock<IMatchingClient> matching = new();
    private readonly Mock<IEventPublisher> publisher = new();
    private readonly List<EventEnvelope> events = [];
    private ITeamCache cache = null!;
    private TeamDbContext db = null!;
    private readonly Exe.TeamService.Infrastructure.TeamMetrics metrics = TestMetrics.Create();
    private RoomService rooms = null!;
    private RoomApplyService applies = null!;
    private Guid courseId;
    private Guid userId;

    public async Task InitializeAsync()
    {
        await connection.OpenAsync();
        db = new TeamDbContext(new DbContextOptionsBuilder<TeamDbContext>().UseSqlite(connection).Options);
        await db.Database.EnsureCreatedAsync();
        await TeamDbSeeder.SeedAsync(db);
        courseId = await db.Courses.Where(x => x.Code == "FA26-EXE101").Select(x => x.Id).SingleAsync();
        user.SetupGet(x => x.UserId).Returns(() => userId);
        publisher.Setup(x => x.PublishAsync(It.IsAny<EventEnvelope>(), It.IsAny<CancellationToken>()))
            .Callback<EventEnvelope, CancellationToken>((e, _) => events.Add(e)).Returns(Task.CompletedTask);
        cache = TestCache.Create();
        rooms = new RoomService(db, user.Object, matching.Object, publisher.Object, Options.Create(new RoomOptions()), cache, new ReferenceService(db, cache), new ConfigurationBuilder().Build(), metrics);
        applies = new RoomApplyService(db, rooms, publisher.Object, Options.Create(new RoomOptions()), metrics);
        SelectStudent(1);
    }

    public async Task DisposeAsync()
    {
        await db.DisposeAsync();
        await connection.DisposeAsync();
    }

    private void SelectStudent(int number)
    {
        userId = Guid.Parse($"10000000-0000-0000-0000-{number:000000000000}");
    }

    [Fact]
    public async Task Metrics_WhenRoomCreatedAndRuleRejected_RecordsOnlySuccess()
    {
        using var listener = new MetricCapture(metrics);
        await rooms.CreateAsync(courseId, default);
        await Assert.ThrowsAsync<BusinessRuleException>(() => rooms.CreateAsync(courseId, default));
        Assert.Equal(1, listener.Count("exe.rooms.created", "course", "FA26-EXE101"));
    }

    [Fact]
    public async Task Metrics_WhenJoiningApprovingAndCompleting_RecordsOutcomes()
    {
        using var listener = new MetricCapture(metrics);
        var room = await rooms.CreateAsync(courseId, default);
        SelectStudent(6); await rooms.JoinAsync(room.Id, default);
        var entity = await db.Rooms.SingleAsync(x => x.Id == room.Id);
        entity.Status = RoomStatus.Locked; await db.SaveChangesAsync();
        SelectStudent(8); var apply = await applies.CreateAsync(room.Id, "", default);
        SelectStudent(1); await applies.DecideAsync(apply.Id, true, default);
        matching.Setup(x => x.AnalyzeCompositionAsync(It.IsAny<GroupTypeRule>(), It.IsAny<IReadOnlyList<string>>(), It.IsAny<CancellationToken>())).ReturnsAsync(Analysis(true));
        await rooms.CompleteAsync(room.Id, default);
        Assert.Equal(1, listener.Count("exe.room.joins", "mode", "direct"));
        Assert.Equal(1, listener.Count("exe.room.joins", "mode", "approved"));
        Assert.Equal(1, listener.Count("exe.room.applications", "result", "approved"));
        Assert.Equal(1, listener.Count("exe.groups.formed", "course", "FA26-EXE101"));
    }

    [Fact]
    public async Task Metrics_WhenGroupTypeReadTwice_RecordsMissThenHit()
    {
        using var listener = new MetricCapture(metrics);
        var controller = new Exe.TeamService.Controllers.GroupTypesController(new ReferenceService(db, cache), cache, new ConfigurationBuilder().Build(), metrics)
        {
            ControllerContext = new Microsoft.AspNetCore.Mvc.ControllerContext { HttpContext = new Microsoft.AspNetCore.Http.DefaultHttpContext() }
        };
        var id = await db.GroupTypes.Select(x => x.Id).FirstAsync();
        await controller.Get(id, default);
        await controller.Get(id, default);
        Assert.Equal(1, listener.Count("exe.cache.requests", "result", "miss"));
        Assert.Equal(1, listener.Count("exe.cache.requests", "result", "hit"));
    }

    [Fact]
    public async Task Metrics_WhenCourseStatsReadTwice_RecordsMissThenHit()
    {
        using var listener = new MetricCapture(metrics);
        var controller = new Exe.TeamService.Controllers.CoursesController(
            new CourseService(db, rooms, publisher.Object, cache), cache, new ConfigurationBuilder().Build(), metrics)
        {
            ControllerContext = new Microsoft.AspNetCore.Mvc.ControllerContext { HttpContext = new Microsoft.AspNetCore.Http.DefaultHttpContext() }
        };
        await controller.Stats(courseId, default);
        Assert.Equal("MISS", controller.Response.Headers["X-Cache"].ToString());
        Assert.Equal(1, listener.Count("exe.cache.requests", "result", "miss"));
        await controller.Stats(courseId, default);
        Assert.Equal("HIT", controller.Response.Headers["X-Cache"].ToString());
        Assert.Equal(1, listener.Count("exe.cache.requests", "result", "hit"));
        Assert.Equal(2, listener.Count("exe.cache.requests", "cache", "course-stats"));
    }

    [Fact]
    public async Task Metrics_WhenApplicationRejected_RecordsRejectionWithoutJoin()
    {
        var room = await rooms.CreateAsync(courseId, default);
        var entity = await db.Rooms.SingleAsync(x => x.Id == room.Id);
        entity.Status = RoomStatus.Locked;
        await db.SaveChangesAsync();
        SelectStudent(6);
        var application = await applies.CreateAsync(room.Id, "", default);
        SelectStudent(1);
        using var listener = new MetricCapture(metrics);
        var result = await applies.DecideAsync(application.Id, false, default);
        Assert.Equal("Rejected", result.Status);
        Assert.Equal(1, listener.Count("exe.room.applications", "result", "rejected"));
        Assert.Equal(0, listener.Count("exe.room.joins"));
    }

    private static CompositionAnalysis Analysis(bool satisfied) => new(satisfied, 4, 0, 3, 0, [], [], satisfied ? [] : ["Thiếu ngành."]);

    [Fact]
    public async Task Join_WhenGpaBelowOrMissing_ThrowsBR19_AndEqualSucceeds()
    {
        var room = await rooms.CreateAsync(courseId, new RoomProfileRequest("Team", null, null, 3.1m, null, []), default);
        SelectStudent(3);
        Assert.Equal("BR19", (await Assert.ThrowsAsync<BusinessRuleException>(() => rooms.JoinAsync(room.Id, default))).Code);
        var student = await db.Students.SingleAsync(x => x.UserId == userId);
        student.Gpa = null; await db.SaveChangesAsync();
        Assert.Equal("BR19", (await Assert.ThrowsAsync<BusinessRuleException>(() => rooms.JoinAsync(room.Id, default))).Code);
        SelectStudent(2);
        Assert.Equal(2, (await rooms.JoinAsync(room.Id, default)).MemberCount);
    }

    [Fact]
    public async Task Profile_WhenInvalidAndValid_ValidatesAndReturnsUpdatedData()
    {
        var role = await db.TeamRoles.FirstAsync();
        await Assert.ThrowsAsync<BadRequestException>(() => rooms.UpdateStudentProfileAsync(new(4.1m, [role.Id]), default));
        await Assert.ThrowsAsync<BadRequestException>(() => rooms.UpdateStudentProfileAsync(new(3m, [Guid.NewGuid()]), default));
        await Assert.ThrowsAsync<BadRequestException>(() => rooms.UpdateStudentProfileAsync(new(3m, [Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid()]), default));
        var result = await rooms.UpdateStudentProfileAsync(new(3.25m, [role.Id]), default);
        Assert.Equal(3.25m, result.Gpa); Assert.Equal(role.Id, Assert.Single(result.Roles).Id);
    }

    [Fact]
    public async Task Create_WhenDifferentCourses_AllowsBothAndRejectsSameCourse()
    {
        var first = await rooms.CreateAsync(courseId, default);
        var secondCourse = Guid.Parse("30000000-0000-0000-0000-000000000002");
        var second = await rooms.CreateAsync(secondCourse, default);
        Assert.NotEqual(first.Id, second.Id);
        Assert.Equal("BR05", (await Assert.ThrowsAsync<BusinessRuleException>(() => rooms.CreateAsync(courseId, default))).Code);
    }

    [Fact]
    public async Task CreateProfile_WhenInvalidOrNonLeader_RejectsRequests()
    {
        await Assert.ThrowsAsync<BadRequestException>(() => rooms.CreateAsync(courseId, new(null, null, null, 4.5m, null, []), default));
        await Assert.ThrowsAsync<BadRequestException>(() => rooms.CreateAsync(courseId, new(null, null, null, null, 11m, []), default));
        var role = await db.TeamRoles.FirstAsync();
        var created = await rooms.CreateAsync(courseId, new("Team", "Project", "Idea", 3m, 8m, [role.Id]), default);
        Assert.Equal("Team", created.Name); Assert.Equal(role.Id, Assert.Single(created.NeededRoles).Id);
        SelectStudent(2);
        Assert.Equal("NOT_ROOM_LEADER", (await Assert.ThrowsAsync<ForbiddenException>(() => rooms.UpdateProfileAsync(created.Id, new(null, null, null, null, null, []), default))).Code);
    }

    [Fact]
    public async Task Apply_WhenGpaBelowRequirement_CanBeApproved()
    {
        var room = await rooms.CreateAsync(courseId, new(null, null, null, 4m, null, []), default);
        var entity = await db.Rooms.SingleAsync(x => x.Id == room.Id); entity.Status = RoomStatus.Locked; await db.SaveChangesAsync();
        SelectStudent(2); var apply = await applies.CreateAsync(room.Id, "", default);
        SelectStudent(1); var approved = await applies.DecideAsync(apply.Id, true, default);
        Assert.Equal("Approved", approved.Status);
    }

    [Fact]
    public async Task Rooms_WhenCancelled_HiddenExceptForAdmin()
    {
        var room = await rooms.CreateAsync(courseId, default);
        await rooms.LeaveAsync(room.Id, default);
        user.Setup(x => x.IsInRole("Student")).Returns(true);
        var read = new TeamReadService(db, user.Object, rooms);
        Assert.Empty((await read.RoomsAsync(courseId, new RoomListQuery { Status = "Cancelled" }, default)).Items);
        await Assert.ThrowsAsync<NotFoundException>(() => rooms.GetAsync(room.Id, default));
        user.Setup(x => x.IsInRole("Student")).Returns(false);
        user.Setup(x => x.IsInRole("Lecturer")).Returns(true);
        Assert.Empty((await read.RoomsAsync(courseId, new RoomListQuery { Status = "Cancelled" }, default)).Items);
        user.Setup(x => x.IsInRole("Admin")).Returns(true);
        Assert.Single((await read.RoomsAsync(courseId, new RoomListQuery { Status = "Cancelled" }, default)).Items);
    }

    [Fact]
    public async Task Rooms_WhenFilteringGpaRolesAndName_ReturnsMatchingRoom()
    {
        var role = await db.TeamRoles.SingleAsync(x => x.Code == "BE");
        var created = await rooms.CreateAsync(courseId, new("Unique Team", null, null, 3m, 8m, [role.Id]), default);
        var read = new TeamReadService(db, user.Object, rooms);
        var result = await read.RoomsAsync(courseId, new RoomListQuery { Gpa = 3m, RoleIds = [Guid.NewGuid(), role.Id], Q = "Unique" }, default);
        Assert.Equal(created.Id, Assert.Single(result.Items).Id);
        Assert.Empty((await read.RoomsAsync(courseId, new RoomListQuery { Gpa = 2m }, default)).Items);
    }

    [Fact]
    public async Task Stats_WhenStudentJoins_InvalidatesCachedCounts()
    {
        var room = await rooms.CreateAsync(courseId, default);
        var courses = new CourseService(db, rooms, publisher.Object, cache);
        var key = TeamCacheKeys.CourseStats(courseId);
        var first = await cache.GetOrCreateAsync(key, TimeSpan.FromMinutes(1), ct => courses.StatsAsync(courseId, ct), default);
        Assert.Equal(1, first.Value.StudentsInRoom);
        var hit = await cache.GetOrCreateAsync(key, TimeSpan.FromMinutes(1), ct => courses.StatsAsync(courseId, ct), default);
        Assert.True(hit.Hit);
        SelectStudent(2);
        await rooms.JoinAsync(room.Id, default);
        var after = await cache.GetOrCreateAsync(key, TimeSpan.FromMinutes(1), ct => courses.StatsAsync(courseId, ct), default);
        Assert.False(after.Hit);
        Assert.Equal(2, after.Value.StudentsInRoom);
    }

    [Fact]
    public async Task Create_WhenEnrolled_CreatesRoomAndLeader()
    {
        var result = await rooms.CreateAsync(courseId, default);
        Assert.Equal("FA26-EXE101-R001", result.Code);
        Assert.Equal(result.LeaderId, Assert.Single(result.Members).StudentId);
        Assert.True(result.Members[0].IsLeader);
    }

    [Fact]
    public async Task CreateJoinApply_WhenNotEnrolled_ThrowsBR02()
    {
        var room = await rooms.CreateAsync(courseId, default);
        var entity = await db.Rooms.SingleAsync(x => x.Id == room.Id);
        var outsider = await db.Students.SingleAsync(x => x.UserId == Guid.Parse("10000000-0000-0000-0000-000000000012"));
        db.StudentInCourses.Remove(await db.StudentInCourses.SingleAsync(x => x.CourseId == courseId && x.StudentId == outsider.Id));
        await db.SaveChangesAsync();
        SelectStudent(12);
        Assert.Equal("BR02", (await Assert.ThrowsAsync<ForbiddenException>(() => rooms.CreateAsync(courseId, default))).Code);
        Assert.Equal("BR02", (await Assert.ThrowsAsync<ForbiddenException>(() => rooms.JoinAsync(room.Id, default))).Code);
        entity.Status = RoomStatus.Locked;
        await db.SaveChangesAsync();
        Assert.Equal("BR02", (await Assert.ThrowsAsync<ForbiddenException>(() => applies.CreateAsync(room.Id, "", default))).Code);
    }

    [Fact]
    public async Task CreateAndJoin_WhenAlreadyInRoom_ThrowsBR05()
    {
        var first = await rooms.CreateAsync(courseId, default);
        SelectStudent(2);
        var second = await rooms.CreateAsync(courseId, default);
        SelectStudent(1);
        Assert.Equal("BR05", (await Assert.ThrowsAsync<BusinessRuleException>(() => rooms.CreateAsync(courseId, default))).Code);
        Assert.Equal("BR05", (await Assert.ThrowsAsync<BusinessRuleException>(() => rooms.JoinAsync(second.Id, default))).Code);
        Assert.NotEqual(first.Id, second.Id);
    }

    [Fact]
    public async Task JoinAndLeave_WhenThresholdCrossed_LocksAndReopens()
    {
        var room = await rooms.CreateAsync(courseId, default);
        SelectStudent(6);
        await rooms.JoinAsync(room.Id, default);
        SelectStudent(8);
        var locked = await rooms.JoinAsync(room.Id, default);
        Assert.Equal("Locked", locked.Status);
        await rooms.LeaveAsync(room.Id, default);
        Assert.Equal(RoomStatus.Open, (await db.Rooms.SingleAsync(x => x.Id == room.Id)).Status);
    }

    [Fact]
    public async Task Join_WhenMajorAtLimit_ThrowsBR11()
    {
        var room = await rooms.CreateAsync(courseId, default);
        SelectStudent(2);
        await rooms.JoinAsync(room.Id, default);
        SelectStudent(3);
        await rooms.JoinAsync(room.Id, default);
        var entity = await db.Rooms.SingleAsync(x => x.Id == room.Id);
        entity.Status = RoomStatus.Open;
        await db.SaveChangesAsync();
        SelectStudent(4);
        Assert.Equal("BR11", (await Assert.ThrowsAsync<BusinessRuleException>(() => rooms.JoinAsync(room.Id, default))).Code);
    }

    [Fact]
    public async Task Join_WhenRoomFull_ThrowsBR11()
    {
        var type = await db.GroupTypes.SingleAsync();
        type.MaxMemberCount = 1;
        var room = await rooms.CreateAsync(courseId, default);
        SelectStudent(6);
        Assert.Equal("BR11", (await Assert.ThrowsAsync<BusinessRuleException>(() => rooms.JoinAsync(room.Id, default))).Code);
    }

    [Fact]
    public async Task Join_WhenOtherApplicationsPending_CancelsThem()
    {
        var target = await rooms.CreateAsync(courseId, default);
        SelectStudent(2);
        var other = await rooms.CreateAsync(courseId, default);
        var otherEntity = await db.Rooms.SingleAsync(x => x.Id == other.Id);
        otherEntity.Status = RoomStatus.Locked;
        await db.SaveChangesAsync();
        SelectStudent(6);
        var apply = await applies.CreateAsync(other.Id, "xin vào", default);
        await rooms.JoinAsync(target.Id, default);
        Assert.Equal(ApplyStatus.Cancelled, (await db.RoomApplies.SingleAsync(x => x.Id == apply.Id)).Status);
    }

    [Fact]
    public async Task Leave_WhenLeaderHasOthers_ThrowsBR13_AndLastMemberCancels()
    {
        var room = await rooms.CreateAsync(courseId, default);
        SelectStudent(6);
        await rooms.JoinAsync(room.Id, default);
        SelectStudent(1);
        Assert.Equal("BR13", (await Assert.ThrowsAsync<BusinessRuleException>(() => rooms.LeaveAsync(room.Id, default))).Code);
        SelectStudent(6);
        await rooms.LeaveAsync(room.Id, default);
        SelectStudent(1);
        await rooms.LeaveAsync(room.Id, default);
        Assert.Equal(RoomStatus.Cancelled, (await db.Rooms.SingleAsync(x => x.Id == room.Id)).Status);
    }

    [Fact]
    public async Task Approve_WhenLeaderDecides_AddsApplicant_AndOthersForbidden()
    {
        var room = await rooms.CreateAsync(courseId, default);
        var entity = await db.Rooms.SingleAsync(x => x.Id == room.Id);
        entity.Status = RoomStatus.Locked;
        await db.SaveChangesAsync();
        SelectStudent(6);
        var apply = await applies.CreateAsync(room.Id, "xin vào", default);
        SelectStudent(8);
        Assert.Equal("NOT_ROOM_LEADER", (await Assert.ThrowsAsync<ForbiddenException>(() => applies.DecideAsync(apply.Id, true, default))).Code);
        SelectStudent(1);
        var result = await applies.DecideAsync(apply.Id, true, default);
        Assert.Equal("Approved", result.Status);
        Assert.True(await db.StudentInRooms.AnyAsync(x => x.RoomId == room.Id && x.StudentId == result.StudentId));
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task ApproveAndCancel_WhenBothReadPending_OnlyFirstWriteSucceeds(bool approveFirst)
    {
        var leaderUserId = userId;
        var room = await rooms.CreateAsync(courseId, default);
        SelectStudent(2);
        await rooms.JoinAsync(room.Id, default);
        SelectStudent(6);
        await rooms.JoinAsync(room.Id, default);
        SelectStudent(8);
        var applicantUserId = userId;
        var application = await applies.CreateAsync(room.Id, "xin vào", default);
        events.Clear();

        db.ChangeTracker.Clear();
        var pending = await db.RoomApplies.SingleAsync(x => x.Id == application.Id);
        Assert.Equal(ApplyStatus.Pending, pending.Status);

        // The losing request already holds the Pending snapshot when the other request commits.
        await using var firstDb = new TeamDbContext(new DbContextOptionsBuilder<TeamDbContext>().UseSqlite(connection).Options);
        var roomOptions = Options.Create(new RoomOptions());
        var firstRooms = new RoomService(firstDb, user.Object, matching.Object, publisher.Object, roomOptions, cache,
            new ReferenceService(firstDb, cache), new ConfigurationBuilder().Build(), metrics);
        var firstApplies = new RoomApplyService(firstDb, firstRooms, publisher.Object, roomOptions, metrics);
        userId = approveFirst ? leaderUserId : applicantUserId;
        await (approveFirst
            ? firstApplies.DecideAsync(application.Id, true, default)
            : firstApplies.CancelAsync(application.Id, default));

        userId = approveFirst ? applicantUserId : leaderUserId;
        await Assert.ThrowsAsync<DbUpdateConcurrencyException>(() => approveFirst
            ? applies.CancelAsync(application.Id, default)
            : applies.DecideAsync(application.Id, true, default));

        db.ChangeTracker.Clear();
        var saved = await db.RoomApplies.SingleAsync(x => x.Id == application.Id);
        Assert.Equal(approveFirst ? ApplyStatus.Approved : ApplyStatus.Cancelled, saved.Status);
        Assert.Equal(approveFirst, await db.StudentInRooms.AnyAsync(x => x.RoomId == room.Id && x.StudentId == application.StudentId));
        Assert.Equal(approveFirst ? 4 : 3, (await db.Rooms.SingleAsync(x => x.Id == room.Id)).MemberCount);
        Assert.Equal(approveFirst ? 1 : 0, events.Count(x => x.Type == EventTypes.RoomApplyDecided));
    }

    [Fact]
    public async Task Complete_WhenUnsatisfied_ThrowsBR16()
    {
        var room = await rooms.CreateAsync(courseId, default);
        matching.Setup(x => x.AnalyzeCompositionAsync(It.IsAny<GroupTypeRule>(), It.IsAny<IReadOnlyList<string>>(), It.IsAny<CancellationToken>())).ReturnsAsync(Analysis(false));
        Assert.Equal("BR16", (await Assert.ThrowsAsync<BusinessRuleException>(() => rooms.CompleteAsync(room.Id, default))).Code);
    }

    [Fact]
    public async Task Complete_WhenSatisfied_CreatesGroupAndPreventsLeaving()
    {
        var room = await rooms.CreateAsync(courseId, default);
        SelectStudent(6);
        await rooms.JoinAsync(room.Id, default);
        SelectStudent(1);
        matching.Setup(x => x.AnalyzeCompositionAsync(It.IsAny<GroupTypeRule>(), It.IsAny<IReadOnlyList<string>>(), It.IsAny<CancellationToken>())).ReturnsAsync(Analysis(true));
        var group = await rooms.CompleteAsync(room.Id, default);
        Assert.Equal("FA26-EXE101-G001", group.Code);
        Assert.Equal(2, await db.StudentInGroups.CountAsync(x => x.GroupId == group.Id));
        Assert.Equal(RoomStatus.Completed, (await db.Rooms.SingleAsync(x => x.Id == room.Id)).Status);
        Assert.Equal("BR18", (await Assert.ThrowsAsync<BusinessRuleException>(() => rooms.LeaveAsync(room.Id, default))).Code);
    }

    [Fact]
    public async Task Join_WhenRoomLocks_PublishesJoinedAndLockedRecipients()
    {
        var room = await rooms.CreateAsync(courseId, default);
        SelectStudent(6);
        await rooms.JoinAsync(room.Id, default);
        events.Clear();
        SelectStudent(8);
        await rooms.JoinAsync(room.Id, default);
        var joined = Assert.Single(events, x => x.Type == EventTypes.RoomMemberJoined);
        var locked = Assert.Single(events, x => x.Type == EventTypes.RoomLocked);
        Assert.Equal(new[] { "student01@exe.local", "student06@exe.local" }, joined.Recipients.Select(x => x.Email).Order().ToArray());
        Assert.Equal(new[] { "student01@exe.local", "student06@exe.local", "student08@exe.local" }, locked.Recipients.Select(x => x.Email).Order().ToArray());
        Assert.Equal("Sinh viên 08", joined.Data[EventDataKeys.ActorName]);
        Assert.Equal("3", joined.Data[EventDataKeys.MemberCount]);
        Assert.Equal("3", locked.Data[EventDataKeys.MemberCount]);
    }

    [Fact]
    public async Task Create_WhenCourseNotForming_ThrowsCourseNotForming()
    {
        var course = await db.Courses.SingleAsync(x => x.Id == courseId);
        course.Status = CourseStatus.Closed;
        await db.SaveChangesAsync();
        Assert.Equal("COURSE_NOT_FORMING", (await Assert.ThrowsAsync<BusinessRuleException>(() => rooms.CreateAsync(courseId, default))).Code);
    }
    [Fact]
    public async Task Complete_WhenRoomChangesDuringAnalysis_ThrowsConcurrencyConflict()
    {
        var room = await rooms.CreateAsync(courseId, default);
        matching.Setup(x => x.AnalyzeCompositionAsync(It.IsAny<GroupTypeRule>(), It.IsAny<IReadOnlyList<string>>(), It.IsAny<CancellationToken>()))
            .Returns(async () =>
            {
                await using var other = new TeamDbContext(new DbContextOptionsBuilder<TeamDbContext>().UseSqlite(connection).Options);
                var changed = await other.Rooms.SingleAsync(x => x.Id == room.Id);
                changed.Version++;
                await other.SaveChangesAsync();
                return Analysis(true);
            });
        await Assert.ThrowsAsync<DbUpdateConcurrencyException>(() => rooms.CompleteAsync(room.Id, default));
        db.ChangeTracker.Clear();
        Assert.False(await db.Groups.AnyAsync(x => x.RoomId == room.Id));
        Assert.Equal(RoomStatus.Open, (await db.Rooms.SingleAsync(x => x.Id == room.Id)).Status);
    }

    [Fact]
    public async Task RoomWrites_WhenCourseClosed_RejectAllActions()
    {
        var room = await rooms.CreateAsync(courseId, default);
        var entity = await db.Rooms.SingleAsync(x => x.Id == room.Id);
        entity.Status = RoomStatus.Locked;
        await db.SaveChangesAsync();
        SelectStudent(6);
        var apply = await applies.CreateAsync(room.Id, "xin vào", default);
        var course = await db.Courses.SingleAsync(x => x.Id == courseId);
        course.Status = CourseStatus.Closed;
        await db.SaveChangesAsync();
        Assert.Equal("COURSE_NOT_FORMING", (await Assert.ThrowsAsync<BusinessRuleException>(() => rooms.JoinAsync(room.Id, default))).Code);
        Assert.Equal("COURSE_NOT_FORMING", (await Assert.ThrowsAsync<BusinessRuleException>(() => rooms.LeaveAsync(room.Id, default))).Code);
        Assert.Equal("COURSE_NOT_FORMING", (await Assert.ThrowsAsync<BusinessRuleException>(() => rooms.ChangeLeaderAsync(room.Id, Guid.NewGuid(), default))).Code);
        Assert.Equal("COURSE_NOT_FORMING", (await Assert.ThrowsAsync<BusinessRuleException>(() => rooms.CompleteAsync(room.Id, default))).Code);
        Assert.Equal("COURSE_NOT_FORMING", (await Assert.ThrowsAsync<BusinessRuleException>(() => applies.CreateAsync(room.Id, "", default))).Code);
        Assert.Equal("COURSE_NOT_FORMING", (await Assert.ThrowsAsync<BusinessRuleException>(() => applies.DecideAsync(apply.Id, true, default))).Code);
        Assert.Equal("COURSE_NOT_FORMING", (await Assert.ThrowsAsync<BusinessRuleException>(() => applies.DecideAsync(apply.Id, false, default))).Code);
        Assert.Equal("COURSE_NOT_FORMING", (await Assert.ThrowsAsync<BusinessRuleException>(() => applies.CancelAsync(apply.Id, default))).Code);
    }

    [Fact]
    public async Task Recommend_WhenStudentHasNoRoom_PassesRuleAndRoomSnapshots()
    {
        var room = await rooms.CreateAsync(courseId, default);
        SelectStudent(6);
        matching.Setup(x => x.RecommendRoomsAsync(It.IsAny<GroupTypeRule>(), "AI", It.IsAny<IReadOnlyList<RoomSnapshot>>(), 5, It.IsAny<CancellationToken>()))
            .ReturnsAsync([new RoomRecommendation(room.Id, room.Code, 10, true, [])]);
        var results = await rooms.RecommendAsync(courseId, 5, default);
        Assert.Equal(room.Id, Assert.Single(results).RoomId);
        matching.Verify(x => x.RecommendRoomsAsync(It.Is<GroupTypeRule>(r => r.MaxMemberCount == 6 && r.MajorRules.Any(m => m.MajorCode == "SE" && m.MaxQuantity == 3)),
            "AI", It.Is<IReadOnlyList<RoomSnapshot>>(s => s.Count == 1 && s[0].RoomId == room.Id && s[0].MemberMajorCodes.Contains("SE")),
            5, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Recommend_WhenStudentAlreadyInRoom_ReturnsEmptyWithoutMatching()
    {
        await rooms.CreateAsync(courseId, default);
        var result = await rooms.RecommendAsync(courseId, 5, default);
        Assert.Empty(result);
        matching.Verify(x => x.RecommendRoomsAsync(It.IsAny<GroupTypeRule>(), It.IsAny<string>(), It.IsAny<IReadOnlyList<RoomSnapshot>>(), It.IsAny<int>(), It.IsAny<CancellationToken>()), Times.Never);
    }

}

