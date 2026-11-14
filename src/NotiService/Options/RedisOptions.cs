using Exe.Contracts.Events;
namespace Exe.NotiService.Options;
public sealed class RedisOptions
{
    public string ConnectionString { get; set; } = "localhost:6379";
    public string Stream { get; set; } = EventStreams.Default;
    public string ConsumerGroup { get; set; } = EventStreams.NotiConsumerGroup;
    public string ConsumerName { get; set; } = "noti-1";
}
