using System.Diagnostics.Metrics;

namespace Exe.MatchingService;

/// <summary>Prometheus business metrics for Matching Service.</summary>
public sealed class MatchingMetrics
{
    public const string MeterName = "Exe.MatchingService";
    private readonly Meter meter;
    private readonly Counter<long> requests;
    private readonly Counter<long> compositionChecks;

    public MatchingMetrics(IMeterFactory factory)
    {
        meter = factory.Create(MeterName);
        requests = meter.CreateCounter<long>("exe.matching.requests");
        compositionChecks = meter.CreateCounter<long>("exe.composition.checks");
    }

    internal Meter Meter => meter;

    public void Request(string method) =>
        requests.Add(1, new KeyValuePair<string, object?>("method", method));

    public void Composition(bool valid) =>
        compositionChecks.Add(1, new KeyValuePair<string, object?>("result", valid ? "valid" : "invalid"));
}
