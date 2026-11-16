using System.Diagnostics.Metrics;
using Exe.Contracts.Events;
using Exe.NotiService.Email;
using Exe.NotiService.Workers;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace Exe.NotiService.Tests;

public sealed class EventRecipientRetryTests : IDisposable
{
    private readonly ServiceProvider services = new ServiceCollection().AddMetrics().BuildServiceProvider();
    private readonly Mock<IEmailSender> sender = new(MockBehavior.Strict);

    private EventProcessor Processor() => new(sender.Object, new EmailTemplateRenderer(),
        NullLogger<EventProcessor>.Instance, new NotiMetrics(services.GetRequiredService<IMeterFactory>()));

    public void Dispose() => services.Dispose();

    private static EventEnvelope Created(params EventRecipient[] recipients) =>
        EmailTemplateRendererTests.CreateEvent(EventTypes.RoomApplyCreated) with { Recipients = recipients };

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(2)]
    public async Task RetryContinuesAfterFirstUndeliveredRecipient(int failureIndex)
    {
        var recipients = new[]
        {
            new EventRecipient("leader@example.com", "Trưởng phòng"),
            new EventRecipient("reviewer@example.com", "Người duyệt"),
            new EventRecipient("mentor@example.com", "Cố vấn"),
        };
        var attempts = new List<string>();
        var failed = false;
        sender.Setup(x => x.SendAsync(It.IsAny<EventRecipient>(), It.IsAny<RenderedEmail>(), CancellationToken.None))
            .Returns((EventRecipient recipient, RenderedEmail _, CancellationToken _) =>
            {
                attempts.Add(recipient.Email);
                if (recipient == recipients[failureIndex] && !failed)
                {
                    failed = true;
                    throw new IOException("SMTP connection lost");
                }
                return Task.CompletedTask;
            });
        var processor = Processor();
        var envelope = Created(recipients);
        var delivered = new HashSet<string>(StringComparer.Ordinal);

        var first = await processor.ProcessAsync(envelope.ToJson(), CancellationToken.None, delivered);

        Assert.Equal(ProcessingStatus.TemporaryFailure, first.Status);
        Assert.Equal(envelope.EventId, first.EventId);
        Assert.Equal(recipients.Take(failureIndex).Select(x => x.Email).Order(), delivered.Order());
        Assert.Equal(recipients.Take(failureIndex + 1).Select(x => x.Email), attempts);

        var retry = await processor.ProcessAsync(envelope.ToJson(), CancellationToken.None, delivered);

        Assert.Equal(ProcessingStatus.Success, retry.Status);
        Assert.Equal(envelope.EventId, retry.EventId);
        Assert.Equal(recipients.Select(x => x.Email).Order(), delivered.Order());
        Assert.Equal(recipients.Take(failureIndex + 1).Concat(recipients.Skip(failureIndex)).Select(x => x.Email), attempts);
    }

    [Fact]
    public async Task DuplicateEmailInEnvelopeGetsOnlyFirstPersonalizedMessage()
    {
        var recipient = new EventRecipient("leader@example.com", "Trưởng phòng");
        var duplicate = new EventRecipient(recipient.Email, "Tên phụ");
        var sent = new List<RenderedEmail>();
        sender.Setup(x => x.SendAsync(recipient, It.IsAny<RenderedEmail>(), CancellationToken.None))
            .Callback<EventRecipient, RenderedEmail, CancellationToken>((_, email, _) => sent.Add(email))
            .Returns(Task.CompletedTask);
        var delivered = new HashSet<string>(StringComparer.Ordinal);
        var envelope = Created(recipient, duplicate);

        var result = await Processor().ProcessAsync(envelope.ToJson(), CancellationToken.None, delivered);

        Assert.Equal(ProcessingStatus.Success, result.Status);
        Assert.Equal(recipient.Email, Assert.Single(delivered));
        Assert.Contains("Chào Trưởng phòng", Assert.Single(sent).Body);
        sender.Verify(x => x.SendAsync(recipient, It.IsAny<RenderedEmail>(), CancellationToken.None), Times.Once);
        sender.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task SameRecipientStillGetsEachDistinctKafkaEvent()
    {
        var leader = new EventRecipient("leader@example.com", "Trưởng phòng");
        var first = Created(leader);
        var second = Created(leader);
        Assert.NotEqual(first.EventId, second.EventId);
        sender.Setup(x => x.SendAsync(leader, It.IsAny<RenderedEmail>(), CancellationToken.None))
            .Returns(Task.CompletedTask);
        var processor = Processor();

        var firstResult = await processor.ProcessAsync(first.ToJson(), CancellationToken.None, new HashSet<string>());
        var secondResult = await processor.ProcessAsync(second.ToJson(), CancellationToken.None, new HashSet<string>());

        Assert.Equal(ProcessingStatus.Success, firstResult.Status);
        Assert.Equal(first.EventId, firstResult.EventId);
        Assert.Equal(ProcessingStatus.Success, secondResult.Status);
        Assert.Equal(second.EventId, secondResult.EventId);
        sender.Verify(x => x.SendAsync(leader, It.IsAny<RenderedEmail>(), CancellationToken.None), Times.Exactly(2));
    }

    [Fact]
    public async Task CancellationPreservesDeliveredStateAndStopsBeforeLaterRecipient()
    {
        using var cancellation = new CancellationTokenSource();
        var first = new EventRecipient("one@example.com", "Một");
        var interrupted = new EventRecipient("two@example.com", "Hai");
        var untouched = new EventRecipient("three@example.com", "Ba");
        var delivered = new HashSet<string>(StringComparer.Ordinal);
        sender.Setup(x => x.SendAsync(first, It.IsAny<RenderedEmail>(), cancellation.Token)).Returns(Task.CompletedTask);
        sender.Setup(x => x.SendAsync(interrupted, It.IsAny<RenderedEmail>(), cancellation.Token)).Returns(() =>
        {
            cancellation.Cancel();
            return Task.FromCanceled(cancellation.Token);
        });

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            Processor().ProcessAsync(Created(first, interrupted, untouched).ToJson(), cancellation.Token, delivered));

        Assert.Equal(first.Email, Assert.Single(delivered));
        sender.Verify(x => x.SendAsync(untouched, It.IsAny<RenderedEmail>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task PreDeliveredRecipientsAreSkippedEvenWhenPresentAtBothEnds()
    {
        var old = new EventRecipient("leader@example.com", "Trưởng");
        var fresh = new EventRecipient("mentor@example.com", "Cố vấn");
        var delivered = new HashSet<string>(StringComparer.Ordinal) { old.Email };
        sender.Setup(x => x.SendAsync(fresh, It.IsAny<RenderedEmail>(), CancellationToken.None)).Returns(Task.CompletedTask);

        var result = await Processor().ProcessAsync(Created(old, fresh, old).ToJson(), CancellationToken.None, delivered);

        Assert.Equal(ProcessingStatus.Success, result.Status);
        Assert.Equal(new[] { old.Email, fresh.Email }.Order(), delivered.Order());
        sender.Verify(x => x.SendAsync(fresh, It.IsAny<RenderedEmail>(), CancellationToken.None), Times.Once);
        sender.VerifyNoOtherCalls();
    }

    [Theory]
    [InlineData("null")]
    [InlineData("{}")]
    [InlineData("{\"type\":\"RoomApplyCreated\",\"recipients\":null,\"data\":{}}")]
    [InlineData("{\"type\":\"RoomApplyCreated\",\"recipients\":[],\"data\":null}")]
    [InlineData("{\"type\":1,\"recipients\":[],\"data\":{}}")]
    public async Task MalformedEnvelopesDoNotConsumeRetryState(string payload)
    {
        var delivered = new HashSet<string>(StringComparer.Ordinal) { "already@example.com" };

        var result = await Processor().ProcessAsync(payload, CancellationToken.None, delivered);

        Assert.Equal(ProcessingStatus.PermanentFailure, result.Status);
        Assert.NotNull(result.Error);
        Assert.Null(result.EventId);
        Assert.Equal("already@example.com", Assert.Single(delivered));
        sender.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task DecisionMailUsesCorrectRecipientAndExplainsOutcome()
    {
        var recipient = new EventRecipient("applicant@example.com", "Sinh viên 08");
        var envelope = EmailTemplateRendererTests.CreateEvent(EventTypes.RoomApplyDecided) with
        {
            Recipients = [recipient],
            Data = new Dictionary<string, string>
            {
                [EventDataKeys.CourseCode] = "FA26-EXE201",
                [EventDataKeys.RoomCode] = "FA26-EXE201-R0001",
                [EventDataKeys.ActorName] = "Sinh viên 01",
                [EventDataKeys.Decision] = "Approved",
            },
        };
        RenderedEmail? rendered = null;
        sender.Setup(x => x.SendAsync(recipient, It.IsAny<RenderedEmail>(), CancellationToken.None))
            .Callback<EventRecipient, RenderedEmail, CancellationToken>((_, mail, _) => rendered = mail)
            .Returns(Task.CompletedTask);

        var result = await Processor().ProcessAsync(envelope.ToJson(), CancellationToken.None);

        Assert.Equal(ProcessingStatus.Success, result.Status);
        Assert.Equal("[EXE] Đơn vào phòng FA26-EXE201-R0001: được chấp nhận", rendered!.Subject);
        Assert.Contains("Chào Sinh viên 08", rendered.Body);
        Assert.Contains("Sinh viên 01 đã chấp nhận đơn của bạn", rendered.Body);
    }

    [Fact]
    public async Task KnownEventWithNoRecipientsCompletesWithoutCallingSmtp()
    {
        var empty = Created();
        var delivered = new HashSet<string>(StringComparer.Ordinal);

        var result = await Processor().ProcessAsync(empty.ToJson(), CancellationToken.None, delivered);

        Assert.Equal(ProcessingStatus.Success, result.Status);
        Assert.Equal(empty.EventId, result.EventId);
        Assert.Empty(delivered);
        sender.VerifyNoOtherCalls();
    }
}
