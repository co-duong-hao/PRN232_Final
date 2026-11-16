using System.Diagnostics.Metrics;
namespace Exe.MatchingService;
public sealed class MatchingMetrics
{
    private readonly Counter<long> requests;
    private readonly Counter<long> compositionChecks;

    public MatchingMetrics(IMeterFactory factory)
    {
        var meter = factory.Create("Exe.MatchingService");
        requests = meter.CreateCounter<long>("exe.matching.requests");
        compositionChecks = meter.CreateCounter<long>("exe.composition.checks");
    }

    public void Request(string method) => requests.Add(1, new KeyValuePair<string, object?>("method", method));
    public void Composition(bool valid) => compositionChecks.Add(1, new KeyValuePair<string, object?>("result", valid ? "valid" : "invalid"));
}
