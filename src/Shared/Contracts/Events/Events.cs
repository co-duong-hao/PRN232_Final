using System.Text.Json;

namespace Exe.Contracts.Events;

/// <summary>Redis Streams names shared by the producer (Team Service) and the consumer (Noti Service).</summary>
public static class EventStreams
{
    public const string Default = "exe.events";
    public const string NotiConsumerGroup = "noti-service";

    /// <summary>Stream entry field holding <see cref="EventEnvelope.Type"/>.</summary>
    public const string TypeField = "type";

    /// <summary>Stream entry field holding the envelope as JSON (<see cref="EventEnvelope.ToJson"/>).</summary>
    public const string PayloadField = "payload";
}

public static class EventTypes
{
    public const string RoomCreated = "RoomCreated";
    public const string RoomMemberJoined = "RoomMemberJoined";
    public const string RoomLocked = "RoomLocked";
    public const string RoomApplyCreated = "RoomApplyCreated";
    public const string RoomApplyDecided = "RoomApplyDecided";
    public const string RoomLeaderChanged = "RoomLeaderChanged";
    public const string RoomCompleted = "RoomCompleted";
    public const string CourseDeadlineReminder = "CourseDeadlineReminder";
    public const string CourseClosed = "CourseClosed";

    public static readonly IReadOnlyList<string> All =
    [
        RoomCreated, RoomMemberJoined, RoomLocked, RoomApplyCreated, RoomApplyDecided,
        RoomLeaderChanged, RoomCompleted, CourseDeadlineReminder, CourseClosed,
    ];
}

/// <summary>Keys of <see cref="EventEnvelope.Data"/>. Which keys each event carries: docs/design/events.md.</summary>
public static class EventDataKeys
{
    public const string CourseCode = "courseCode";
    public const string RoomCode = "roomCode";
    public const string GroupCode = "groupCode";
    /// <summary>Full name of the student who caused the event.</summary>
    public const string ActorName = "actorName";
    /// <summary>"Approved" or "Rejected".</summary>
    public const string Decision = "decision";
    /// <summary>Free text written by the applicant.</summary>
    public const string Message = "message";
    /// <summary>ISO 8601 UTC.</summary>
    public const string Deadline = "deadline";
    public const string MemberCount = "memberCount";
}

public sealed record EventRecipient(string Email, string FullName);

/// <summary>
/// The one message shape on the stream. The producer resolves recipients, so the consumer needs no lookups.
/// </summary>
public sealed record EventEnvelope
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public Guid EventId { get; init; } = Guid.NewGuid();
    public required string Type { get; init; }
    public DateTime OccurredAt { get; init; } = DateTime.UtcNow;
    public IReadOnlyList<EventRecipient> Recipients { get; init; } = [];
    public IReadOnlyDictionary<string, string> Data { get; init; } = new Dictionary<string, string>();

    /// <summary>
    /// Kafka partition key: events of the same room (or course, for course events) keep their order.
    /// </summary>
    [System.Text.Json.Serialization.JsonIgnore]
    public string EventKey =>
        Data.TryGetValue(EventDataKeys.RoomCode, out var room) ? room
        : Data.TryGetValue(EventDataKeys.CourseCode, out var course) ? course
        : EventId.ToString();

    public string ToJson() => JsonSerializer.Serialize(this, JsonOptions);

    public static EventEnvelope? FromJson(string json) => JsonSerializer.Deserialize<EventEnvelope>(json, JsonOptions);
}
