using Microsoft.Extensions.DependencyInjection;
using Exe.Contracts.Events;
using Exe.NotiService.Email;
using Exe.NotiService.Workers;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace Exe.NotiService.Tests;

public sealed class EventProcessorTests
{
    private static NotiMetrics Metrics() => new(new ServiceCollection().AddMetrics().BuildServiceProvider().GetRequiredService<System.Diagnostics.Metrics.IMeterFactory>());
    [Fact]
    public async Task Process_TwoRecipients_SendsBothEmails()
    {
        var sender = new Mock<IEmailSender>();
        var processor = new EventProcessor(sender.Object, new(), NullLogger<EventProcessor>.Instance, Metrics());
        var envelope = EmailTemplateRendererTests.CreateEvent(EventTypes.RoomCreated) with
        {
            Recipients = [new("one@example.com", "Một"), new("two@example.com", "Hai")]
        };
        Assert.Equal(ProcessingStatus.Success, (await processor.ProcessAsync(envelope.ToJson(), default)).Status);
        sender.Verify(x => x.SendAsync(It.Is<EventRecipient>(r => r.Email == "one@example.com"), It.IsAny<RenderedEmail>(), It.IsAny<CancellationToken>()), Times.Once);
        sender.Verify(x => x.SendAsync(It.Is<EventRecipient>(r => r.Email == "two@example.com"), It.IsAny<RenderedEmail>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Process_SendFailure_ReturnsFalse()
    {
        var sender = new Mock<IEmailSender>();
        sender.Setup(x => x.SendAsync(It.IsAny<EventRecipient>(), It.IsAny<RenderedEmail>(), It.IsAny<CancellationToken>())).ThrowsAsync(new IOException());
        var processor = new EventProcessor(sender.Object, new(), NullLogger<EventProcessor>.Instance, Metrics());
        var envelope = EmailTemplateRendererTests.CreateEvent(EventTypes.RoomCreated) with { Recipients = [new("one@example.com", "Một")] };
        Assert.Equal(ProcessingStatus.TemporaryFailure, (await processor.ProcessAsync(envelope.ToJson(), default)).Status);
    }

    [Fact]
    public async Task Process_BadJsonThenUnknown_ReturnsFailureThenSuccess()
    {
        var sender = new Mock<IEmailSender>(MockBehavior.Strict);
        var processor = new EventProcessor(sender.Object, new(), NullLogger<EventProcessor>.Instance, Metrics());
        Assert.Equal(ProcessingStatus.PermanentFailure, (await processor.ProcessAsync("{invalid", default)).Status);
        Assert.Equal(ProcessingStatus.Skipped, (await processor.ProcessAsync(EmailTemplateRendererTests.CreateEvent("Unknown").ToJson(), default)).Status);
        sender.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task Process_WhenRecipientsEmpty_ReturnsSuccessWithoutSendingEmail()
    {
        using var capture = new MetricCapture(NotiMetrics.MeterName);
        var sender = new Mock<IEmailSender>(MockBehavior.Strict);
        var processor = new EventProcessor(sender.Object, new(), NullLogger<EventProcessor>.Instance, new NotiMetrics(capture.Factory));
        var envelope = EmailTemplateRendererTests.CreateEvent(EventTypes.CourseClosed) with { Recipients = [] };

        var result = await processor.ProcessAsync(envelope.ToJson(), default);

        Assert.Equal(ProcessingStatus.Success, result.Status);
        Assert.Equal(0, capture.Count("exe.emails.sent"));
        sender.VerifyNoOtherCalls();
    }

    [Theory]
    [InlineData("null")]
    [InlineData("{}")]
    [InlineData("""{"type":"RoomCreated","recipients":null,"data":{}}""")]
    [InlineData("""{"type":"RoomCreated","recipients":[],"data":null}""")]
    [InlineData("""{"type":"RoomCreated","recipients":[null],"data":{}}""")]
    [InlineData("""{"type":"RoomCreated","recipients":[{"email":"","fullName":"A"}],"data":{}}""")]
    public async Task Process_WhenEnvelopeInvalid_ReturnsPermanentFailure(string payload)
    {
        var sender = new Mock<IEmailSender>(MockBehavior.Strict);
        var processor = new EventProcessor(sender.Object, new(), NullLogger<EventProcessor>.Instance, Metrics());

        var result = await processor.ProcessAsync(payload, default);

        Assert.Equal(ProcessingStatus.PermanentFailure, result.Status);
        sender.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task Process_WhenCancelled_PropagatesOperationCanceledException()
    {
        using var cts = new CancellationTokenSource();
        cts.Cancel();
        var sender = new Mock<IEmailSender>();
        sender.Setup(x => x.SendAsync(It.IsAny<EventRecipient>(), It.IsAny<RenderedEmail>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException(cts.Token));
        using var capture = new MetricCapture(NotiMetrics.MeterName);
        var processor = new EventProcessor(sender.Object, new(), NullLogger<EventProcessor>.Instance, new NotiMetrics(capture.Factory));
        var envelope = EmailTemplateRendererTests.CreateEvent(EventTypes.RoomCreated) with
        {
            Recipients = [new("one@example.com", "Một")]
        };

        await Assert.ThrowsAsync<OperationCanceledException>(() => processor.ProcessAsync(envelope.ToJson(), cts.Token));
        Assert.Equal(0, capture.Count("exe.emails.sent"));
    }

    [Fact]
    public async Task Process_RecordsEmailOkAndFailedMetrics()
    {
        using var capture = new MetricCapture(NotiMetrics.MeterName);
        var sender = new Mock<IEmailSender>();
        sender.SetupSequence(x => x.SendAsync(It.IsAny<EventRecipient>(), It.IsAny<RenderedEmail>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask)
            .ThrowsAsync(new IOException("smtp"));
        var processor = new EventProcessor(sender.Object, new(), NullLogger<EventProcessor>.Instance, new NotiMetrics(capture.Factory));
        var envelope = EmailTemplateRendererTests.CreateEvent(EventTypes.RoomCreated) with
        {
            Recipients = [new("one@example.com", "Một"), new("two@example.com", "Hai")]
        };

        var result = await processor.ProcessAsync(envelope.ToJson(), default);

        Assert.Equal(ProcessingStatus.TemporaryFailure, result.Status);
        Assert.Equal(1, capture.Count("exe.emails.sent", ("result", "ok")));
        Assert.Equal(1, capture.Count("exe.emails.sent", ("result", "failed")));
    }
}
