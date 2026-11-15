namespace Exe.Contracts.Events;

/// <summary>
/// Kafka names shared by the producer (Team Service) and the consumer (Noti Service).
/// Message format: key = <see cref="EventEnvelope.EventKey"/>, value = <see cref="EventEnvelope.ToJson"/>,
/// header <see cref="TypeHeader"/> = <see cref="EventEnvelope.Type"/>. Details: docs/design/events.md.
/// </summary>
public static class KafkaTopics
{
    /// <summary>All business events.</summary>
    public const string Events = "exe.events";

    /// <summary>Events Noti Service could not process after its retries.</summary>
    public const string EventsDeadLetter = "exe.events.dlq";

    public const string NotiConsumerGroup = "noti-service";

    /// <summary>Header carrying the event type, so consumers can route without parsing the value.</summary>
    public const string TypeHeader = "event-type";
}
