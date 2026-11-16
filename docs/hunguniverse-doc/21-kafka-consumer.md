# Consumer Kafka và email

Tài liệu tham chiếu cho PRN232 Final v0.4 tại commit 2e3789f.

[Mục lục bộ tài liệu](01-architecture.md)

## Cách hoạt động

NotiService đăng ký đọc `exe.events`, xử lý từng message và commit thủ công. Sau khi một sự kiện được xử lý hoặc đưa vào DLQ, worker mới tiến vị trí đọc.

Lỗi tạm thời có thể được thử lại. Mặc định có tối đa 3 lần xử lý và thời gian chờ 1 rồi 2 giây trước các lần tiếp theo.

Email SMTP không có giao dịch chung với Kafka. Việc gửi trước khi tiến offset có thể làm email xuất hiện lại nếu một worker dừng giữa hai thao tác.

## Cách kiểm tra

1. Hoàn tất phòng trong môi trường thử nghiệm rồi tìm email theo mã nhóm tại Mailpit.
2. Dùng bộ test NotiService để kiểm tra số lần xử lý, điều kiện chuyển DLQ và lỗi dữ liệu không hợp lệ.

## Đối chiếu mã nguồn

Các trích đoạn dưới đây hỗ trợ tra cứu. Đường dẫn mở phần tương ứng trong repo.

### EventConsumerWorker.cs

Vòng lặp tiêu thụ, retry và commit.

[src/NotiService/Workers/EventConsumerWorker.cs dòng 1–97](../../src/NotiService/Workers/EventConsumerWorker.cs#L1-L97)

~~~csharp
using Confluent.Kafka;
using Exe.NotiService.Options;
using Microsoft.Extensions.Options;

namespace Exe.NotiService.Workers;

public sealed class EventConsumerWorker(
    IOptions<KafkaOptions> options,
    EventProcessor processor,
    IDeadLetterPublisher deadLetterPublisher,
    ILogger<EventConsumerWorker> logger) : BackgroundService
{
    protected override Task ExecuteAsync(CancellationToken stoppingToken) =>
        Task.Run(() => ConsumeAsync(stoppingToken), stoppingToken);

    private async Task ConsumeAsync(CancellationToken ct)
    {
        IConsumer<string, string>? consumer = null;
        try
        {
            while (!ct.IsCancellationRequested)
            {
                try
                {
                    consumer ??= new ConsumerBuilder<string, string>(new ConsumerConfig
                    {
                        BootstrapServers = options.Value.BootstrapServers,
                        GroupId = options.Value.GroupId,
                        AutoOffsetReset = AutoOffsetReset.Earliest,
                        EnableAutoCommit = false
                    }).Build();
                    consumer.Subscribe(options.Value.Topic);
                    while (!ct.IsCancellationRequested)
                    {
                        var record = consumer.Consume(TimeSpan.FromSeconds(1));
                        if (record is null) continue;
                        // Keep the current record until both processing and commit succeed.
                        var processed = false;
                        while (!ct.IsCancellationRequested)
                        {
                            try
                            {
                                if (!processed)
                                {
                                    await ProcessMessageAsync(record.Message, ct);
                                    processed = true;
                                }
                                consumer.Commit(record);
                                break;
                            }
                            catch (KafkaException ex)
                            {
                                logger.LogWarning(ex, "Kafka gặp lỗi; thử lại sau 5 giây.");
                                await Task.Delay(TimeSpan.FromSeconds(5), ct);
                            }
                        }
                    }
                }
                catch (Exception ex) when (!ct.IsCancellationRequested)
                {
                    // Any failure (Kafka or otherwise) must not stop the worker: log, wait, reconnect.
                    logger.LogWarning(ex, "Consumer gặp lỗi; thử lại sau 5 giây.");
                    await Task.Delay(TimeSpan.FromSeconds(5), ct);
                }
            }
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { }
        finally
        {
            if (consumer is not null)
            {
                try { consumer.Close(); }
                catch (KafkaException ex) { logger.LogWarning(ex, "Không thể đóng Kafka consumer."); }
                consumer.Dispose();
            }
        }
    }

    internal async Task ProcessMessageAsync(Message<string, string> message, CancellationToken ct,
        Func<TimeSpan, CancellationToken, Task>? delay = null)
    {
        delay ??= Task.Delay;
        var attempts = Math.Max(1, options.Value.MaxAttempts);
        ProcessingResult result = new(ProcessingStatus.PermanentFailure, "Payload rỗng.");
        for (var attempt = 1; attempt <= attempts; attempt++)
        {
            result = message.Value is null
                ? new(ProcessingStatus.PermanentFailure, "Payload rỗng.")
                : await processor.ProcessAsync(message.Value, ct);
            if (result.Status == ProcessingStatus.Success) return;
            if (result.Status == ProcessingStatus.PermanentFailure || attempt == attempts) break;
            await delay(TimeSpan.FromSeconds(Math.Pow(2, Math.Min(attempt - 1, 2))), ct);
        }
        logger.LogError("Không xử lý được sự kiện {EventId}: {Error}", result.EventId, result.Error);
        await deadLetterPublisher.PublishAsync(message, result.Error ?? "Lỗi xử lý sự kiện.", ct);
    }
}
~~~

### EventProcessor.cs

Đọc sự kiện và gọi gửi email cho người nhận.

[src/NotiService/Workers/EventProcessor.cs dòng 1–49](../../src/NotiService/Workers/EventProcessor.cs#L1-L49)

~~~csharp
using System.Text.Json;
using Exe.Contracts.Events;
using Exe.NotiService.Email;
namespace Exe.NotiService.Workers;
public enum ProcessingStatus { Success, TemporaryFailure, PermanentFailure }

public sealed record ProcessingResult(ProcessingStatus Status, string? Error = null, Guid? EventId = null);

public sealed class EventProcessor(IEmailSender sender, EmailTemplateRenderer renderer, ILogger<EventProcessor> logger)
{
    public async Task<ProcessingResult> ProcessAsync(string payload, CancellationToken cancellationToken)
    {
        EventEnvelope? envelope;
        try
        {
            envelope = EventEnvelope.FromJson(payload);
            if (envelope is null || envelope.Type is null || envelope.Recipients is null || envelope.Data is null)
                throw new JsonException("Envelope không hợp lệ.");
        }
        catch (JsonException ex)
        {
            logger.LogWarning(ex, "Không đọc được payload sự kiện.");
            return new(ProcessingStatus.PermanentFailure, ex.Message);
        }
        if (!EventTypes.All.Contains(envelope.Type, StringComparer.Ordinal))
        {
            logger.LogWarning("Bỏ qua loại sự kiện không xác định {EventType}.", envelope.Type);
            return new(ProcessingStatus.Success, EventId: envelope.EventId);
        }
        try
        {
            foreach (var recipient in envelope.Recipients)
            {
                var email = renderer.Render(envelope, recipient)!;
                await sender.SendAsync(recipient, email, cancellationToken);
            }
            return new(ProcessingStatus.Success, EventId: envelope.EventId);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Không gửi được email cho sự kiện {EventId}.", envelope.EventId);
            return new(ProcessingStatus.TemporaryFailure, ex.Message, envelope.EventId);
        }
    }
}
~~~

### DeadLetterPublisher.cs

Phát bản ghi lỗi vào topic DLQ.

[src/NotiService/Workers/DeadLetterPublisher.cs dòng 1–48](../../src/NotiService/Workers/DeadLetterPublisher.cs#L1-L48)

~~~csharp
using Confluent.Kafka;
using Exe.NotiService.Options;
using Microsoft.Extensions.Options;
using System.Text;

namespace Exe.NotiService.Workers;

public interface IDeadLetterPublisher
{
    Task PublishAsync(Message<string, string> message, string error, CancellationToken cancellationToken);
}

public sealed class DeadLetterPublisher : IDeadLetterPublisher, IDisposable
{
    private readonly IProducer<string, string> producer;
    private readonly string topic;

    public DeadLetterPublisher(IOptions<KafkaOptions> options)
    {
        topic = options.Value.DeadLetterTopic;
        producer = new ProducerBuilder<string, string>(new ProducerConfig
        {
            BootstrapServers = options.Value.BootstrapServers,
            Acks = Acks.All,
            EnableIdempotence = true
        }).Build();
    }

    public async Task PublishAsync(Message<string, string> message, string error, CancellationToken cancellationToken)
    {
        var headers = new Headers();
        if (message.Headers is not null)
            foreach (var header in message.Headers)
                headers.Add(header.Key, header.GetValueBytes());
        headers.Add("error", Encoding.UTF8.GetBytes(error));
        headers.Add("failed-at", Encoding.UTF8.GetBytes(DateTimeOffset.UtcNow.ToString("O")));
        await producer.ProduceAsync(topic, new Message<string, string>
        {
            Key = message.Key, Value = message.Value, Headers = headers
        }, cancellationToken);
    }

    public void Dispose()
    {
        producer.Flush(TimeSpan.FromSeconds(5));
        producer.Dispose();
    }
}
~~~

### EmailTemplateRenderer.cs

Nội dung thư theo loại sự kiện.

[src/NotiService/Email/EmailTemplateRenderer.cs dòng 1–29](../../src/NotiService/Email/EmailTemplateRenderer.cs#L1-L29)

~~~csharp
using Exe.Contracts.Events;
namespace Exe.NotiService.Email;
public sealed class EmailTemplateRenderer
{
    public RenderedEmail? Render(EventEnvelope envelope, EventRecipient recipient)
    {
        string Get(string key) => envelope.Data.GetValueOrDefault(key, "");
        var room = Get(EventDataKeys.RoomCode);
        var course = Get(EventDataKeys.CourseCode);
        var actor = Get(EventDataKeys.ActorName);
        var count = Get(EventDataKeys.MemberCount);
        var group = Get(EventDataKeys.GroupCode);
        var approved = string.Equals(Get(EventDataKeys.Decision), "Approved", StringComparison.OrdinalIgnoreCase);
        var content = envelope.Type switch
        {
            EventTypes.RoomCreated => ($"[EXE] Bạn đã tạo phòng {room}", $"Bạn là trưởng phòng {room} của {course}."),
            EventTypes.RoomMemberJoined => ($"[EXE] {actor} đã vào phòng {room}", $"Phòng hiện có {count} thành viên."),
            EventTypes.RoomLocked => ($"[EXE] Phòng {room} đã khóa", $"Phòng đủ {count} thành viên; người mới phải gửi đơn để trưởng phòng duyệt."),
            EventTypes.RoomApplyCreated => ($"[EXE] Đơn xin vào phòng {room}", $"{actor} xin vào phòng. Lời nhắn: {Get(EventDataKeys.Message)}."),
            EventTypes.RoomApplyDecided => ($"[EXE] Đơn vào phòng {room}: {(approved ? "được chấp nhận" : "bị từ chối")}", $"{actor} đã {(approved ? "chấp nhận" : "từ chối")} đơn của bạn."),
            EventTypes.RoomLeaderChanged => ($"[EXE] Phòng {room} có trưởng phòng mới", $"Trưởng phòng mới là {actor}."),
            EventTypes.RoomCompleted => ($"[EXE] Nhóm {group} đã được thành lập", $"Phòng {room} đã hoàn tất và trở thành nhóm {group}."),
            EventTypes.CourseDeadlineReminder => ($"[EXE] Sắp hết hạn ghép nhóm {course}", $"Hạn ghép nhóm là {Get(EventDataKeys.Deadline)}. Bạn chưa có nhóm."),
            EventTypes.CourseClosed => ($"[EXE] {course} đã đóng ghép nhóm", "Phòng của bạn chưa hoàn tất; giảng viên sẽ hỗ trợ xếp nhóm."),
            _ => default
        };
        return content.Item1 is null ? null : new RenderedEmail(content.Item1, $"Chào {recipient.FullName},\n\n{content.Item2}");
    }
}
~~~

### SmtpEmailSender.cs

Gửi qua SMTP.

[src/NotiService/Email/SmtpEmailSender.cs dòng 1–23](../../src/NotiService/Email/SmtpEmailSender.cs#L1-L23)

~~~csharp
using Exe.Contracts.Events;
using Exe.NotiService.Options;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Options;
using MimeKit;
namespace Exe.NotiService.Email;
public sealed class SmtpEmailSender(IOptions<SmtpOptions> options) : IEmailSender
{
    public async Task SendAsync(EventRecipient recipient, RenderedEmail email, CancellationToken cancellationToken)
    {
        var settings = options.Value;
        var message = new MimeMessage();
        message.From.Add(new MailboxAddress(settings.FromName, settings.From));
        message.To.Add(new MailboxAddress(recipient.FullName, recipient.Email));
        message.Subject = email.Subject;
        message.Body = new TextPart("plain") { Text = email.Body };
        using var client = new SmtpClient();
        await client.ConnectAsync(settings.Host, settings.Port, SecureSocketOptions.None, cancellationToken);
        await client.SendAsync(message, cancellationToken);
        await client.DisconnectAsync(true, cancellationToken);
    }
}
~~~

### KafkaOptions.cs

Cấu hình topic, group và retry.

[src/NotiService/Options/KafkaOptions.cs dòng 1–12](../../src/NotiService/Options/KafkaOptions.cs#L1-L12)

~~~csharp
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
~~~

### SmtpOptions.cs

Cấu hình kết nối máy chủ thư.

[src/NotiService/Options/SmtpOptions.cs dòng 1–8](../../src/NotiService/Options/SmtpOptions.cs#L1-L8)

~~~csharp
namespace Exe.NotiService.Options;
public sealed class SmtpOptions
{
    public string Host { get; set; } = "localhost";
    public int Port { get; set; } = 1025;
    public string From { get; set; } = "";
    public string FromName { get; set; } = "";
}
~~~
