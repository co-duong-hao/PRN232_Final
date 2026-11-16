using System.Diagnostics.Metrics;
using Microsoft.Extensions.DependencyInjection;
namespace Exe.AuthService.Tests;
internal sealed class MetricCapture : IDisposable
{
    private readonly ServiceProvider provider = new ServiceCollection().AddMetrics().BuildServiceProvider();
    private readonly MeterListener listener = new();
    private readonly List<(string Name, string? Label, long Value)> measurements = new();
    public IMeterFactory Factory => provider.GetRequiredService<IMeterFactory>();
    public MetricCapture(string meterName)
    {
        var meter = Factory.Create(meterName);
        listener.InstrumentPublished = (instrument, l) => { if (ReferenceEquals(instrument.Meter, meter)) l.EnableMeasurementEvents(instrument); };
        listener.SetMeasurementEventCallback<long>((instrument, value, tags, _) => { lock (measurements) measurements.Add((instrument.Name, tags.ToArray().FirstOrDefault(t => t.Key == "result").Value?.ToString(), value)); });
        listener.Start();
    }
    public long Count(string name, string? label = null) { lock (measurements) return measurements.Where(m => m.Name == name && (label is null || m.Label == label)).Sum(m => m.Value); }
    public void Dispose() { listener.Dispose(); provider.Dispose(); }
}
