using Exe.Contracts.Events;

namespace Exe.NotiService.Options;

public sealed class KafkaOptions
{
    public string BootstrapServers { get; set; } = "localhost:9094";
    public string Topic { get; set; } = KafkaTopics.Events;
    public string DeadLetterTopic { get; set; } = KafkaTopics.EventsDeadLetter;
    public string GroupId { get; set; } = KafkaTopics.NotiConsumerGroup;
    public int MaxAttempts { get; set; } = 3;
}
