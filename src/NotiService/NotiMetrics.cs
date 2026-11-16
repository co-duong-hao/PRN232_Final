using System.Diagnostics.Metrics;
namespace Exe.NotiService;
public sealed class NotiMetrics
{
    private readonly Counter<long> consumed;
    private readonly Counter<long> retries;
    private readonly Counter<long> emails;
    private readonly Histogram<double> duration;

    public NotiMetrics(IMeterFactory factory)
    {
        var meter = factory.Create("Exe.NotiService");
        consumed = meter.CreateCounter<long>("exe.kafka.events.consumed");
        retries = meter.CreateCounter<long>("exe.kafka.event.retries");
        emails = meter.CreateCounter<long>("exe.emails.sent");
        duration = meter.CreateHistogram<double>("exe.event.processing.duration", unit: "s");
    }

    public void Consumed(string type, string result) => consumed.Add(1, new KeyValuePair<string, object?>("type", type), new KeyValuePair<string, object?>("result", result));
    public void Retry(string type) => retries.Add(1, new KeyValuePair<string, object?>("type", type));
    public void Email(string result) => emails.Add(1, new KeyValuePair<string, object?>("result", result));
    public void Duration(string type, double seconds) => duration.Record(seconds, new KeyValuePair<string, object?>("type", type));
}
