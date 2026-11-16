using System.Diagnostics.Metrics;
namespace Exe.MatchingService;
public sealed class MatchingMetrics(IMeterFactory factory)
{
    private readonly Meter meter = factory.Create("Exe.MatchingService");
    public void Request(string method) => meter.CreateCounter<long>("exe.matching.requests").Add(1, new KeyValuePair<string, object?>("method", method));
    public void Composition(bool valid) => meter.CreateCounter<long>("exe.composition.checks").Add(1, new KeyValuePair<string, object?>("result", valid ? "valid" : "invalid"));
}
