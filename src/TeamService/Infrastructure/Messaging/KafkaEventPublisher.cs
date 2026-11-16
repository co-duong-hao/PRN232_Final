using System.Text;
using Exe.TeamService.Infrastructure;
using Confluent.Kafka;
using Exe.Contracts.Events;
using Exe.TeamService.Abstractions;

namespace Exe.TeamService.Infrastructure.Messaging;

public sealed class KafkaEventPublisher(IProducer<string, string> producer, IConfiguration configuration, ILogger<KafkaEventPublisher> logger, TeamMetrics metrics) : IEventPublisher, IDisposable
{
    public async Task PublishAsync(EventEnvelope envelope, CancellationToken cancellationToken = default)
    {
        try
        {
            await producer.ProduceAsync(configuration["Kafka:Topic"] ?? KafkaTopics.Events, new Message<string, string>
            {
                Key = envelope.EventKey, Value = envelope.ToJson(),
                Headers = new Headers { { KafkaTopics.TypeHeader, Encoding.UTF8.GetBytes(envelope.Type) } }
            }, cancellationToken);
            metrics.KafkaPublished(envelope.Type, "ok");
        }
        catch (Exception ex)
        {
            metrics.KafkaPublished(envelope.Type, "failed");
            logger.LogError(ex, "Failed to publish event {EventId} of type {EventType}", envelope.EventId, envelope.Type);
        }
    }

    public void Dispose() => producer.Flush(TimeSpan.FromSeconds(5));
}
