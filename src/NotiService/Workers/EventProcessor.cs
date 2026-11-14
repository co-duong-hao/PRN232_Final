using System.Text.Json;
using Exe.Contracts.Events;
using Exe.NotiService.Email;
namespace Exe.NotiService.Workers;
public sealed class EventProcessor(IEmailSender sender, EmailTemplateRenderer renderer, ILogger<EventProcessor> logger)
{
    public async Task<bool> ProcessAsync(string payload, CancellationToken cancellationToken)
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
            return false;
        }
        if (!EventTypes.All.Contains(envelope.Type, StringComparer.Ordinal))
        {
            logger.LogWarning("Bỏ qua loại sự kiện không xác định {EventType}.", envelope.Type);
            return true;
        }
        try
        {
            foreach (var recipient in envelope.Recipients)
            {
                var email = renderer.Render(envelope, recipient)!;
                await sender.SendAsync(recipient, email, cancellationToken);
            }
            return true;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Không gửi được email cho sự kiện {EventId}.", envelope.EventId);
            return false;
        }
    }
}
