using Exe.Contracts.Events;
using Exe.TeamService.Infrastructure.Messaging;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Moq;
using StackExchange.Redis;

namespace Exe.TeamService.Tests.Infrastructure;

public sealed class RedisStreamEventPublisherTests
{
    [Fact]
    public async Task Publish_WhenConnected_WritesTypeAndJsonPayload()
    {
        var db = new Mock<IDatabase>();
        var connection = new Mock<IConnectionMultiplexer>();
        connection.Setup(x => x.GetDatabase(It.IsAny<int>(), It.IsAny<object>())).Returns(db.Object);
        NameValueEntry[]? entries = null;
        db.Setup(x => x.StreamAddAsync(It.IsAny<RedisKey>(), It.IsAny<NameValueEntry[]>(), It.IsAny<RedisValue?>(),
            It.IsAny<int?>(), It.IsAny<bool>(), It.IsAny<CommandFlags>()))
            .Callback<RedisKey, NameValueEntry[], RedisValue?, int?, bool, CommandFlags>((_, values, _, _, _, _) => entries = values)
            .ReturnsAsync((RedisValue)"1-0");
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Redis:Stream"] = "custom.stream" }).Build();
        var service = new RedisStreamEventPublisher(connection.Object, configuration, Mock.Of<ILogger<RedisStreamEventPublisher>>());
        var envelope = new EventEnvelope { Type = EventTypes.RoomCreated };

        await service.PublishAsync(envelope);

        db.Verify(x => x.StreamAddAsync((RedisKey)"custom.stream", It.IsAny<NameValueEntry[]>(), It.IsAny<RedisValue?>(),
            It.IsAny<int?>(), It.IsAny<bool>(), It.IsAny<CommandFlags>()), Times.Once);
        Assert.Equal(2, entries!.Length);
        Assert.Equal(envelope.Type, entries.Single(x => x.Name == EventStreams.TypeField).Value.ToString());
        var decoded = EventEnvelope.FromJson(entries.Single(x => x.Name == EventStreams.PayloadField).Value.ToString());
        Assert.Equal(envelope.EventId, decoded!.EventId);
    }

    [Fact]
    public async Task Publish_WhenRedisThrows_LogsErrorAndDoesNotThrow()
    {
        var connection = new Mock<IConnectionMultiplexer>();
        connection.Setup(x => x.GetDatabase(It.IsAny<int>(), It.IsAny<object>())).Throws(new InvalidOperationException("offline"));
        var logger = new Mock<ILogger<RedisStreamEventPublisher>>();
        var service = new RedisStreamEventPublisher(connection.Object, new ConfigurationBuilder().Build(), logger.Object);
        var envelope = new EventEnvelope { Type = EventTypes.RoomCreated };

        await service.PublishAsync(envelope);

        logger.Verify(x => x.Log(LogLevel.Error, It.IsAny<EventId>(), It.Is<It.IsAnyType>((state, _) =>
            state.ToString()!.Contains(envelope.EventId.ToString()) && state.ToString()!.Contains(envelope.Type)),
            It.IsAny<Exception>(), It.IsAny<Func<It.IsAnyType, Exception?, string>>()), Times.Once);
    }
}
