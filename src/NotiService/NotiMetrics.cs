using System.Diagnostics.Metrics;
namespace Exe.NotiService;
public sealed class NotiMetrics(IMeterFactory factory)
{
    private readonly Meter meter = factory.Create("Exe.NotiService");
    public void Consumed(string type, string result) => meter.CreateCounter<long>("exe.kafka.events.consumed").Add(1, new KeyValuePair<string, object?>("type", type), new KeyValuePair<string, object?>("result", result));
    public void Retry(string type) => meter.CreateCounter<long>("exe.kafka.event.retries").Add(1, new KeyValuePair<string, object?>("type", type));
    public void Email(string result) => meter.CreateCounter<long>("exe.emails.sent").Add(1, new KeyValuePair<string, object?>("result", result));
    public void Duration(string type, double seconds) => meter.CreateHistogram<double>("exe.event.processing.duration", unit: "s").Record(seconds, new KeyValuePair<string, object?>("type", type));
}
