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
        var metrics = TestMetrics.Create();
        using var listener = new MetricCapture(metrics);
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
        services.AddScoped(sp => new CourseCloseProcessor(sp.GetRequiredService<ICourseCloseRepository>(), sp.GetRequiredService<IEventPublisher>(), TestCache.Create(), TestMetrics.Create()));
        await using var provider = services.BuildServiceProvider();
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jobs:CourseCloseIntervalSeconds"] = "1"
        }).Build();
        var environment = new Mock<IHostEnvironment>();
        environment.SetupGet(x => x.EnvironmentName).Returns("Production");
        var logger = new Mock<ILogger<CourseCloseJob>>();
        using var job = new CourseCloseJob(provider.GetRequiredService<IServiceScopeFactory>(), config, environment.Object, logger.Object, metrics);
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
        Assert.Equal(1, listener.Count("exe.course.close.job.runs", "result", "failed"));
        Assert.True(listener.Count("exe.course.close.job.runs", "result", "ok") >= 1);
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
            Mock.Of<ILogger<CourseCloseJob>>(), TestMetrics.Create());
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
