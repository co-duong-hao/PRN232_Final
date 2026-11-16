using Exe.Contracts.Events;
using Microsoft.Extensions.Configuration;
using Exe.TeamService.Infrastructure.Caching;
using Exe.Shared.Web.Auth;
using Exe.Shared.Web.Errors;
using Exe.Shared.Web.Paging;
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

public sealed class CatalogTests : IAsyncLifetime
{
    private readonly SqliteConnection connection = new("DataSource=:memory:");
    private readonly Mock<IEventPublisher> publisher = new();
    private readonly Mock<ICurrentUser> user = new();
    private TeamDbContext db = null!;
    private ITeamCache cache = null!;
    private CourseService courses = null!;
    private ReferenceService references = null!;

    public async Task InitializeAsync()
    {
        await connection.OpenAsync();
        db = new TeamDbContext(new DbContextOptionsBuilder<TeamDbContext>().UseSqlite(connection).Options);
        await db.Database.EnsureCreatedAsync();
        await TeamDbSeeder.SeedAsync(db);
        user.SetupGet(x => x.UserId).Returns(Guid.Parse("10000000-0000-0000-0000-000000000001"));
        cache = TestCache.Create();
        references = new ReferenceService(db, cache);
        var rooms = new RoomService(db, user.Object, Mock.Of<IMatchingClient>(), publisher.Object, Options.Create(new RoomOptions()), cache, references, new ConfigurationBuilder().Build());
        courses = new CourseService(db, rooms, publisher.Object, cache);
    }

    public async Task DisposeAsync()
    {
        await db.DisposeAsync();
        await connection.DisposeAsync();
    }

    [Fact]
    public async Task List_WhenFiltered_ReturnsExpectedCourse()
    {
        var result = await courses.ListAsync(new CourseQuery { Status = "Forming", Q = "EXE101" }, default);
        Assert.Equal("FA26-EXE101", Assert.Single(result.Items).Code);
        Assert.Equal(12, result.Items[0].StudentCount);
    }

    [Fact]
    public async Task Close_WhenForming_SendsEventAndChangesStatus()
    {
        var course = await db.Courses.SingleAsync(x => x.Code == "FA26-EXE101");
        var result = await courses.TransitionAsync(course.Id, false, default);
        Assert.Equal("Closed", result.Status);
        publisher.Verify(x => x.PublishAsync(It.Is<EventEnvelope>(e => e.Type == EventTypes.CourseClosed && e.Data[EventDataKeys.CourseCode] == "FA26-EXE101"), It.IsAny<CancellationToken>()), Times.Once);
        Assert.Equal("INVALID_COURSE_STATE", (await Assert.ThrowsAsync<BusinessRuleException>(() => courses.TransitionAsync(course.Id, false, default))).Code);
    }

    [Fact]
    public async Task Delete_WhenPlannedAndEnrolled_RemovesEnrollments()
    {
        var course = await db.Courses.SingleAsync(x => x.Code == "FA26-EXE201");
        course.Status = CourseStatus.Planned;
        await db.SaveChangesAsync();
        var student = await db.Students.FirstAsync();
        await courses.EnrollAsync(course.Id, [student.Id], default);
        await courses.DeleteAsync(course.Id, default);
        Assert.False(await db.Courses.AnyAsync(x => x.Id == course.Id));
        Assert.False(await db.StudentInCourses.AnyAsync(x => x.CourseId == course.Id));
    }

    [Fact]
    public async Task GroupType_WhenReplacingMajors_UpdatesExistingAndRemovesOmitted()
    {
        var type = await db.GroupTypes.Include(x => x.Majors).SingleAsync();
        var existing = type.Majors.Single().MajorId;
        var second = await db.Majors.Where(x => x.Code == "AI").Select(x => x.Id).SingleAsync();
        var result = await references.SaveGroupTypeAsync(null, new GroupTypeRequest("Khác", 2, 5, 2,
            [new(existing, 1, 2), new(second, 0, 2)]), default);
        result = await references.SaveGroupTypeAsync(result.Id, new GroupTypeRequest("Đổi", 2, 5, 2,
            [new(existing, 2, 3)]), default);
        Assert.Equal("Đổi", result.Name);
        Assert.Equal(2, Assert.Single(result.Majors).MinQuantity);
        Assert.Equal(existing, result.Majors[0].MajorId);
    }

    [Fact]
    public async Task GroupType_WhenDuplicateMajor_RejectsRequest()
    {
        var major = await db.Majors.Select(x => x.Id).FirstAsync();
        await Assert.ThrowsAsync<BadRequestException>(() => references.SaveGroupTypeAsync(null,
            new GroupTypeRequest("Nhóm", 1, 4, 1, [new(major, 1, 2), new(major, 1, 2)]), default));
    }

    [Fact]
    public async Task Lookups_WhenReferenced_RejectsDelete()
    {
        var semester = await db.Semesters.SingleAsync();
        Assert.Equal("IN_USE", (await Assert.ThrowsAsync<BusinessRuleException>(() => references.DeleteAsync("semesters", semester.Id, default))).Code);
        var page = await references.ListAsync("semesters", new PageQuery { Q = "FA26" }, default);
        Assert.Equal("FA26", Assert.Single(page.Items).Code);
    }
    [Fact]
    public async Task Students_WhenFilteredByRoom_ReturnsMatchingEnrollment()
    {
        var course = await db.Courses.SingleAsync(x => x.Code == "FA26-EXE101");
        var service = new RoomService(db, user.Object, Mock.Of<IMatchingClient>(), publisher.Object, Options.Create(new RoomOptions()), cache, references, new ConfigurationBuilder().Build());
        var room = await service.CreateAsync(course.Id, default);
        var page = await courses.StudentsAsync(course.Id, new CourseStudentQuery { HasRoom = true }, default);
        Assert.Equal(room.LeaderId, Assert.Single(page.Items).Id);
        Assert.True(page.Items[0].HasRoom);
    }

    [Fact]
    public async Task MyCourses_WhenEnrolled_ReturnsRoomWithCourse()
    {
        var course = await db.Courses.SingleAsync(x => x.Code == "FA26-EXE101");
        var service = new RoomService(db, user.Object, Mock.Of<IMatchingClient>(), publisher.Object, Options.Create(new RoomOptions()), cache, references, new ConfigurationBuilder().Build());
        var room = await service.CreateAsync(course.Id, default);
        var page = await courses.MyCoursesAsync(new PageQuery(), default);
        var item = Assert.Single(page.Items, x => x.Id == course.Id);
        Assert.Equal(course.Id, item.Id);
        Assert.Equal(room.Id, item.MyRoom!.Id);
        Assert.Null(item.MyGroup);
    }

    [Fact]
    public async Task Close_WhenRoomOpen_PublishesOnlyItsMembers()
    {
        var course = await db.Courses.SingleAsync(x => x.Code == "FA26-EXE101");
        var service = new RoomService(db, user.Object, Mock.Of<IMatchingClient>(), publisher.Object, Options.Create(new RoomOptions()), cache, references, new ConfigurationBuilder().Build());
        await service.CreateAsync(course.Id, default);
        await courses.TransitionAsync(course.Id, false, default);
        publisher.Verify(x => x.PublishAsync(It.Is<EventEnvelope>(e => e.Type == EventTypes.CourseClosed &&
            e.Recipients.Count == 1 && e.Recipients[0].Email == "student01@exe.local"), It.IsAny<CancellationToken>()), Times.Once);
    }

}
