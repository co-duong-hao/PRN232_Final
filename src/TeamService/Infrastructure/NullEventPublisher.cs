using Exe.Contracts.Events;
using Exe.TeamService.Abstractions;

namespace Exe.TeamService.Infrastructure;

/// <summary>Placeholder used until T4 adds the Redis Streams publisher. Logs the event and drops it.</summary>
public sealed class NullEventPublisher(ILogger<NullEventPublisher> logger) : IEventPublisher
{
    public Task PublishAsync(EventEnvelope envelope, CancellationToken cancellationToken = default)
    {
        logger.LogInformation("Event {EventType} {EventId} not published: no broker configured",
            envelope.Type, envelope.EventId);
        return Task.CompletedTask;
    }
}
