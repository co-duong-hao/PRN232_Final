using Confluent.Kafka;
using Exe.Contracts.Events;
using Exe.TeamService.Infrastructure.Messaging;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace Exe.TeamService.Tests.Infrastructure;

public class KafkaEventPublisherTests
{
    [Fact]
    public async Task Publish_WhenSuccessful_SendsKeyPayloadAndTypeHeader()
    {
        var producer = new Mock<IProducer<string, string>>();
        Message<string, string>? sent = null;
        producer.Setup(x => x.ProduceAsync(KafkaTopics.Events, It.IsAny<Message<string, string>>(), It.IsAny<CancellationToken>()))
            .Callback<string, Message<string, string>, CancellationToken>((_, message, _) => sent = message)
            .ReturnsAsync(new DeliveryResult<string, string>());
        var publisher = new KafkaEventPublisher(producer.Object, new ConfigurationBuilder().Build(), NullLogger<KafkaEventPublisher>.Instance, TestMetrics.Create());
        var envelope = new EventEnvelope { Type = EventTypes.RoomCreated, Data = new Dictionary<string, string> { [EventDataKeys.RoomCode] = "ROOM-1" } };
        await publisher.PublishAsync(envelope);
        Assert.NotNull(sent);
        Assert.Equal("ROOM-1", sent.Key);
        Assert.Equal(envelope.EventId, EventEnvelope.FromJson(sent.Value)!.EventId);
        Assert.Equal(envelope.Type, System.Text.Encoding.UTF8.GetString(sent.Headers.GetLastBytes(KafkaTopics.TypeHeader)));
    }

    [Fact]
    public async Task Publish_WhenProducerThrows_DoesNotThrow()
    {
        var producer = new Mock<IProducer<string, string>>();
        producer.Setup(x => x.ProduceAsync(It.IsAny<string>(), It.IsAny<Message<string, string>>(), It.IsAny<CancellationToken>())).ThrowsAsync(new InvalidOperationException());
        var publisher = new KafkaEventPublisher(producer.Object, new ConfigurationBuilder().Build(), NullLogger<KafkaEventPublisher>.Instance, TestMetrics.Create());
        await publisher.PublishAsync(new EventEnvelope { Type = EventTypes.RoomCreated });
    }
}
