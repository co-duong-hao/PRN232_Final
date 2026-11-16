using Microsoft.Extensions.DependencyInjection;
using Confluent.Kafka;
using Exe.Contracts.Events;
using Exe.NotiService.Email;
using Exe.NotiService.Options;
using Exe.NotiService.Workers;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;

namespace Exe.NotiService.Tests;

public sealed class EventConsumerWorkerTests
{
    private static NotiMetrics Metrics() => new(new ServiceCollection().AddMetrics().BuildServiceProvider().GetRequiredService<System.Diagnostics.Metrics.IMeterFactory>());
    [Fact]
    public async Task ProcessMessage_RecordsRetriesEmailsAndOutcome()
    {
        using var capture = new MetricCapture("Exe.NotiService");
        var metrics = new NotiMetrics(capture.Factory);
        var sender = new Mock<IEmailSender>();
        sender.Setup(x => x.SendAsync(It.IsAny<EventRecipient>(), It.IsAny<RenderedEmail>(), It.IsAny<CancellationToken>())).ThrowsAsync(new IOException("smtp"));
        var dlq = new Mock<IDeadLetterPublisher>();
        var worker = new EventConsumerWorker(Microsoft.Extensions.Options.Options.Create(new KafkaOptions { MaxAttempts = 4 }),
            new EventProcessor(sender.Object, new EmailTemplateRenderer(), NullLogger<EventProcessor>.Instance, metrics),
            dlq.Object, NullLogger<EventConsumerWorker>.Instance, metrics);
        var outcome = await worker.ProcessMessageAsync(ValidMessage(), default, (_, _) => Task.CompletedTask);
        Assert.Equal("dead_lettered", outcome.Result);
        Assert.Throws<IOException>(() => worker.CommitAndRecord(() => throw new IOException(), outcome));
        Assert.Equal(0, capture.Count("exe.kafka.events.consumed"));
        worker.CommitAndRecord(() => { }, outcome);
        Assert.Equal(1, capture.Count("exe.kafka.events.consumed", "dead_lettered"));
        Assert.Equal(3, capture.Count("exe.kafka.event.retries"));
        Assert.Equal(4, capture.Count("exe.emails.sent", "failed"));
        sender.Setup(x => x.SendAsync(It.IsAny<EventRecipient>(), It.IsAny<RenderedEmail>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
        outcome = await worker.ProcessMessageAsync(ValidMessage(), default);
        Assert.Equal("processed", outcome.Result);
        worker.CommitAndRecord(() => { }, outcome);
        Assert.Equal(1, capture.Count("exe.kafka.events.consumed", "processed"));
        Assert.Equal(1, capture.Count("exe.emails.sent", "ok"));
    }

    [Fact]
    public async Task ProcessMessage_TemporaryFailures_RetriesMaxAttemptsThenPublishesOriginal()
    {
        var sender = new Mock<IEmailSender>();
        sender.Setup(x => x.SendAsync(It.IsAny<EventRecipient>(), It.IsAny<RenderedEmail>(), It.IsAny<CancellationToken>())).ThrowsAsync(new IOException("smtp"));
        var dlq = new Mock<IDeadLetterPublisher>();
        var worker = CreateWorker(sender, dlq, 4);
        var message = ValidMessage();
        var delays = new List<double>();
        await worker.ProcessMessageAsync(message, default, (duration, _) => { delays.Add(duration.TotalSeconds); return Task.CompletedTask; });
        sender.Verify(x => x.SendAsync(It.IsAny<EventRecipient>(), It.IsAny<RenderedEmail>(), It.IsAny<CancellationToken>()), Times.Exactly(4));
        Assert.Equal(new double[] { 1, 2, 4 }, delays);
        dlq.Verify(x => x.PublishAsync(message, "smtp", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ProcessMessage_InvalidJson_PublishesImmediately()
    {
        var sender = new Mock<IEmailSender>(MockBehavior.Strict);
        var dlq = new Mock<IDeadLetterPublisher>();
        var worker = CreateWorker(sender, dlq, 3);
        var message = new Message<string, string> { Key = "key", Value = "{invalid" };
        await worker.ProcessMessageAsync(message, default, (_, _) => throw new Exception("Unexpected retry"));
        dlq.Verify(x => x.PublishAsync(message, It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Once);
        sender.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task ProcessMessage_SecondAttemptSucceeds_DoesNotPublish()
    {
        var sender = new Mock<IEmailSender>();
        sender.SetupSequence(x => x.SendAsync(It.IsAny<EventRecipient>(), It.IsAny<RenderedEmail>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new IOException()).Returns(Task.CompletedTask);
        var dlq = new Mock<IDeadLetterPublisher>(MockBehavior.Strict);
        var worker = CreateWorker(sender, dlq, 3);
        await worker.ProcessMessageAsync(ValidMessage(), default, (_, _) => Task.CompletedTask);
        sender.Verify(x => x.SendAsync(It.IsAny<EventRecipient>(), It.IsAny<RenderedEmail>(), It.IsAny<CancellationToken>()), Times.Exactly(2));
        dlq.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task ProcessMessage_UnknownType_RecordsSkippedAfterCommit()
    {
        using var capture = new MetricCapture("Exe.NotiService");
        var metrics = new NotiMetrics(capture.Factory);
        var sender = new Mock<IEmailSender>(MockBehavior.Strict);
        var dlq = new Mock<IDeadLetterPublisher>(MockBehavior.Strict);
        var worker = new EventConsumerWorker(Microsoft.Extensions.Options.Options.Create(new KafkaOptions { MaxAttempts = 4 }),
            new EventProcessor(sender.Object, new EmailTemplateRenderer(), NullLogger<EventProcessor>.Instance, metrics),
            dlq.Object, NullLogger<EventConsumerWorker>.Instance, metrics);
        var message = new Message<string, string> { Value = EmailTemplateRendererTests.CreateEvent("Unknown").ToJson() };

        var outcome = await worker.ProcessMessageAsync(message, default);
        Assert.Equal(("unknown", "skipped"), outcome);
        Assert.Equal(0, capture.Count("exe.kafka.events.consumed"));
        worker.CommitAndRecord(() => { }, outcome);
        Assert.Equal(1, capture.Count("exe.kafka.events.consumed", "skipped"));
        Assert.Equal(0, capture.Count("exe.kafka.event.retries"));
        sender.VerifyNoOtherCalls();
        dlq.VerifyNoOtherCalls();
    }

    private static EventConsumerWorker CreateWorker(Mock<IEmailSender> sender, Mock<IDeadLetterPublisher> dlq, int attempts) =>
        new(Microsoft.Extensions.Options.Options.Create(new KafkaOptions { MaxAttempts = attempts }),
            new EventProcessor(sender.Object, new EmailTemplateRenderer(), NullLogger<EventProcessor>.Instance, Metrics()),
            dlq.Object, NullLogger<EventConsumerWorker>.Instance, Metrics());

    private static Message<string, string> ValidMessage() => new()
    {
        Key = "room",
        Value = (EmailTemplateRendererTests.CreateEvent(EventTypes.RoomCreated) with
        { Recipients = [new("one@example.com", "Một")] }).ToJson()
    };
}

