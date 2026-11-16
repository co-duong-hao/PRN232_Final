namespace Exe.TeamService.Infrastructure.Jobs;

public sealed class CourseCloseJob(
    IServiceScopeFactory scopeFactory,
    IConfiguration configuration,
    IHostEnvironment environment,
    ILogger<CourseCloseJob> logger,
    TeamMetrics metrics) : BackgroundService
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
                    metrics.CourseCloseJobRun("ok");
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception ex)
                {
                    metrics.CourseCloseJobRun("failed");
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
