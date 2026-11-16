# Sự kiện Kafka và producer

Tài liệu tham chiếu cho PRN232 Final v0.4 tại commit 2e3789f.

[Mục lục bộ tài liệu](01-architecture.md)

## Cách hoạt động

TeamService phát sự kiện sau khi dữ liệu nghiệp vụ đã lưu. Broker được cấu hình bởi `Kafka:BootstrapServers`, topic mặc định là `exe.events`.

Key dùng mã phòng hoặc mã Course khi áp dụng. Consumer xử lý JSON có type, người nhận và dữ liệu phục vụ email.

Producer có bật idempotence ở Kafka client. SQL và thao tác phát sự kiện vẫn tách riêng, nên một lỗi phát có thể làm thiếu thông báo.

## Cách kiểm tra

1. Quan sát một luồng tạo phòng, vào phòng và hoàn tất rồi đối chiếu loại sự kiện.
2. Tìm log lỗi theo tên sự kiện khi Kafka không khả dụng trong môi trường thử nghiệm.

## Đối chiếu mã nguồn

Các trích đoạn dưới đây hỗ trợ tra cứu. Đường dẫn mở phần tương ứng trong repo.

### Events.cs

Cấu trúc event, key và mã sự kiện.

[src/Shared/Contracts/Events/Events.cs dòng 1–81](../../src/Shared/Contracts/Events/Events.cs#L1-L81)

~~~csharp
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
~~~

### KafkaTopics.cs

Tên topic, nhóm consumer và tên header.

[src/Shared/Contracts/Events/KafkaTopics.cs dòng 1–20](../../src/Shared/Contracts/Events/KafkaTopics.cs#L1-L20)

~~~csharp
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
~~~

### RoomEventFactory.cs

Tạo nội dung sự kiện và người nhận từ dữ liệu nghiệp vụ.

[src/TeamService/Services/RoomEventFactory.cs dòng 1–37](../../src/TeamService/Services/RoomEventFactory.cs#L1-L37)

~~~csharp
using Exe.Contracts.Events;
using Exe.TeamService.Domain;

namespace Exe.TeamService.Services;

internal static class RoomEventFactory
{
    public static EventEnvelope CourseClosed(string courseCode, IReadOnlyList<EventRecipient> recipients)
    {
        return new EventEnvelope
        {
            Type = EventTypes.CourseClosed,
            Recipients = recipients,
            Data = new Dictionary<string, string> { [EventDataKeys.CourseCode] = courseCode }
        };
    }

    public static EventEnvelope Create(string type, Room room, IEnumerable<Student> recipients, params (string Key, string Value)[] data)
    {
        var values = new Dictionary<string, string>
        {
            [EventDataKeys.CourseCode] = room.Course.Code,
            [EventDataKeys.RoomCode] = room.Code
        };
        foreach (var (key, value) in data)
        {
            values[key] = value;
        }
        return new EventEnvelope
        {
            Type = type,
            Recipients = recipients.Select(x => new EventRecipient(x.Email, x.FullName)).ToArray(),
            Data = values
        };
    }
}

~~~

### KafkaEventPublisher.cs

Phát một message qua Confluent.Kafka.

[src/TeamService/Infrastructure/Messaging/KafkaEventPublisher.cs dòng 1–27](../../src/TeamService/Infrastructure/Messaging/KafkaEventPublisher.cs#L1-L27)

~~~csharp
using System.Text;
using Confluent.Kafka;
using Exe.Contracts.Events;
using Exe.TeamService.Abstractions;

namespace Exe.TeamService.Infrastructure.Messaging;

public sealed class KafkaEventPublisher(IProducer<string, string> producer, IConfiguration configuration, ILogger<KafkaEventPublisher> logger) : IEventPublisher, IDisposable
{
    public async Task PublishAsync(EventEnvelope envelope, CancellationToken cancellationToken = default)
    {
        try
        {
            await producer.ProduceAsync(configuration["Kafka:Topic"] ?? KafkaTopics.Events, new Message<string, string>
            {
                Key = envelope.EventKey, Value = envelope.ToJson(),
                Headers = new Headers { { KafkaTopics.TypeHeader, Encoding.UTF8.GetBytes(envelope.Type) } }
            }, cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to publish event {EventId} of type {EventType}", envelope.EventId, envelope.Type);
        }
    }

    public void Dispose() => producer.Flush(TimeSpan.FromSeconds(5));
}
~~~

### IEventPublisher.cs

Hợp đồng phát sự kiện nội bộ.

[src/TeamService/Abstractions/IEventPublisher.cs dòng 1–12](../../src/TeamService/Abstractions/IEventPublisher.cs#L1-L12)

~~~csharp
using Exe.Contracts.Events;

namespace Exe.TeamService.Abstractions;

/// <summary>
/// Publishes business events for Noti Service. Call it after the database transaction has committed.
/// Implementations must not throw: a broker failure is logged and never fails the business operation.
/// </summary>
public interface IEventPublisher
{
    Task PublishAsync(EventEnvelope envelope, CancellationToken cancellationToken = default);
}
~~~
