using System.Net;
using Exe.Contracts.Events;
using Exe.Shared.Web.Observability;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Exe.NotiService.Tests;

public sealed class NotiEndpointTests
{
    [Fact]
    public async Task Endpoints_WhenRequested_ReturnHealthyAndKafkaNotiMetrics()
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Testing" });
        builder.Configuration.Sources.Clear();
        builder.Configuration.AddInMemoryCollection();
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        builder.Services.AddExeMetrics("noti-service", NotiMetrics.MeterName);
        builder.Services.AddSingleton<NotiMetrics>();
        builder.Services.AddHealthChecks();

        await using var app = builder.Build();
        app.MapHealthChecks("/health");
        app.MapExeMetrics();
        await app.StartAsync();

        try
        {
            var metrics = app.Services.GetRequiredService<NotiMetrics>();
            metrics.Consumed(EventTypes.RoomCreated, "processed");
            metrics.Retry(EventTypes.RoomCreated);
            metrics.Email("ok");
            metrics.Duration(EventTypes.RoomCreated, 0.125);

            var address = app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.Single();
            using var client = new HttpClient { BaseAddress = new Uri(address) };

            var health = await client.GetAsync("/health");
            Assert.Equal(HttpStatusCode.OK, health.StatusCode);
            Assert.Equal("Healthy", await health.Content.ReadAsStringAsync());

            var scrape = await client.GetAsync("/metrics");
            Assert.Equal(HttpStatusCode.OK, scrape.StatusCode);
            var body = await scrape.Content.ReadAsStringAsync();
            Assert.Contains("exe_kafka_events_consumed_total", body);
            Assert.Contains("exe_kafka_event_retries_total", body);
            Assert.Contains("exe_emails_sent_total", body);
            Assert.Contains("exe_event_processing_duration_seconds_bucket", body);
            Assert.Contains("http_server_request_duration_seconds", body);
        }
        finally
        {
            await app.StopAsync();
        }
    }
}
