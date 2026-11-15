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
