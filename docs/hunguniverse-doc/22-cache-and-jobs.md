# Cache Redis và job nền

Tài liệu tham chiếu cho PRN232 Final v0.4 tại commit 2e3789f.

[Mục lục bộ tài liệu](01-architecture.md)

## Cách hoạt động

TeamService dùng Redis để đọc lại quy tắc loại nhóm và thống kê Course. Thời hạn mặc định lần lượt là 10 phút và 30 giây.

Khi hit, dữ liệu JSON được trả về. Khi miss hoặc lỗi đọc, trình gọi truy vấn nguồn dữ liệu. Mục thống kê bị xóa sau thao tác ghi có liên quan.

Job nền tìm Course `Forming` đã đến hạn và chuyển `Closed`. Job đóng Course đang chạy định kỳ; cấu hình và mẫu thư nhắc hạn không tự tạo ra job nhắc hạn.

## Cách kiểm tra

1. Đọc thống kê hai lần trong khoảng TTL và quan sát `X-Cache`.
2. Tạo dữ liệu Course thử sắp đến hạn để quan sát job đổi trạng thái và sự kiện đóng Course.

## Đối chiếu mã nguồn

Các trích đoạn dưới đây hỗ trợ tra cứu. Đường dẫn mở phần tương ứng trong repo.

### TeamCache.cs

Phần get-or-create, remove, TTL và xây key.

[src/TeamService/Infrastructure/Caching/TeamCache.cs dòng 1–48](../../src/TeamService/Infrastructure/Caching/TeamCache.cs#L1-L48)

~~~csharp
using System.Text.Json;
using Microsoft.Extensions.Caching.Distributed;

namespace Exe.TeamService.Infrastructure.Caching;

public interface ITeamCache
{
    Task<(T Value, bool Hit)> GetOrCreateAsync<T>(string key, TimeSpan lifetime, Func<CancellationToken, Task<T>> factory, CancellationToken ct);
    Task RemoveAsync(string key, CancellationToken ct);
}

public sealed class TeamCache(IDistributedCache cache, ILogger<TeamCache> logger) : ITeamCache
{
    public async Task<(T Value, bool Hit)> GetOrCreateAsync<T>(string key, TimeSpan lifetime, Func<CancellationToken, Task<T>> factory, CancellationToken ct)
    {
        try
        {
            var json = await cache.GetStringAsync(key, ct);
            if (json is not null)
            {
                var value = JsonSerializer.Deserialize<T>(json);
                if (value is not null)
                {
                    logger.LogDebug("Cache hit {Key}", key);
                    return (value, true);
                }
            }
        }
        catch (Exception ex) when (!ct.IsCancellationRequested) { logger.LogWarning(ex, "Cache read failed {Key}", key); }
        logger.LogDebug("Cache miss {Key}", key);
        var result = await factory(ct);
        try { await cache.SetStringAsync(key, JsonSerializer.Serialize(result), new DistributedCacheEntryOptions { AbsoluteExpirationRelativeToNow = lifetime }, ct); }
        catch (Exception ex) when (!ct.IsCancellationRequested) { logger.LogWarning(ex, "Cache write failed {Key}", key); }
        return (result, false);
    }

    public async Task RemoveAsync(string key, CancellationToken ct)
    {
        try { await cache.RemoveAsync(key, ct); }
        catch (Exception ex) when (!ct.IsCancellationRequested) { logger.LogWarning(ex, "Cache removal failed {Key}", key); }
    }
}

public static class TeamCacheKeys
{
    public static string GroupType(Guid id) => $"grouptype:{id}";
    public static string CourseStats(Guid id) => $"course:{id}:stats";
}
~~~

### CourseCloseJob.cs

Vòng lặp timer và phạm vi xử lý theo lượt.

[src/TeamService/Infrastructure/Jobs/CourseCloseJob.cs dòng 1–47](../../src/TeamService/Infrastructure/Jobs/CourseCloseJob.cs#L1-L47)

~~~csharp
namespace Exe.TeamService.Infrastructure.Jobs;

public sealed class CourseCloseJob(
    IServiceScopeFactory scopeFactory,
    IConfiguration configuration,
    IHostEnvironment environment,
    ILogger<CourseCloseJob> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (environment.IsEnvironment("Testing"))
        {
            return;
        }
        var seconds = configuration.GetValue("Jobs:CourseCloseIntervalSeconds", 60);
        if (seconds <= 0)
        {
            logger.LogWarning("Invalid course close interval {IntervalSeconds}; using 60 seconds", seconds);
            seconds = 60;
        }
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(seconds));
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                try
                {
                    using var scope = scopeFactory.CreateScope();
                    var processor = scope.ServiceProvider.GetRequiredService<CourseCloseProcessor>();
                    await processor.RunOnceAsync(DateTime.UtcNow, stoppingToken);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception ex)
                {
                    logger.LogError(ex, "Course close job failed for this interval");
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Normal shutdown.
        }
    }
}
~~~

### CourseCloseProcessor.cs

Chọn các Course quá hạn, lưu và phát sự kiện.

[src/TeamService/Infrastructure/Jobs/CourseCloseProcessor.cs dòng 1–43](../../src/TeamService/Infrastructure/Jobs/CourseCloseProcessor.cs#L1-L43)

~~~csharp
using Exe.TeamService.Abstractions;
using Exe.TeamService.Infrastructure.Caching;
using Exe.TeamService.Domain;
using Exe.TeamService.Services;

namespace Exe.TeamService.Infrastructure.Jobs;

public sealed class CourseCloseProcessor
{
    private readonly ICourseCloseRepository repository;
    private readonly IEventPublisher publisher;
    private readonly ITeamCache cache;

    internal CourseCloseProcessor(ICourseCloseRepository repository, IEventPublisher publisher, ITeamCache cache)
    {
        this.repository = repository;
        this.publisher = publisher;
        this.cache = cache;
    }

    public async Task<int> RunOnceAsync(DateTime utcNow, CancellationToken cancellationToken = default)
    {
        var courses = await repository.FindOverdueAsync(utcNow, cancellationToken);
        if (courses.Count == 0)
        {
            return 0;
        }
        var recipients = await repository.FindRecipientsAsync(courses.Select(x => x.Id).ToArray(), cancellationToken);
        foreach (var course in courses)
        {
            course.Status = CourseStatus.Closed;
        }
        await repository.SaveChangesAsync(cancellationToken);
        foreach (var course in courses)
        {
            await cache.RemoveAsync(TeamCacheKeys.CourseStats(course.Id), cancellationToken);
            recipients.TryGetValue(course.Id, out var courseRecipients);
            var envelope = RoomEventFactory.CourseClosed(course.Code, courseRecipients ?? []);
            await publisher.PublishAsync(envelope, cancellationToken);
        }
        return courses.Count;
    }
}
~~~

### CourseCloseRepository.cs

Đọc Course quá hạn và người nhận thông báo.

[src/TeamService/Infrastructure/Jobs/CourseCloseRepository.cs dòng 1–41](../../src/TeamService/Infrastructure/Jobs/CourseCloseRepository.cs#L1-L41)

~~~csharp
using Exe.Contracts.Events;
using Exe.TeamService.Data;
using Exe.TeamService.Domain;
using Microsoft.EntityFrameworkCore;

namespace Exe.TeamService.Infrastructure.Jobs;

internal interface ICourseCloseRepository
{
    Task<List<Course>> FindOverdueAsync(DateTime utcNow, CancellationToken cancellationToken);
    Task<Dictionary<Guid, IReadOnlyList<EventRecipient>>> FindRecipientsAsync(
        IReadOnlyCollection<Guid> courseIds, CancellationToken cancellationToken);
    Task SaveChangesAsync(CancellationToken cancellationToken);
}

internal sealed class CourseCloseRepository(TeamDbContext db) : ICourseCloseRepository
{
    public Task<List<Course>> FindOverdueAsync(DateTime utcNow, CancellationToken cancellationToken)
    {
        return db.Courses.Where(x => x.Status == CourseStatus.Forming && x.Deadline <= utcNow)
            .ToListAsync(cancellationToken);
    }

    public async Task<Dictionary<Guid, IReadOnlyList<EventRecipient>>> FindRecipientsAsync(
        IReadOnlyCollection<Guid> courseIds, CancellationToken cancellationToken)
    {
        var members = await db.StudentInRooms
            .Where(x => courseIds.Contains(x.CourseId) &&
                (x.Room.Status == RoomStatus.Open || x.Room.Status == RoomStatus.Locked))
            .Select(x => new { x.CourseId, x.Student.Email, x.Student.FullName })
            .ToListAsync(cancellationToken);
        return members.GroupBy(x => x.CourseId).ToDictionary(
            x => x.Key,
            x => (IReadOnlyList<EventRecipient>)x.Select(y => new EventRecipient(y.Email, y.FullName)).ToArray());
    }

    public async Task SaveChangesAsync(CancellationToken cancellationToken)
    {
        await db.SaveChangesAsync(cancellationToken);
    }
}
~~~

### TeamCacheTests.cs

Kiểm thử cache ở mức hành vi.

[tests/TeamService.Tests/Infrastructure/TeamCacheTests.cs dòng 1–31](../../tests/TeamService.Tests/Infrastructure/TeamCacheTests.cs#L1-L31)

~~~csharp
using Exe.TeamService.Infrastructure.Caching;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace Exe.TeamService.Tests.Infrastructure;

public class TeamCacheTests
{
    [Fact]
    public async Task GetOrCreate_AfterRemoval_MissesAgain()
    {
        var cache = TestCache.Create();
        var calls = 0;
        Task<int> Factory(CancellationToken _) => Task.FromResult(++calls);
        Assert.Equal((1, false), await cache.GetOrCreateAsync("key", TimeSpan.FromMinutes(1), Factory, default));
        Assert.Equal((1, true), await cache.GetOrCreateAsync("key", TimeSpan.FromMinutes(1), Factory, default));
        await cache.RemoveAsync("key", default);
        Assert.Equal((2, false), await cache.GetOrCreateAsync("key", TimeSpan.FromMinutes(1), Factory, default));
    }

    [Fact]
    public async Task GetOrCreate_WhenCacheFails_ReturnsFactoryValue()
    {
        var distributed = new Mock<IDistributedCache>();
        distributed.Setup(x => x.GetAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).ThrowsAsync(new InvalidOperationException());
        distributed.Setup(x => x.SetAsync(It.IsAny<string>(), It.IsAny<byte[]>(), It.IsAny<DistributedCacheEntryOptions>(), It.IsAny<CancellationToken>())).ThrowsAsync(new InvalidOperationException());
        var cache = new TeamCache(distributed.Object, NullLogger<TeamCache>.Instance);
        Assert.Equal((42, false), await cache.GetOrCreateAsync("key", TimeSpan.FromMinutes(1), _ => Task.FromResult(42), default));
    }
}
~~~

### CourseCloseJobTests.cs

Kiểm thử timer job và điều kiện môi trường.

[tests/TeamService.Tests/Infrastructure/CourseCloseJobTests.cs dòng 1–88](../../tests/TeamService.Tests/Infrastructure/CourseCloseJobTests.cs#L1-L88)

~~~csharp
using Exe.TeamService.Abstractions;
using Exe.TeamService.Domain;
using Exe.TeamService.Infrastructure.Jobs;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Moq;

namespace Exe.TeamService.Tests.Infrastructure;

public sealed class CourseCloseJobTests
{
    [Fact]
    public async Task Execute_WhenOneTickFails_ContinuesWithNewScope()
    {
        var scopeCount = 0;
        var completed = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var repository = new FlakyRepository(completed);
        var services = new ServiceCollection();
        services.AddScoped<ICourseCloseRepository>(_ =>
        {
            Interlocked.Increment(ref scopeCount);
            return repository;
        });
        services.AddSingleton(Mock.Of<IEventPublisher>());
        services.AddScoped(sp => new CourseCloseProcessor(sp.GetRequiredService<ICourseCloseRepository>(), sp.GetRequiredService<IEventPublisher>(), TestCache.Create()));
        await using var provider = services.BuildServiceProvider();
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jobs:CourseCloseIntervalSeconds"] = "1"
        }).Build();
        var environment = new Mock<IHostEnvironment>();
        environment.SetupGet(x => x.EnvironmentName).Returns("Production");
        var logger = new Mock<ILogger<CourseCloseJob>>();
        using var job = new CourseCloseJob(provider.GetRequiredService<IServiceScopeFactory>(), config, environment.Object, logger.Object);
        await job.StartAsync(CancellationToken.None);
        try
        {
            await completed.Task.WaitAsync(TimeSpan.FromSeconds(8));
        }
        finally
        {
            await job.StopAsync(CancellationToken.None);
        }
        Assert.True(scopeCount >= 2);
        logger.Verify(x => x.Log(LogLevel.Error, It.IsAny<EventId>(), It.IsAny<It.IsAnyType>(),
            It.IsAny<Exception>(), It.IsAny<Func<It.IsAnyType, Exception?, string>>()), Times.Once);
    }

    [Fact]
    public async Task Execute_WhenTesting_DoesNotCreateScope()
    {
        var scopeFactory = new Mock<IServiceScopeFactory>();
        var environment = new Mock<IHostEnvironment>();
        environment.SetupGet(x => x.EnvironmentName).Returns("Testing");
        using var job = new CourseCloseJob(scopeFactory.Object, new ConfigurationBuilder().Build(), environment.Object,
            Mock.Of<ILogger<CourseCloseJob>>());
        await job.StartAsync(CancellationToken.None);
        await job.StopAsync(CancellationToken.None);
        scopeFactory.Verify(x => x.CreateScope(), Times.Never);
    }
    private sealed class FlakyRepository(TaskCompletionSource completed) : ICourseCloseRepository
    {
        private int ticks;

        public Task<List<Course>> FindOverdueAsync(DateTime utcNow, CancellationToken cancellationToken)
        {
            if (Interlocked.Increment(ref ticks) == 1)
            {
                throw new InvalidOperationException("temporary error");
            }
            completed.TrySetResult();
            return Task.FromResult(new List<Course>());
        }

        public Task<Dictionary<Guid, IReadOnlyList<Exe.Contracts.Events.EventRecipient>>> FindRecipientsAsync(
            IReadOnlyCollection<Guid> courseIds, CancellationToken cancellationToken)
        {
            throw new NotSupportedException();
        }

        public Task SaveChangesAsync(CancellationToken cancellationToken)
        {
            throw new NotSupportedException();
        }
    }
}
~~~
