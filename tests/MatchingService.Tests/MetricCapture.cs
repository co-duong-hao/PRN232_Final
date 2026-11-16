using System.Diagnostics.Metrics;
using Microsoft.Extensions.DependencyInjection;

namespace Exe.MatchingService.Tests;

internal sealed class MetricCapture : IDisposable
{
    private readonly ServiceProvider provider = new ServiceCollection().AddMetrics().BuildServiceProvider();
    private readonly MeterListener listener = new();
    private readonly List<(string Name, Dictionary<string, object?> Tags, long Value)> measurements = [];

    public IMeterFactory Factory => provider.GetRequiredService<IMeterFactory>();

    public MetricCapture(string meterName)
    {
        var meter = Factory.Create(meterName);
        listener.InstrumentPublished = (instrument, current) =>
        {
            if (ReferenceEquals(instrument.Meter, meter))
            {
                current.EnableMeasurementEvents(instrument);
            }
        };
        listener.SetMeasurementEventCallback<long>((instrument, value, tags, _) =>
        {
            lock (measurements)
            {
                measurements.Add((instrument.Name, tags.ToArray().ToDictionary(t => t.Key, t => t.Value), value));
            }
        });
        listener.Start();
    }

    public long Count(string name, string? label = null)
    {
        lock (measurements)
        {
            return measurements
                .Where(m => m.Name == name && (label is null ||
                    m.Tags.Any(t => (t.Key == "result" || t.Key == "method") && Equals(t.Value?.ToString(), label))))
                .Sum(m => m.Value);
        }
    }

    public long Count(string name, params (string Key, string? Value)[] tags)
    {
        lock (measurements)
        {
            return measurements
                .Where(m => m.Name == name && tags.All(t => m.Tags.TryGetValue(t.Key, out var actual) && Equals(actual?.ToString(), t.Value)))
                .Sum(m => m.Value);
        }
    }

    public void Dispose()
    {
        listener.Dispose();
        provider.Dispose();
    }
}
