using System.Diagnostics.Metrics;

namespace Exe.Shared.Web.Observability;

/// <summary>
/// Metrics recorded by shared code. <c>exe_api_errors_total{code,status}</c> counts every error response produced by
/// <see cref="Errors.AppExceptionHandler"/>, so Grafana can show which business rules (BR05, BR11, BR19...) reject
/// requests most often.
/// </summary>
public static class SharedMetrics
{
    public const string MeterName = "Exe.Shared";

    private static readonly Meter Meter = new(MeterName);

    private static readonly Counter<long> ApiErrors =
        Meter.CreateCounter<long>("exe.api.errors", description: "Error responses by code (BRxx, NOT_FOUND...) and HTTP status.");

    public static void RecordApiError(string code, int status) =>
        ApiErrors.Add(1, new KeyValuePair<string, object?>("code", code), new KeyValuePair<string, object?>("status", status));
}
