using System.Collections.Concurrent;
using System.Net;
using System.Reflection;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Yarp.ReverseProxy.Forwarder;

namespace Exe.Gateway.Tests;

public sealed class GatewayFixture : IDisposable
{
    internal const string Issuer = "exe-auth";
    internal const string Audience = "exe-api";
    // This ephemeral signing key exists only in the test process.
    internal static readonly string SigningKey = Convert.ToHexString(System.Security.Cryptography.RandomNumberGenerator.GetBytes(32));
    internal const string AuthHost = "auth-upstream.test";
    internal const string TeamHost = "team-upstream.test";

    private readonly IDisposable application;
    private readonly ConcurrentDictionary<string, ForwardedRequest> forwarded = new();

    public GatewayFixture()
    {
        // The top-level Gateway entry point is internal. Use its runtime type to start the real host.
        var entryPoint = Assembly.Load("Exe.Gateway").EntryPoint!.DeclaringType!;
        var start = typeof(GatewayFixture).GetMethod(nameof(Start), BindingFlags.NonPublic | BindingFlags.Instance)!;
        application = (IDisposable)start.MakeGenericMethod(entryPoint).Invoke(this, null)!;
    }

    internal HttpClient Client { get; private set; } = null!;

    internal ForwardedRequest? Captured(string trace) =>
        forwarded.TryRemove(trace, out var request) ? request : null;

    public void Dispose()
    {
        Client.Dispose();
        application.Dispose();
    }

    private IDisposable Start<TEntryPoint>() where TEntryPoint : class
    {
        var applicationFactory = new WebApplicationFactory<TEntryPoint>();
        var configured = applicationFactory.WithWebHostBuilder(webHost =>
        {
            webHost.UseSetting("Jwt:Key", SigningKey);
            webHost.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(
                new Dictionary<string, string?>
                {
                    ["ReverseProxy:Clusters:auth:Destinations:d1:Address"] = $"http://{AuthHost}/",
                    ["ReverseProxy:Clusters:team:Destinations:d1:Address"] = $"http://{TeamHost}/",
                }));
            webHost.ConfigureTestServices(services =>
            {
                services.RemoveAll<IForwarderHttpClientFactory>();
                services.AddSingleton<IForwarderHttpClientFactory>(new RecordingFactory(forwarded));
            });
        });
        try
        {
            Client = configured.CreateClient(new WebApplicationFactoryClientOptions
            {
                AllowAutoRedirect = false,
                HandleCookies = false,
            });
            return applicationFactory;
        }
        catch
        {
            applicationFactory.Dispose();
            throw;
        }
    }

    internal sealed record ForwardedRequest(
        string Host,
        string PathAndQuery,
        string Method,
        string? Authorization,
        string? Body,
        string? ContentType);

    private sealed class RecordingFactory(ConcurrentDictionary<string, ForwardedRequest> requests)
        : IForwarderHttpClientFactory
    {
        public HttpMessageInvoker CreateClient(ForwarderHttpClientContext context) =>
            new(new UpstreamHandler(requests));
    }

    private sealed class UpstreamHandler(ConcurrentDictionary<string, ForwardedRequest> requests)
        : HttpMessageHandler
    {
        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var uri = request.RequestUri!;
            var trace = Assert.Single(request.Headers.GetValues("X-Test-Trace"));
            var body = request.Content is null ? null : await request.Content.ReadAsStringAsync(cancellationToken);
            var captured = new ForwardedRequest(uri.Host, uri.PathAndQuery, request.Method.Method,
                request.Headers.Authorization?.ToString(), body, request.Content?.Headers.ContentType?.MediaType);
            Assert.True(requests.TryAdd(trace, captured), $"Unexpected duplicate proxy request for {trace}");

            if (request.Headers.TryGetValues("X-Test-Response", out var responses))
            {
                var status = (HttpStatusCode)int.Parse(Assert.Single(responses));
                return new HttpResponseMessage(status)
                {
                    Content = new StringContent("upstream response"),
                    Headers = { { "X-Upstream-Host", uri.Host } },
                };
            }

            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(uri.Host),
            };
        }
    }
}
