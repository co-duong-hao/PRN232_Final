using Exe.Contracts.Events;
using Exe.NotiService.Email;
using Exe.NotiService.Workers;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace Exe.NotiService.Tests;

public sealed class EventProcessorTests
{
    [Fact]
    public async Task Process_TwoRecipients_SendsBothEmails()
    {
        var sender = new Mock<IEmailSender>();
        var processor = new EventProcessor(sender.Object, new(), NullLogger<EventProcessor>.Instance);
        var envelope = EmailTemplateRendererTests.CreateEvent(EventTypes.RoomCreated) with
        {
            Recipients = [new("one@example.com", "Một"), new("two@example.com", "Hai")]
        };
        Assert.True(await processor.ProcessAsync(envelope.ToJson(), default));
        sender.Verify(x => x.SendAsync(It.Is<EventRecipient>(r => r.Email == "one@example.com"), It.IsAny<RenderedEmail>(), It.IsAny<CancellationToken>()), Times.Once);
        sender.Verify(x => x.SendAsync(It.Is<EventRecipient>(r => r.Email == "two@example.com"), It.IsAny<RenderedEmail>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Process_SendFailure_ReturnsFalse()
    {
        var sender = new Mock<IEmailSender>();
        sender.Setup(x => x.SendAsync(It.IsAny<EventRecipient>(), It.IsAny<RenderedEmail>(), It.IsAny<CancellationToken>())).ThrowsAsync(new IOException());
        var processor = new EventProcessor(sender.Object, new(), NullLogger<EventProcessor>.Instance);
        var envelope = EmailTemplateRendererTests.CreateEvent(EventTypes.RoomCreated) with { Recipients = [new("one@example.com", "Một")] };
        Assert.False(await processor.ProcessAsync(envelope.ToJson(), default));
    }

    [Fact]
    public async Task Process_BadJsonThenUnknown_ReturnsFailureThenSuccess()
    {
        var sender = new Mock<IEmailSender>(MockBehavior.Strict);
        var processor = new EventProcessor(sender.Object, new(), NullLogger<EventProcessor>.Instance);
        Assert.False(await processor.ProcessAsync("{invalid", default));
        Assert.True(await processor.ProcessAsync(EmailTemplateRendererTests.CreateEvent("Unknown").ToJson(), default));
        sender.VerifyNoOtherCalls();
    }
}
