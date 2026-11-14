using Exe.Contracts.Events;
using Exe.TeamService.Abstractions;
using StackExchange.Redis;

namespace Exe.TeamService.Infrastructure.Messaging;

public sealed class RedisStreamEventPublisher(
    IConnectionMultiplexer connection,
    IConfiguration configuration,
    ILogger<RedisStreamEventPublisher> logger) : IEventPublisher
{
    public async Task PublishAsync(EventEnvelope envelope, CancellationToken cancellationToken = default)
    {
        try
        {
            var stream = configuration["Redis:Stream"] ?? EventStreams.Default;
            var fields = new NameValueEntry[]
            {
                new(EventStreams.TypeField, envelope.Type),
                new(EventStreams.PayloadField, envelope.ToJson())
            };
            await connection.GetDatabase().StreamAddAsync(stream, fields).WaitAsync(cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to publish event {EventId} of type {EventType}", envelope.EventId, envelope.Type);
        }
    }
}
