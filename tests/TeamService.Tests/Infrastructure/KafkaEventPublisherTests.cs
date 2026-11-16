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
    public async Task Publish_WhenSuccessful_SendsKeyPayloadTypeHeaderAndRecordsOkMetric()
    {
        var producer = new Mock<IProducer<string, string>>();
        Message<string, string>? sent = null;
        producer.Setup(x => x.ProduceAsync(KafkaTopics.Events, It.IsAny<Message<string, string>>(), It.IsAny<CancellationToken>()))
            .Callback<string, Message<string, string>, CancellationToken>((_, message, _) => sent = message)
            .ReturnsAsync(new DeliveryResult<string, string>());
        var metrics = TestMetrics.Create();
        using var capture = new MetricCapture(metrics);
        var publisher = new KafkaEventPublisher(producer.Object, new ConfigurationBuilder().Build(), NullLogger<KafkaEventPublisher>.Instance, metrics);
        var envelope = new EventEnvelope { Type = EventTypes.RoomCreated, Data = new Dictionary<string, string> { [EventDataKeys.RoomCode] = "ROOM-1" } };

        await publisher.PublishAsync(envelope);

        Assert.NotNull(sent);
        Assert.Equal("ROOM-1", sent.Key);
        Assert.Equal(envelope.EventId, EventEnvelope.FromJson(sent.Value)!.EventId);
        Assert.Equal(envelope.Type, System.Text.Encoding.UTF8.GetString(sent.Headers.GetLastBytes(KafkaTopics.TypeHeader)));
        Assert.Equal(1, capture.Count("exe.kafka.events.published", ("type", EventTypes.RoomCreated), ("result", "ok")));
        Assert.Equal(0, capture.Count("exe.kafka.events.published", ("result", "failed")));
    }

    [Fact]
    public async Task Publish_WhenProducerThrows_DoesNotThrowAndRecordsFailedMetric()
    {
        var producer = new Mock<IProducer<string, string>>();
        producer.Setup(x => x.ProduceAsync(It.IsAny<string>(), It.IsAny<Message<string, string>>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException());
        var metrics = TestMetrics.Create();
        using var capture = new MetricCapture(metrics);
        var publisher = new KafkaEventPublisher(producer.Object, new ConfigurationBuilder().Build(), NullLogger<KafkaEventPublisher>.Instance, metrics);

        await publisher.PublishAsync(new EventEnvelope { Type = EventTypes.RoomCompleted });

        Assert.Equal(1, capture.Count("exe.kafka.events.published", ("type", EventTypes.RoomCompleted), ("result", "failed")));
        Assert.Equal(0, capture.Count("exe.kafka.events.published", ("result", "ok")));
    }

    [Theory]
    [InlineData("custom.events", "custom.events")]
    [InlineData("", KafkaTopics.Events)]
    [InlineData("   ", KafkaTopics.Events)]
    public async Task Publish_WhenTopicConfigured_UsesConfiguredTopicOrFallsBackToDefault(string configuredTopic, string expectedTopic)
    {
        var producer = new Mock<IProducer<string, string>>();
        string? actualTopic = null;
        producer.Setup(x => x.ProduceAsync(It.IsAny<string>(), It.IsAny<Message<string, string>>(), It.IsAny<CancellationToken>()))
            .Callback<string, Message<string, string>, CancellationToken>((topic, _, _) => actualTopic = topic)
            .ReturnsAsync(new DeliveryResult<string, string>());
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Kafka:Topic"] = configuredTopic })
            .Build();
        var publisher = new KafkaEventPublisher(producer.Object, config, NullLogger<KafkaEventPublisher>.Instance, TestMetrics.Create());

        await publisher.PublishAsync(new EventEnvelope { Type = EventTypes.CourseClosed, Data = new Dictionary<string, string> { [EventDataKeys.CourseCode] = "FA26-EXE101" } });

        Assert.Equal(expectedTopic, actualTopic);
    }

    [Fact]
    public async Task Publish_WhenCourseEvent_UsesCourseCodeAsPartitionKey()
    {
        var producer = new Mock<IProducer<string, string>>();
        Message<string, string>? sent = null;
        producer.Setup(x => x.ProduceAsync(KafkaTopics.Events, It.IsAny<Message<string, string>>(), It.IsAny<CancellationToken>()))
            .Callback<string, Message<string, string>, CancellationToken>((_, message, _) => sent = message)
            .ReturnsAsync(new DeliveryResult<string, string>());
        var publisher = new KafkaEventPublisher(producer.Object, new ConfigurationBuilder().Build(), NullLogger<KafkaEventPublisher>.Instance, TestMetrics.Create());
        var envelope = new EventEnvelope
        {
            Type = EventTypes.CourseClosed,
            Data = new Dictionary<string, string> { [EventDataKeys.CourseCode] = "FA26-EXE101" }
        };

        await publisher.PublishAsync(envelope);

        Assert.NotNull(sent);
        Assert.Equal("FA26-EXE101", sent.Key);
    }

    [Fact]
    public void Dispose_FlushesProducerForFiveSeconds()
    {
        var producer = new Mock<IProducer<string, string>>();
        var publisher = new KafkaEventPublisher(producer.Object, new ConfigurationBuilder().Build(), NullLogger<KafkaEventPublisher>.Instance, TestMetrics.Create());

        publisher.Dispose();

        producer.Verify(x => x.Flush(TimeSpan.FromSeconds(5)), Times.Once);
    }
}
