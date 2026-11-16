using System.Globalization;
using System.Text;
using Confluent.Kafka;
using Exe.Contracts.Events;
using Exe.NotiService.Workers;
using Moq;

namespace Exe.NotiService.Tests;

public sealed class DeadLetterPublisherTests
{
    [Fact]
    public async Task PublishAsync_PreservesKeyValueAndHeadersAndAddsErrorAndTimestamp()
    {
        var producer = new Mock<IProducer<string, string>>();
        Message<string, string>? sent = null;
        string? targetTopic = null;
        producer.Setup(x => x.ProduceAsync(It.IsAny<string>(), It.IsAny<Message<string, string>>(), It.IsAny<CancellationToken>()))
            .Callback<string, Message<string, string>, CancellationToken>((topic, msg, _) =>
            {
                targetTopic = topic;
                sent = msg;
            })
            .ReturnsAsync(new DeliveryResult<string, string>());
        var publisher = new DeadLetterPublisher(producer.Object, KafkaTopics.EventsDeadLetter);
        var original = new Message<string, string>
        {
            Key = "FA26-EXE101-R001",
            Value = """{"type":"RoomCreated"}""",
            Headers = new Headers { { KafkaTopics.TypeHeader, Encoding.UTF8.GetBytes(EventTypes.RoomCreated) } }
        };

        await publisher.PublishAsync(original, "SMTP connection refused", default);

        Assert.Equal(KafkaTopics.EventsDeadLetter, targetTopic);
        Assert.NotNull(sent);
        Assert.Equal(original.Key, sent.Key);
        Assert.Equal(original.Value, sent.Value);
        Assert.Equal(EventTypes.RoomCreated, Encoding.UTF8.GetString(sent.Headers.GetLastBytes(KafkaTopics.TypeHeader)));
        Assert.Equal("SMTP connection refused", Encoding.UTF8.GetString(sent.Headers.GetLastBytes("error")));
        var failedAt = Encoding.UTF8.GetString(sent.Headers.GetLastBytes("failed-at"));
        Assert.True(DateTimeOffset.TryParseExact(failedAt, "O", CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out _));
    }

    [Fact]
    public async Task PublishAsync_WhenOriginalHasNoHeaders_StillAddsErrorAndFailedAt()
    {
        var producer = new Mock<IProducer<string, string>>();
        Message<string, string>? sent = null;
        producer.Setup(x => x.ProduceAsync("custom.dlq", It.IsAny<Message<string, string>>(), It.IsAny<CancellationToken>()))
            .Callback<string, Message<string, string>, CancellationToken>((_, msg, _) => sent = msg)
            .ReturnsAsync(new DeliveryResult<string, string>());
        var publisher = new DeadLetterPublisher(producer.Object, "custom.dlq");

        await publisher.PublishAsync(new Message<string, string> { Key = "k", Value = "bad" }, "Invalid JSON", default);

        Assert.NotNull(sent);
        Assert.Equal("Invalid JSON", Encoding.UTF8.GetString(sent.Headers.GetLastBytes("error")));
        Assert.NotEmpty(sent.Headers.GetLastBytes("failed-at"));
    }

    [Fact]
    public void Dispose_FlushesAndDisposesProducer()
    {
        var producer = new Mock<IProducer<string, string>>();
        var publisher = new DeadLetterPublisher(producer.Object, KafkaTopics.EventsDeadLetter);

        publisher.Dispose();

        producer.Verify(x => x.Flush(TimeSpan.FromSeconds(5)), Times.Once);
        producer.Verify(x => x.Dispose(), Times.Once);
    }
}
