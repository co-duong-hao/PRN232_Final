using Exe.NotiService.Email;
using Exe.NotiService.Options;
using Exe.NotiService.Workers;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using StackExchange.Redis;

namespace Exe.NotiService.Tests;

public sealed class EventConsumerWorkerTests
{
    [Fact]
    public async Task Execute_WhenNonRedisExceptionOccurs_LogsWarningAndRetries()
    {
        var retried = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var connection = new Mock<IConnectionMultiplexer>();
        var attempts = 0;
        connection.Setup(x => x.GetDatabase(It.IsAny<int>(), It.IsAny<object>()))
            .Returns(() =>
            {
                if (Interlocked.Increment(ref attempts) == 2)
                    retried.TrySetResult();
                throw new InvalidOperationException("Unexpected failure");
            });
        var logger = new Mock<ILogger<EventConsumerWorker>>();
        var processor = new EventProcessor(Mock.Of<IEmailSender>(), new EmailTemplateRenderer(), NullLogger<EventProcessor>.Instance);
        using var worker = new EventConsumerWorker(connection.Object, Microsoft.Extensions.Options.Options.Create(new RedisOptions()), processor, logger.Object);

        await worker.StartAsync(CancellationToken.None);
        try
        {
            await retried.Task.WaitAsync(TimeSpan.FromSeconds(12));
            logger.Verify(x => x.Log(
                LogLevel.Warning,
                It.IsAny<EventId>(),
                It.Is<It.IsAnyType>((_, _) => true),
                It.IsAny<InvalidOperationException>(),
                It.IsAny<Func<It.IsAnyType, Exception?, string>>()), Times.AtLeastOnce);
            Assert.True(attempts >= 2);
        }
        finally
        {
            await worker.StopAsync(CancellationToken.None);
        }
    }
}

