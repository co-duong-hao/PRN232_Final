namespace Exe.NotiService.Workers;

/// <summary>
/// Placeholder. T3 replaces the body with the Redis Streams consumer-group loop
/// (docs/design/events.md): read, send email, acknowledge.
/// </summary>
public sealed class EventConsumerWorker(ILogger<EventConsumerWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogWarning("Event consumer is not implemented yet; no events will be processed");
        await Task.Delay(Timeout.Infinite, stoppingToken);
    }
}
