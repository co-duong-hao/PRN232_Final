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
}
