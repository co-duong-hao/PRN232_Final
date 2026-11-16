using System.Net;
using Exe.MatchingService.Services;
using Exe.Shared.Web.Observability;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Exe.MatchingService.Tests;

public sealed class MatchingEndpointTests
{
    [Fact]
    public async Task Endpoints_WhenRequested_ReturnHealthyAndPrometheusMetrics()
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Testing" });
        builder.Configuration.Sources.Clear();
        builder.Configuration.AddInMemoryCollection();
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        builder.Services.AddGrpc();
        builder.Services.AddHealthChecks();
        builder.Services.AddExeMetrics("matching-service", MatchingMetrics.MeterName);
        builder.Services.AddSingleton<MatchingMetrics>();

        await using var app = builder.Build();
        app.MapGrpcService<MatchingGrpcService>();
        app.MapHealthChecks("/health");
        app.MapExeMetrics();
        await app.StartAsync();

        try
        {
            var metrics = app.Services.GetRequiredService<MatchingMetrics>();
            metrics.Request("AnalyzeComposition");
            metrics.Composition(true);

            var address = app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.Single();
            using var client = new HttpClient { BaseAddress = new Uri(address) };

            var health = await client.GetAsync("/health");
            Assert.Equal(HttpStatusCode.OK, health.StatusCode);
            Assert.Equal("Healthy", await health.Content.ReadAsStringAsync());

            var scrape = await client.GetAsync("/metrics");
            Assert.Equal(HttpStatusCode.OK, scrape.StatusCode);
            var body = await scrape.Content.ReadAsStringAsync();
            Assert.Contains("exe_matching_requests_total", body);
            Assert.Contains("exe_composition_checks_total", body);
            Assert.Contains("http_server_request_duration_seconds", body);
        }
        finally
        {
            await app.StopAsync();
        }
    }
}
