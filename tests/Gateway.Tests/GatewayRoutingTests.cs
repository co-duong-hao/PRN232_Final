using System.Net;
using System.Text;
using static Exe.Gateway.Tests.GatewayRequest;

namespace Exe.Gateway.Tests;

public sealed class GatewayRoutingTests(GatewayFixture gateway) : IClassFixture<GatewayFixture>
{
    [Theory]
    [InlineData("POST", "/api/auth/login")]
    [InlineData("POST", "/api/auth/refresh")]
    [InlineData("POST", "/api/auth/logout")]
    [InlineData("GET", "/api/auth/me")]
    [InlineData("GET", "/api/auth")]
    [InlineData("GET", "/api/auth/")]
    public async Task PublicAuthPrefixIsForwardedWithoutBearer(string method, string path)
    {
        using var request = Create(method, path, out var trace);
        using var response = await gateway.Client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(GatewayFixture.AuthHost, await response.Content.ReadAsStringAsync());
        var forwarded = Assert.IsType<GatewayFixture.ForwardedRequest>(gateway.Captured(trace));
        Assert.Equal(GatewayFixture.AuthHost, forwarded.Host);
        Assert.Equal(path, forwarded.PathAndQuery);
        Assert.Equal(method, forwarded.Method);
        Assert.Null(forwarded.Authorization);
    }

    [Theory]
    [InlineData("GET", "/api/users", GatewayFixture.AuthHost)]
    [InlineData("GET", "/api/users/123", GatewayFixture.AuthHost)]
    [InlineData("GET", "/api/roles", GatewayFixture.AuthHost)]
    [InlineData("PUT", "/api/roles/example", GatewayFixture.AuthHost)]
    [InlineData("GET", "/api/courses", GatewayFixture.TeamHost)]
    [InlineData("GET", "/api/rooms/123/composition", GatewayFixture.TeamHost)]
    [InlineData("POST", "/api/rooms/123/applies", GatewayFixture.TeamHost)]
    [InlineData("GET", "/api/authentication", GatewayFixture.TeamHost)]
    [InlineData("GET", "/api/roles-and-rules", GatewayFixture.TeamHost)]
    [InlineData("GET", "/api/users-extra/123", GatewayFixture.TeamHost)]
    [InlineData("GET", "/api/student/me/courses", GatewayFixture.TeamHost)]
    public async Task MostSpecificRouteSelectsExpectedCluster(string method, string path, string cluster)
    {
        using var request = Create(method, path, out var trace);
        var jwt = Authorize(request);
        using var response = await gateway.Client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(cluster, await response.Content.ReadAsStringAsync());
        var forwarded = Assert.IsType<GatewayFixture.ForwardedRequest>(gateway.Captured(trace));
        Assert.Equal(cluster, forwarded.Host);
        Assert.Equal(path, forwarded.PathAndQuery);
        Assert.Equal(method, forwarded.Method);
        Assert.Equal($"Bearer {jwt}", forwarded.Authorization);
    }

    [Theory]
    [InlineData("/api/auth/login?return=%2Fteams%2F42", "POST", GatewayFixture.AuthHost)]
    [InlineData("/api/rooms/a/apply?notify=true&notify=false", "POST", GatewayFixture.TeamHost)]
    [InlineData("/api/rooms/a?tag=gui%20don&sortDir=desc", "PUT", GatewayFixture.TeamHost)]
    public async Task BodyMethodAndQueryAreForwardedIntact(string path, string method, string cluster)
    {
        const string payload = """{"message":"Em muốn tham gia nhóm thiết kế"}""";
        using var request = Create(method, path, out var trace);
        request.Content = new StringContent(payload, Encoding.UTF8, "application/json");
        Authorize(request);
        using var response = await gateway.Client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var forwarded = Assert.IsType<GatewayFixture.ForwardedRequest>(gateway.Captured(trace));
        Assert.Equal(cluster, forwarded.Host);
        Assert.Equal(method, forwarded.Method);
        Assert.Equal(path, forwarded.PathAndQuery);
        Assert.Equal("application/json", forwarded.ContentType);
        Assert.Equal(payload, forwarded.Body);
    }

    [Theory]
    [InlineData("/api/auth/login", 400, GatewayFixture.AuthHost)]
    [InlineData("/api/auth/me", 401, GatewayFixture.AuthHost)]
    [InlineData("/api/users/unknown", 404, GatewayFixture.AuthHost)]
    [InlineData("/api/rooms/closed", 409, GatewayFixture.TeamHost)]
    [InlineData("/api/courses/current", 503, GatewayFixture.TeamHost)]
    public async Task UpstreamStatusAndHeadersReachTheClient(string path, int status, string cluster)
    {
        using var request = Create("GET", path, out var trace);
        request.Headers.Add("X-Test-Response", status.ToString());
        Authorize(request);
        using var response = await gateway.Client.SendAsync(request);

        Assert.Equal((HttpStatusCode)status, response.StatusCode);
        Assert.Equal(cluster, Assert.Single(response.Headers.GetValues("X-Upstream-Host")));
        Assert.Equal("upstream response", await response.Content.ReadAsStringAsync());
        Assert.Equal(cluster, gateway.Captured(trace)?.Host);
    }

    [Theory]
    [InlineData("/")]
    [InlineData("/courses")]
    [InlineData("/health/unknown")]
    [InlineData("/apiary/rooms")]
    public async Task NonApiRouteDoesNotReachEitherCluster(string path)
    {
        using var request = Create("GET", path, out var trace);
        Authorize(request);
        using var response = await gateway.Client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Null(gateway.Captured(trace));
    }

    [Fact]
    public async Task GatewayHealthIsServedLocallyWithNoToken()
    {
        using var request = Create("GET", "/health", out var trace);
        using var response = await gateway.Client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Healthy", await response.Content.ReadAsStringAsync());
        Assert.Null(gateway.Captured(trace));
    }

    [Fact]
    public async Task ConcurrentRequestsKeepTheirOwnRouteAndAuthorization()
    {
        var paths = new Dictionary<string, string>
        {
            ["/api/auth/login"] = GatewayFixture.AuthHost,
            ["/api/users/example"] = GatewayFixture.AuthHost,
            ["/api/roles/example"] = GatewayFixture.AuthHost,
            ["/api/courses/EXE101"] = GatewayFixture.TeamHost,
            ["/api/rooms/example"] = GatewayFixture.TeamHost,
        };

        await Task.WhenAll(paths.Select(async mapping =>
        {
            using var request = Create("GET", mapping.Key, out var trace);
            var jwt = Authorize(request);
            using var response = await gateway.Client.SendAsync(request);

            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var forwarded = Assert.IsType<GatewayFixture.ForwardedRequest>(gateway.Captured(trace));
            Assert.Equal(mapping.Value, forwarded.Host);
            Assert.Equal(mapping.Key, forwarded.PathAndQuery);
            Assert.Equal($"Bearer {jwt}", forwarded.Authorization);
        }));
    }
}
