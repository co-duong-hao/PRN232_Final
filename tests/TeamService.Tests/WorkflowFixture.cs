using Exe.Contracts.Events;
using Exe.Shared.Web.Auth;
using Exe.TeamService.Abstractions;
using Exe.TeamService.Data;
using Exe.TeamService.Domain;
using Exe.TeamService.Dtos;
using Exe.TeamService.Services;
using Exe.TeamService.Infrastructure.Caching;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using System.Diagnostics.Metrics;
using Exe.TeamService.Infrastructure;
using Microsoft.Extensions.Options;
using Moq;

namespace Exe.TeamService.Tests;

public abstract class WorkflowFixture : IAsyncLifetime
{
    private readonly SqliteConnection connection = new("Data Source=:memory:");
    private readonly Mock<ICurrentUser> user = new();
    private readonly ServiceProvider meters = new ServiceCollection().AddMetrics().BuildServiceProvider();
    private Guid userId;
    private string userRole = Exe.Contracts.Roles.Student;
    private Dictionary<string, Guid> roles = null!;

    protected static CancellationToken Ct => CancellationToken.None;
    protected TeamDbContext Db { get; private set; } = null!;
    protected ITeamCache Cache { get; private set; } = null!;
    protected RoomService Rooms { get; private set; } = null!;
    protected RoomApplyService Applies { get; private set; } = null!;
    protected CourseService Courses { get; private set; } = null!;
    protected TeamReadService Read { get; private set; } = null!;
    protected ReferenceService References { get; private set; } = null!;
    protected Mock<IMatchingClient> Matching { get; } = new(MockBehavior.Strict);
    protected List<EventEnvelope> Events { get; } = [];
    protected Guid FirstCourse { get; private set; }
    protected Guid SecondCourse { get; private set; }

    public async Task InitializeAsync()
    {
        await connection.OpenAsync(Ct);
        Db = NewReader();
        await Db.Database.EnsureCreatedAsync(Ct);
        await TeamDbSeeder.SeedAsync(Db, Ct);
        FirstCourse = await Db.Courses.Where(x => x.Code == "FA26-EXE101").Select(x => x.Id).SingleAsync(Ct);
        SecondCourse = await Db.Courses.Where(x => x.Code == "FA26-EXE201").Select(x => x.Id).SingleAsync(Ct);
        roles = await Db.TeamRoles.ToDictionaryAsync(x => x.Code, x => x.Id, Ct);

        AsStudent(1);
        user.SetupGet(x => x.UserId).Returns(() => userId);
        user.Setup(x => x.IsInRole(It.IsAny<string>())).Returns((string role) => role == userRole);
        var publisher = new Mock<IEventPublisher>();
        publisher.Setup(x => x.PublishAsync(It.IsAny<EventEnvelope>(), It.IsAny<CancellationToken>()))
            .Callback<EventEnvelope, CancellationToken>((envelope, _) => Events.Add(envelope))
            .Returns(Task.CompletedTask);
        var options = Options.Create(new RoomOptions());
        var metrics = new TeamMetrics(meters.GetRequiredService<IMeterFactory>());
        Cache = TestCache.Create();
        References = new ReferenceService(Db, Cache);
        Rooms = new RoomService(Db, user.Object, Matching.Object, publisher.Object, options, Cache, References,
            new ConfigurationBuilder().Build(), metrics);
        Applies = new RoomApplyService(Db, Rooms, publisher.Object, options, metrics);
        Courses = new CourseService(Db, Rooms, publisher.Object, Cache);
        Read = new TeamReadService(Db, user.Object, Rooms);
    }

    public async Task DisposeAsync()
    {
        await meters.DisposeAsync();
        await Db.DisposeAsync();
        await connection.DisposeAsync();
    }

    protected TeamDbContext NewReader()
    {
        var options = new DbContextOptionsBuilder<TeamDbContext>()
            .UseSqlite(connection)
            .Options;
        return new TeamDbContext(options);
    }

    protected void AsStudent(int number)
    {
        userId = Guid.Parse($"10000000-0000-0000-0000-{number:000000000000}");
        userRole = Exe.Contracts.Roles.Student;
    }

    protected void AsRole(string role) => userRole = role;

    protected static Guid Student(int number) =>
        Guid.Parse($"20000000-0000-0000-0000-{number:000000000000}");

    protected Guid Role(string code) => roles[code];

    protected async Task<RoomDto> MakeRoom(int leader = 1, Guid? course = null, RoomProfileRequest? profile = null)
    {
        AsStudent(leader);
        return await Rooms.CreateAsync(course ?? FirstCourse, profile, Ct);
    }

    protected async Task<RoomDto> Join(RoomDto room, int student)
    {
        AsStudent(student);
        return await Rooms.JoinAsync(room.Id, Ct);
    }

    protected async Task<RoomDto> MakeLocked(int leader = 1, int second = 2, int third = 6, Guid? course = null)
    {
        var room = await MakeRoom(leader, course);
        await Join(room, second);
        return await Join(room, third);
    }

    protected async Task<ApplyDto> Send(RoomDto room, int student, string message = "Em muốn tham gia dự án")
    {
        AsStudent(student);
        return await Applies.CreateAsync(room.Id, message, Ct);
    }
}
