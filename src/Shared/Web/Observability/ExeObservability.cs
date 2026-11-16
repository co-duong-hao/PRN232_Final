using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;

namespace Exe.Shared.Web.Observability;

/// <summary>
/// Metrics for every service: OpenTelemetry collects them, <c>GET /metrics</c> exposes them in Prometheus text
/// format, Prometheus scrapes that endpoint and Grafana draws the dashboard. See docs/design/observability.md.
/// </summary>
public static class ExeObservability
{
    /// <summary>Prefix of every business meter name, e.g. "Exe.TeamService".</summary>
    public const string MeterPrefix = "Exe.";

    /// <summary>
    /// Registers HTTP server/client, .NET runtime and the service's own meters.
    /// <paramref name="serviceName"/> becomes the <c>service_name</c> label in Prometheus (for example "team-service").
    /// <paramref name="meterNames"/> are the names of the <see cref="System.Diagnostics.Metrics.Meter"/> instances the
    /// service creates for its business metrics.
    /// </summary>
    public static IServiceCollection AddExeMetrics(this IServiceCollection services, string serviceName, params string[] meterNames)
    {
        services.AddOpenTelemetry()
            .ConfigureResource(resource => resource.AddService(serviceName))
            .WithMetrics(metrics =>
            {
                metrics
                    .AddAspNetCoreInstrumentation()
                    .AddHttpClientInstrumentation()
                    .AddRuntimeInstrumentation()
                    .AddMeter(SharedMetrics.MeterName)
                    .AddMeter(meterNames)
                    .AddPrometheusExporter();
            });
        return services;
    }

    /// <summary>
    /// Maps <c>GET /metrics</c>. Call it before any catch-all route (for example the gateway's reverse proxy).
    /// The endpoint is not routed by the gateway, so only Prometheus on the Docker network can reach it.
    /// </summary>
    public static WebApplication MapExeMetrics(this WebApplication app)
    {
        app.MapPrometheusScrapingEndpoint("/metrics");
        return app;
    }
}
