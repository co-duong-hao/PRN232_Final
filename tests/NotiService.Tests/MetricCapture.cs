using System.Diagnostics.Metrics;
using Microsoft.Extensions.DependencyInjection;

namespace Exe.NotiService.Tests;

internal sealed class MetricCapture : IDisposable
{
    private readonly ServiceProvider provider = new ServiceCollection().AddMetrics().BuildServiceProvider();
    private readonly MeterListener listener = new();
    private readonly List<(string Name, Dictionary<string, object?> Tags, long Value)> counters = [];
    private readonly List<(string Name, Dictionary<string, object?> Tags, double Value)> histograms = [];

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
            lock (counters)
            {
                counters.Add((instrument.Name, tags.ToArray().ToDictionary(t => t.Key, t => t.Value), value));
            }
        });
        listener.SetMeasurementEventCallback<double>((instrument, value, tags, _) =>
        {
            lock (histograms)
            {
                histograms.Add((instrument.Name, tags.ToArray().ToDictionary(t => t.Key, t => t.Value), value));
            }
        });
        listener.Start();
    }

    public long Count(string name, string? label = null)
    {
        lock (counters)
        {
            return counters
                .Where(m => m.Name == name && (label is null ||
                    (m.Tags.TryGetValue("result", out var actual) && Equals(actual?.ToString(), label))))
                .Sum(m => m.Value);
        }
    }

    public long Count(string name, params (string Key, string? Value)[] tags)
    {
        lock (counters)
        {
            return counters
                .Where(m => m.Name == name && Matches(m.Tags, tags))
                .Sum(m => m.Value);
        }
    }

    public IReadOnlyList<double> HistogramValues(string name, params (string Key, string? Value)[] tags)
    {
        lock (histograms)
        {
            return histograms
                .Where(m => m.Name == name && Matches(m.Tags, tags))
                .Select(m => m.Value)
                .ToArray();
        }
    }

    private static bool Matches(Dictionary<string, object?> actual, (string Key, string? Value)[] expected) =>
        expected.All(t => actual.TryGetValue(t.Key, out var value) && Equals(value?.ToString(), t.Value));

    public void Dispose()
    {
        listener.Dispose();
        provider.Dispose();
    }
}
