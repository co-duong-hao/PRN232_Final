using System.Diagnostics;
using System.Text.Json;
using Exe.Contracts.Events;
using Confluent.Kafka;
using Exe.NotiService.Options;
using Microsoft.Extensions.Options;

namespace Exe.NotiService.Workers;

public sealed class EventConsumerWorker(
    IOptions<KafkaOptions> options,
    EventProcessor processor,
    IDeadLetterPublisher deadLetterPublisher,
    ILogger<EventConsumerWorker> logger, NotiMetrics metrics) : BackgroundService
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
                        (string Type, string Result) outcome = ("unknown", "skipped");
                        while (!ct.IsCancellationRequested)
                        {
                            try
                            {
                                if (!processed)
                                {
                                    outcome = await ProcessMessageAsync(record.Message, ct);
                                    processed = true;
                                }
                                CommitAndRecord(() => consumer.Commit(record), outcome);
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

    internal void CommitAndRecord(Action commit, (string Type, string Result) outcome)
    {
        commit();
        metrics.Consumed(outcome.Type, outcome.Result);
    }

    internal async Task<(string Type, string Result)> ProcessMessageAsync(Message<string, string> message, CancellationToken ct,
        Func<TimeSpan, CancellationToken, Task>? delay = null)
    {
        var started = Stopwatch.GetTimestamp();
        var type = "unknown";
        try { var value = message.Value is null ? null : EventEnvelope.FromJson(message.Value); if (value?.Type is { } t && EventTypes.All.Contains(t, StringComparer.Ordinal)) type = t; }
        catch (JsonException) { }
        try
        {
            delay ??= Task.Delay;
            var attempts = Math.Max(1, options.Value.MaxAttempts);
            ProcessingResult result = new(ProcessingStatus.PermanentFailure, "Payload rỗng.");
            for (var attempt = 1; attempt <= attempts; attempt++)
            {
                result = message.Value is null
                    ? new(ProcessingStatus.PermanentFailure, "Payload rỗng.")
                    : await processor.ProcessAsync(message.Value, ct);
                if (result.Status == ProcessingStatus.Success) return (type, "processed");
                if (result.Status == ProcessingStatus.Skipped) return (type, "skipped");
                if (result.Status == ProcessingStatus.PermanentFailure || attempt == attempts) break;
                metrics.Retry(type);
                await delay(TimeSpan.FromSeconds(Math.Pow(2, Math.Min(attempt - 1, 2))), ct);
            }
            logger.LogError("Không xử lý được sự kiện {EventId}: {Error}", result.EventId, result.Error);
            await deadLetterPublisher.PublishAsync(message, result.Error ?? "Lỗi xử lý sự kiện.", ct);
            return (type, "dead_lettered");
        }
        finally { metrics.Duration(type, Stopwatch.GetElapsedTime(started).TotalSeconds); }
    }
}
