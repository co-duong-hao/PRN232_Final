using System.Diagnostics.Metrics;
using Exe.TeamService.Infrastructure;

namespace Exe.TeamService.Tests;

internal sealed class MetricCapture : IDisposable
{
    private readonly MeterListener listener = new();
    private readonly List<(string Name, long Value, Dictionary<string, object?> Tags)> measurements = [];
    public MetricCapture(TeamMetrics metrics)
    {
        listener.InstrumentPublished = (instrument, current) =>
        {
            if (instrument.Meter == metrics.Meter) current.EnableMeasurementEvents(instrument);
        };
        listener.SetMeasurementEventCallback<long>((instrument, value, tags, _) =>
        {
            lock (measurements) measurements.Add((instrument.Name, value, tags.ToArray().ToDictionary(x => x.Key, x => x.Value)));
        });
        listener.Start();
    }
    public long Count(string name, string? tag = null, string? value = null)
    {
        lock (measurements) return measurements.Where(x => x.Name == name && (tag == null || x.Tags.TryGetValue(tag, out var actual) && Equals(actual, value))).Sum(x => x.Value);
    }
    public void Dispose() => listener.Dispose();
}
