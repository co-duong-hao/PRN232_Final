using Confluent.Kafka;
using Exe.NotiService.Options;
using Microsoft.Extensions.Options;
using System.Text;

namespace Exe.NotiService.Workers;

public interface IDeadLetterPublisher
{
    Task PublishAsync(Message<string, string> message, string error, CancellationToken cancellationToken);
}

public sealed class DeadLetterPublisher : IDeadLetterPublisher, IDisposable
{
    private readonly IProducer<string, string> producer;
    private readonly string topic;

    public DeadLetterPublisher(IOptions<KafkaOptions> options)
    {
        topic = options.Value.DeadLetterTopic;
        producer = new ProducerBuilder<string, string>(new ProducerConfig
        {
            BootstrapServers = options.Value.BootstrapServers,
            Acks = Acks.All,
            EnableIdempotence = true
        }).Build();
    }

    public async Task PublishAsync(Message<string, string> message, string error, CancellationToken cancellationToken)
    {
        var headers = new Headers();
        if (message.Headers is not null)
            foreach (var header in message.Headers)
                headers.Add(header.Key, header.GetValueBytes());
        headers.Add("error", Encoding.UTF8.GetBytes(error));
        headers.Add("failed-at", Encoding.UTF8.GetBytes(DateTimeOffset.UtcNow.ToString("O")));
        await producer.ProduceAsync(topic, new Message<string, string>
        {
            Key = message.Key, Value = message.Value, Headers = headers
        }, cancellationToken);
    }

    public void Dispose()
    {
        producer.Flush(TimeSpan.FromSeconds(5));
        producer.Dispose();
    }
}
