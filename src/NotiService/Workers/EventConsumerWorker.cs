using Exe.Contracts.Events;
using Exe.NotiService.Options;
using Microsoft.Extensions.Options;
using StackExchange.Redis;

namespace Exe.NotiService.Workers;

public sealed class EventConsumerWorker(
    IConnectionMultiplexer connection,
    IOptions<RedisOptions> options,
    EventProcessor processor,
    ILogger<EventConsumerWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var settings = options.Value;
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var db = connection.GetDatabase();
                try
                {
                    await db.StreamCreateConsumerGroupAsync(settings.Stream, settings.ConsumerGroup, "0", createStream: true);
                }
                catch (RedisServerException ex) when (ex.Message.StartsWith("BUSYGROUP", StringComparison.Ordinal))
                {
                    // Another instance already created the group.
                }

                var nextClaim = DateTime.UtcNow;
                while (!stoppingToken.IsCancellationRequested)
                {
                    if (DateTime.UtcNow >= nextClaim)
                    {
                        await ReclaimAsync(db, settings, stoppingToken);
                        nextClaim = DateTime.UtcNow.AddSeconds(30);
                    }

                    var entries = await db.StreamReadGroupAsync(settings.Stream, settings.ConsumerGroup, settings.ConsumerName, ">", count: 10);
                    foreach (var entry in entries)
                        await ProcessAsync(db, settings, entry, stoppingToken);
                    if (entries.Length == 0)
                        await Task.Delay(TimeSpan.FromSeconds(1), stoppingToken);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Xử lý sự kiện thất bại; thử lại sau 5 giây.");
                await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
            }
        }
    }

    private async Task ReclaimAsync(IDatabase db, RedisOptions settings, CancellationToken ct)
    {
        RedisValue cursor = "0-0";
        do
        {
            var claimed = await db.StreamAutoClaimAsync(settings.Stream, settings.ConsumerGroup, settings.ConsumerName, 60000, cursor, count: 10);
            cursor = claimed.NextStartId;
            foreach (var entry in claimed.ClaimedEntries)
            {
                var pending = await db.StreamPendingMessagesAsync(settings.Stream, settings.ConsumerGroup, 1, settings.ConsumerName, entry.Id, entry.Id);
                if (pending.Length > 0 && pending[0].DeliveryCount > 5)
                {
                    var payload = entry.Values.FirstOrDefault(x => x.Name == EventStreams.PayloadField).Value.ToString();
                    string eventId;
                    try { eventId = EventEnvelope.FromJson(payload)?.EventId.ToString() ?? "unknown"; }
                    catch (System.Text.Json.JsonException) { eventId = "unknown"; }
                    logger.LogError("Sự kiện {EventId}, entry {EntryId} đã vượt quá số lần giao; chuyển vào dead stream.", eventId, entry.Id);
                    await db.StreamAddAsync(settings.Stream + ".dead", entry.Values);
                    await db.StreamAcknowledgeAsync(settings.Stream, settings.ConsumerGroup, entry.Id);
                }
                else
                {
                    await ProcessAsync(db, settings, entry, ct);
                }
            }
        }
        while (cursor != "0-0" && !ct.IsCancellationRequested);
    }

    private async Task ProcessAsync(IDatabase db, RedisOptions settings, StreamEntry entry, CancellationToken ct)
    {
        var payload = entry.Values.FirstOrDefault(x => x.Name == EventStreams.PayloadField).Value.ToString();
        if (await processor.ProcessAsync(payload, ct))
            await db.StreamAcknowledgeAsync(settings.Stream, settings.ConsumerGroup, entry.Id);
    }
}
