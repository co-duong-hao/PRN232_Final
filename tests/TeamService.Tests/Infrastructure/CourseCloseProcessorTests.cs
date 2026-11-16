using Exe.Contracts.Events;
using Exe.TeamService.Abstractions;
using Exe.TeamService.Data;
using Exe.TeamService.Domain;
using Exe.TeamService.Infrastructure.Jobs;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Moq;

namespace Exe.TeamService.Tests.Infrastructure;

public sealed class CourseCloseProcessorTests : IAsyncLifetime
{
    private readonly SqliteConnection connection = new("DataSource=:memory:");
    private readonly Mock<IEventPublisher> publisher = new();
    private readonly List<EventEnvelope> events = [];
    private TeamDbContext db = null!;
    private CourseCloseProcessor processor = null!;
    private readonly DateTime now = new(2026, 12, 15, 0, 0, 0, DateTimeKind.Utc);

    public async Task InitializeAsync()
    {
        await connection.OpenAsync();
        db = new TeamDbContext(new DbContextOptionsBuilder<TeamDbContext>().UseSqlite(connection).Options);
        await db.Database.EnsureCreatedAsync();
        await TeamDbSeeder.SeedAsync(db);
        var other = await db.Courses.SingleAsync(x => x.Code == "FA26-EXE201");
        other.Status = CourseStatus.Planned;
        await db.SaveChangesAsync();
        publisher.Setup(x => x.PublishAsync(It.IsAny<EventEnvelope>(), It.IsAny<CancellationToken>()))
            .Callback<EventEnvelope, CancellationToken>((item, _) => events.Add(item))
            .Returns(Task.CompletedTask);
        processor = new CourseCloseProcessor(new CourseCloseRepository(db), publisher.Object, TestCache.Create());
    }

    public async Task DisposeAsync()
    {
        await db.DisposeAsync();
        await connection.DisposeAsync();
    }

    [Fact]
    public async Task RunOnce_WhenDeadlineReached_ClosesAndPublishesToActiveRoomMembersAfterSave()
    {
        var course = await db.Courses.SingleAsync(x => x.Code == "FA26-EXE101");
        course.Deadline = now;
        var students = await db.Students.OrderBy(x => x.StudentCode).Take(4).ToArrayAsync();
        var open = new Room { CourseId = course.Id, LeaderId = students[0].Id, Code = "OPEN", Status = RoomStatus.Open };
        var locked = new Room { CourseId = course.Id, LeaderId = students[1].Id, Code = "LOCKED", Status = RoomStatus.Locked };
        var completed = new Room { CourseId = course.Id, LeaderId = students[2].Id, Code = "COMPLETED", Status = RoomStatus.Completed };
        var cancelled = new Room { CourseId = course.Id, LeaderId = students[3].Id, Code = "CANCELLED", Status = RoomStatus.Cancelled };
        db.Rooms.AddRange(open, locked, completed, cancelled);
        db.StudentInRooms.AddRange(
            new StudentInRoom { Room = open, StudentId = students[0].Id, CourseId = course.Id },
            new StudentInRoom { Room = locked, StudentId = students[1].Id, CourseId = course.Id },
            new StudentInRoom { Room = completed, StudentId = students[2].Id, CourseId = course.Id },
            new StudentInRoom { Room = cancelled, StudentId = students[3].Id, CourseId = course.Id });
        await db.SaveChangesAsync();
        publisher.Setup(x => x.PublishAsync(It.IsAny<EventEnvelope>(), It.IsAny<CancellationToken>()))
            .Callback<EventEnvelope, CancellationToken>((item, _) =>
            {
                Assert.Equal(CourseStatus.Closed, db.Courses.AsNoTracking().Single(x => x.Id == course.Id).Status);
                events.Add(item);
            }).Returns(Task.CompletedTask);

        var count = await processor.RunOnceAsync(now);

        Assert.Equal(1, count);
        var published = Assert.Single(events);
        Assert.Equal(EventTypes.CourseClosed, published.Type);
        Assert.Equal(course.Code, published.Data[EventDataKeys.CourseCode]);
        Assert.Equal(students.Take(2).Select(x => x.Email).OrderBy(x => x), published.Recipients.Select(x => x.Email).OrderBy(x => x));
        Assert.Equal(students.Take(2).Select(x => x.FullName).OrderBy(x => x), published.Recipients.Select(x => x.FullName).OrderBy(x => x));
        Assert.Equal(0, await processor.RunOnceAsync(now));
        Assert.Single(events);
    }

    [Fact]
    public async Task RunOnce_WhenFuturePlannedOrClosed_DoesNotChangeOrPublish()
    {
        var forming = await db.Courses.SingleAsync(x => x.Code == "FA26-EXE101");
        var planned = await db.Courses.SingleAsync(x => x.Code == "FA26-EXE201");
        forming.Deadline = now.AddTicks(1);
        planned.Deadline = now.AddDays(-1);
        var subject = new Subject { Code = "EXE301", Name = "Other" };
        var closed = new Course
        {
            Code = "FA26-EXE301",
            SemesterId = forming.SemesterId,
            Subject = subject,
            GroupTypeId = forming.GroupTypeId,
            Status = CourseStatus.Closed,
            StartTime = now.AddDays(-3),
            Deadline = now.AddDays(-1)
        };
        db.Courses.Add(closed);
        await db.SaveChangesAsync();

        Assert.Equal(0, await processor.RunOnceAsync(now));
        Assert.Equal(CourseStatus.Forming, forming.Status);
        Assert.Equal(CourseStatus.Planned, planned.Status);
        Assert.Equal(CourseStatus.Closed, closed.Status);
        Assert.Empty(events);
    }

    [Fact]
    public async Task RunOnce_WhenNoActiveMembers_PublishesWithEmptyRecipients()
    {
        var course = await db.Courses.SingleAsync(x => x.Code == "FA26-EXE101");
        course.Deadline = now.AddDays(-1);
        await db.SaveChangesAsync();
        Assert.Equal(1, await processor.RunOnceAsync(now));
        Assert.Empty(Assert.Single(events).Recipients);
    }
    [Fact]
    public async Task RunOnce_WhenSaveFails_DoesNotPublish()
    {
        var repository = new FailingSaveRepository();
        var failingProcessor = new CourseCloseProcessor(repository, publisher.Object, TestCache.Create());
        await Assert.ThrowsAsync<InvalidOperationException>(() => failingProcessor.RunOnceAsync(now));
        Assert.Empty(events);
        publisher.Verify(x => x.PublishAsync(It.IsAny<EventEnvelope>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    private sealed class FailingSaveRepository : ICourseCloseRepository
    {
        public Task<List<Course>> FindOverdueAsync(DateTime utcNow, CancellationToken cancellationToken)
        {
            return Task.FromResult(new List<Course> { new() { Code = "FAIL", Status = CourseStatus.Forming } });
        }

        public Task<Dictionary<Guid, IReadOnlyList<EventRecipient>>> FindRecipientsAsync(
            IReadOnlyCollection<Guid> courseIds, CancellationToken cancellationToken)
        {
            return Task.FromResult(new Dictionary<Guid, IReadOnlyList<EventRecipient>>());
        }

        public Task SaveChangesAsync(CancellationToken cancellationToken)
        {
            throw new InvalidOperationException("save failed");
        }
    }

    [Fact]
    public async Task RunOnce_WhenSeveralCoursesOverdue_ClosesAndPublishesForEach()
    {
        var first = await db.Courses.SingleAsync(x => x.Code == "FA26-EXE101");
        var second = await db.Courses.SingleAsync(x => x.Code == "FA26-EXE201");
        first.Deadline = now.AddDays(-1);
        second.Deadline = now.AddDays(-2);
        second.Status = CourseStatus.Forming;
        await db.SaveChangesAsync();
        Assert.Equal(2, await processor.RunOnceAsync(now));
        Assert.Equal(2, events.Count);
        Assert.Equal(new[] { first.Code, second.Code }.OrderBy(x => x),
            events.Select(x => x.Data[EventDataKeys.CourseCode]).OrderBy(x => x));
        Assert.All(events, x => Assert.Equal(EventTypes.CourseClosed, x.Type));
        Assert.Equal(CourseStatus.Closed, first.Status);
        Assert.Equal(CourseStatus.Closed, second.Status);
    }

}
