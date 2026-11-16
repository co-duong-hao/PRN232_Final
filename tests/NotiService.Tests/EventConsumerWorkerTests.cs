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
    public async Task ProcessMessage_PartialDelivery_RetriesOnlyUnsentRecipients()
    {
        var first = new EventRecipient("one@example.com", "One");
        var second = new EventRecipient("two@example.com", "Two");
        var third = new EventRecipient("three@example.com", "Three");
        var sender = new Mock<IEmailSender>();
        sender.Setup(x => x.SendAsync(It.IsAny<EventRecipient>(), It.IsAny<RenderedEmail>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
        sender.SetupSequence(x => x.SendAsync(second, It.IsAny<RenderedEmail>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new IOException("smtp")).Returns(Task.CompletedTask);
        var dlq = new Mock<IDeadLetterPublisher>(MockBehavior.Strict);
        var worker = CreateWorker(sender, dlq, 3);
        var message = new Message<string, string>
        {
            Key = "room",
            Value = (EmailTemplateRendererTests.CreateEvent(EventTypes.RoomCompleted) with
            { Recipients = [first, second, third] }).ToJson()
        };

        var outcome = await worker.ProcessMessageAsync(message, default, (_, _) => Task.CompletedTask);

        Assert.Equal("processed", outcome.Result);
        sender.Verify(x => x.SendAsync(first, It.IsAny<RenderedEmail>(), It.IsAny<CancellationToken>()), Times.Once());
        sender.Verify(x => x.SendAsync(second, It.IsAny<RenderedEmail>(), It.IsAny<CancellationToken>()), Times.Exactly(2));
        sender.Verify(x => x.SendAsync(third, It.IsAny<RenderedEmail>(), It.IsAny<CancellationToken>()), Times.Once());
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
        Assert.Equal(1, capture.Count("exe.kafka.events.consumed", ("type", "unknown"), ("result", "skipped")));
        Assert.Equal(0, capture.Count("exe.kafka.event.retries"));
        Assert.Single(capture.HistogramValues("exe.event.processing.duration", ("type", "unknown")));
        sender.VerifyNoOtherCalls();
        dlq.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task ProcessMessage_ValidEvent_RecordsDurationAndTypeTags()
    {
        using var capture = new MetricCapture(NotiMetrics.MeterName);
        var metrics = new NotiMetrics(capture.Factory);
        var sender = new Mock<IEmailSender>();
        sender.Setup(x => x.SendAsync(It.IsAny<EventRecipient>(), It.IsAny<RenderedEmail>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
        var dlq = new Mock<IDeadLetterPublisher>(MockBehavior.Strict);
        var worker = CreateWorker(sender, dlq, 3, metrics);

        var outcome = await worker.ProcessMessageAsync(ValidMessage(), default, (_, _) => Task.CompletedTask);
        Assert.Equal((EventTypes.RoomCreated, "processed"), outcome);
        worker.CommitAndRecord(() => { }, outcome);

        Assert.Equal(1, capture.Count("exe.kafka.events.consumed", ("type", EventTypes.RoomCreated), ("result", "processed")));
        Assert.Equal(1, capture.Count("exe.emails.sent", ("result", "ok")));
        Assert.Equal(0, capture.Count("exe.kafka.event.retries"));
        var durations = capture.HistogramValues("exe.event.processing.duration", ("type", EventTypes.RoomCreated));
        var recorded = Assert.Single(durations);
        Assert.True(recorded >= 0);
        dlq.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task ProcessMessage_InvalidJson_RecordsUnknownDeadLetteredZeroRetriesAndDuration()
    {
        using var capture = new MetricCapture(NotiMetrics.MeterName);
        var metrics = new NotiMetrics(capture.Factory);
        var sender = new Mock<IEmailSender>(MockBehavior.Strict);
        var dlq = new Mock<IDeadLetterPublisher>();
        var worker = CreateWorker(sender, dlq, 3, metrics);
        var message = new Message<string, string> { Key = "key", Value = "{invalid" };

        var outcome = await worker.ProcessMessageAsync(message, default, (_, _) => throw new Exception("Unexpected retry"));
        Assert.Equal(("unknown", "dead_lettered"), outcome);
        worker.CommitAndRecord(() => { }, outcome);

        Assert.Equal(1, capture.Count("exe.kafka.events.consumed", ("type", "unknown"), ("result", "dead_lettered")));
        Assert.Equal(0, capture.Count("exe.kafka.event.retries"));
        Assert.Equal(0, capture.Count("exe.emails.sent"));
        Assert.Single(capture.HistogramValues("exe.event.processing.duration", ("type", "unknown")));
        dlq.Verify(x => x.PublishAsync(message, It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Once);
        sender.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task ProcessMessage_NullValue_PublishesToDlqWithUnknownType()
    {
        using var capture = new MetricCapture(NotiMetrics.MeterName);
        var metrics = new NotiMetrics(capture.Factory);
        var sender = new Mock<IEmailSender>(MockBehavior.Strict);
        var dlq = new Mock<IDeadLetterPublisher>();
        var worker = CreateWorker(sender, dlq, 3, metrics);
        var message = new Message<string, string> { Key = "room", Value = null! };

        var outcome = await worker.ProcessMessageAsync(message, default, (_, _) => throw new Exception("Unexpected retry"));
        Assert.Equal(("unknown", "dead_lettered"), outcome);
        worker.CommitAndRecord(() => { }, outcome);

        Assert.Equal(1, capture.Count("exe.kafka.events.consumed", ("type", "unknown"), ("result", "dead_lettered")));
        Assert.Equal(0, capture.Count("exe.kafka.event.retries"));
        dlq.Verify(x => x.PublishAsync(message, "Payload rỗng.", It.IsAny<CancellationToken>()), Times.Once);
        sender.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task ProcessMessage_KnownTypeWithInvalidEnvelope_RecordsKnownTypeDeadLetteredWithoutRetries()
    {
        using var capture = new MetricCapture(NotiMetrics.MeterName);
        var metrics = new NotiMetrics(capture.Factory);
        var sender = new Mock<IEmailSender>(MockBehavior.Strict);
        var dlq = new Mock<IDeadLetterPublisher>();
        var worker = CreateWorker(sender, dlq, 3, metrics);
        var message = new Message<string, string>
        {
            Key = "room",
            Value = """{"type":"RoomCreated","recipients":null,"data":{}}"""
        };

        var outcome = await worker.ProcessMessageAsync(message, default, (_, _) => throw new Exception("Unexpected retry"));
        Assert.Equal((EventTypes.RoomCreated, "dead_lettered"), outcome);
        worker.CommitAndRecord(() => { }, outcome);

        Assert.Equal(1, capture.Count("exe.kafka.events.consumed", ("type", EventTypes.RoomCreated), ("result", "dead_lettered")));
        Assert.Equal(0, capture.Count("exe.kafka.event.retries"));
        Assert.Single(capture.HistogramValues("exe.event.processing.duration", ("type", EventTypes.RoomCreated)));
        dlq.Verify(x => x.PublishAsync(message, It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Once);
        sender.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task ProcessMessage_SecondAttemptSucceeds_RecordsRetryAndEmailMetrics()
    {
        using var capture = new MetricCapture(NotiMetrics.MeterName);
        var metrics = new NotiMetrics(capture.Factory);
        var sender = new Mock<IEmailSender>();
        sender.SetupSequence(x => x.SendAsync(It.IsAny<EventRecipient>(), It.IsAny<RenderedEmail>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new IOException("smtp"))
            .Returns(Task.CompletedTask);
        var dlq = new Mock<IDeadLetterPublisher>(MockBehavior.Strict);
        var worker = CreateWorker(sender, dlq, 3, metrics);

        var outcome = await worker.ProcessMessageAsync(ValidMessage(), default, (_, _) => Task.CompletedTask);
        Assert.Equal((EventTypes.RoomCreated, "processed"), outcome);
        worker.CommitAndRecord(() => { }, outcome);

        Assert.Equal(1, capture.Count("exe.kafka.event.retries", ("type", EventTypes.RoomCreated)));
        Assert.Equal(1, capture.Count("exe.emails.sent", ("result", "failed")));
        Assert.Equal(1, capture.Count("exe.emails.sent", ("result", "ok")));
        Assert.Equal(1, capture.Count("exe.kafka.events.consumed", ("type", EventTypes.RoomCreated), ("result", "processed")));
        dlq.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task ProcessMessage_WhenMaxAttemptsIsOne_PublishesWithoutRetries()
    {
        using var capture = new MetricCapture(NotiMetrics.MeterName);
        var metrics = new NotiMetrics(capture.Factory);
        var sender = new Mock<IEmailSender>();
        sender.Setup(x => x.SendAsync(It.IsAny<EventRecipient>(), It.IsAny<RenderedEmail>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new IOException("smtp"));
        var dlq = new Mock<IDeadLetterPublisher>();
        var worker = CreateWorker(sender, dlq, 1, metrics);

        var outcome = await worker.ProcessMessageAsync(ValidMessage(), default, (_, _) => throw new Exception("Unexpected delay"));
        Assert.Equal((EventTypes.RoomCreated, "dead_lettered"), outcome);
        worker.CommitAndRecord(() => { }, outcome);

        Assert.Equal(0, capture.Count("exe.kafka.event.retries"));
        Assert.Equal(1, capture.Count("exe.emails.sent", ("result", "failed")));
        dlq.Verify(x => x.PublishAsync(It.IsAny<Message<string, string>>(), "smtp", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ProcessMessage_WhenMaxAttemptsIsFive_CapsBackoffAtFourSeconds()
    {
        var sender = new Mock<IEmailSender>();
        sender.Setup(x => x.SendAsync(It.IsAny<EventRecipient>(), It.IsAny<RenderedEmail>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new IOException("smtp"));
        var dlq = new Mock<IDeadLetterPublisher>();
        var worker = CreateWorker(sender, dlq, 5);
        var delays = new List<double>();

        await worker.ProcessMessageAsync(ValidMessage(), default, (duration, _) =>
        {
            delays.Add(duration.TotalSeconds);
            return Task.CompletedTask;
        });

        Assert.Equal(new double[] { 1, 2, 4, 4 }, delays);
    }

    [Fact]
    public async Task ProcessMessage_WhenCancelledDuringDelay_PropagatesWithoutDlq()
    {
        using var cts = new CancellationTokenSource();
        var sender = new Mock<IEmailSender>();
        sender.Setup(x => x.SendAsync(It.IsAny<EventRecipient>(), It.IsAny<RenderedEmail>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new IOException("smtp"));
        var dlq = new Mock<IDeadLetterPublisher>(MockBehavior.Strict);
        var worker = CreateWorker(sender, dlq, 3);

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            worker.ProcessMessageAsync(ValidMessage(), cts.Token, (_, token) =>
            {
                cts.Cancel();
                return Task.FromCanceled(token);
            }));
        dlq.VerifyNoOtherCalls();
    }

    private static EventConsumerWorker CreateWorker(Mock<IEmailSender> sender, Mock<IDeadLetterPublisher> dlq, int attempts, NotiMetrics? metrics = null) =>
        new(Microsoft.Extensions.Options.Options.Create(new KafkaOptions { MaxAttempts = attempts }),
            new EventProcessor(sender.Object, new EmailTemplateRenderer(), NullLogger<EventProcessor>.Instance, metrics ?? Metrics()),
            dlq.Object, NullLogger<EventConsumerWorker>.Instance, metrics ?? Metrics());

    private static Message<string, string> ValidMessage() => new()
    {
        Key = "room",
        Value = (EmailTemplateRendererTests.CreateEvent(EventTypes.RoomCreated) with
        { Recipients = [new("one@example.com", "Một")] }).ToJson()
    };
}

