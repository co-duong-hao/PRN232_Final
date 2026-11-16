using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Claims;
using Microsoft.IdentityModel.Tokens;
using static Exe.Gateway.Tests.GatewayRequest;

namespace Exe.Gateway.Tests;

public sealed class GatewayJwtTests(GatewayFixture gateway) : IClassFixture<GatewayFixture>
{
    [Theory]
    [InlineData("/api/users")]
    [InlineData("/api/users/123")]
    [InlineData("/api/roles")]
    [InlineData("/api/roles/student")]
    [InlineData("/api/courses")]
    [InlineData("/api/rooms/123/composition")]
    [InlineData("/api/room-applies/123/approve")]
    public async Task ProtectedRoutesRejectMissingBearerBeforeForwarding(string path)
    {
        using var request = Create("GET", path, out var trace);
        using var response = await gateway.Client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        var challenge = Assert.Single(response.Headers.WwwAuthenticate);
        Assert.Equal("Bearer", challenge.Scheme);
        Assert.Null(gateway.Captured(trace));
    }

    [Theory]
    [InlineData("invalid-audience", "/api/courses")]
    [InlineData("invalid-issuer", "/api/courses")]
    [InlineData("invalid-signing-key", "/api/courses")]
    [InlineData("expired", "/api/courses")]
    [InlineData("future", "/api/courses")]
    [InlineData("malformed", "/api/courses")]
    [InlineData("unsigned", "/api/courses")]
    [InlineData("missing-expiry", "/api/courses")]
    [InlineData("invalid-audience", "/api/users")]
    [InlineData("invalid-issuer", "/api/roles")]
    [InlineData("invalid-signing-key", "/api/users")]
    [InlineData("expired", "/api/roles")]
    [InlineData("future", "/api/users")]
    [InlineData("malformed", "/api/roles")]
    [InlineData("unsigned", "/api/users")]
    [InlineData("missing-expiry", "/api/roles")]
    public async Task InvalidTokenIsChallengedWithoutAnUpstreamCall(string fault, string path)
    {
        using var request = Create("GET", path, out var trace);
        Authorize(request, MakeInvalidToken(fault));
        using var response = await gateway.Client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        var challenge = Assert.Single(response.Headers.WwwAuthenticate);
        Assert.Equal("Bearer", challenge.Scheme);
        Assert.Contains("invalid_token", challenge.Parameter ?? "");
        Assert.Null(gateway.Captured(trace));
    }

    [Theory]
    [InlineData("Basic", "/api/users")]
    [InlineData("Token", "/api/courses")]
    [InlineData("Digest", "/api/roles")]
    public async Task BearerTokenUnderWrongAuthorizationSchemeIsIgnored(string scheme, string path)
    {
        using var request = Create("GET", path, out var trace);
        request.Headers.Authorization = new AuthenticationHeaderValue(scheme, Jwt());
        using var response = await gateway.Client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("Bearer", Assert.Single(response.Headers.WwwAuthenticate).Scheme);
        Assert.Null(gateway.Captured(trace));
    }

    [Theory]
    [InlineData("/api/courses", GatewayFixture.TeamHost, "Student")]
    [InlineData("/api/courses", GatewayFixture.TeamHost, "Lecturer")]
    [InlineData("/api/users", GatewayFixture.AuthHost, "Student")]
    [InlineData("/api/users", GatewayFixture.AuthHost, "Admin")]
    [InlineData("/api/roles", GatewayFixture.AuthHost, "HeadOfDepartment")]
    public async Task DefaultGatewayPolicyPassesValidatedTokenToDownstreamForRoleChecks(
        string path, string cluster, string role)
    {
        using var request = Create("GET", path, out var trace);
        var token = Authorize(request, Jwt(role: role));
        using var response = await gateway.Client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Empty(response.Headers.WwwAuthenticate);
        var forwarded = Assert.IsType<GatewayFixture.ForwardedRequest>(gateway.Captured(trace));
        Assert.Equal(cluster, forwarded.Host);
        Assert.Equal(path, forwarded.PathAndQuery);
        Assert.Equal($"Bearer {token}", forwarded.Authorization);
    }

    [Theory]
    [InlineData("expired-within-skew")]
    [InlineData("starts-within-skew")]
    [InlineData("currently-valid")]
    public async Task LifetimeValidationAllowsConfiguredClockSkew(string window)
    {
        using var request = Create("GET", "/api/courses", out var trace);
        var now = DateTime.UtcNow;
        var token = window switch
        {
            "expired-within-skew" => Jwt(expires: now.AddSeconds(-5)),
            "starts-within-skew" => Jwt(starts: now.AddSeconds(5)),
            _ => Jwt(starts: now.AddMinutes(-1), expires: now.AddMinutes(1)),
        };
        Authorize(request, token);
        using var response = await gateway.Client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal($"Bearer {token}", gateway.Captured(trace)?.Authorization);
    }

    [Theory]
    [InlineData("/api/courses?access_token=")]
    [InlineData("/api/users?access_token=")]
    [InlineData("/api/roles?access_token=")]
    public async Task QueryParameterAloneDoesNotSupplyBearerCredentials(string path)
    {
        using var request = Create("GET", path + Uri.EscapeDataString(Jwt()), out var trace);
        using var response = await gateway.Client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Null(gateway.Captured(trace));
    }

    [Theory]
    [InlineData("/api/auth/login", "expired")]
    [InlineData("/api/auth/refresh", "invalid-audience")]
    [InlineData("/api/auth/me", "malformed")]
    public async Task PublicAuthRouteRemainsForwardableWhenHeaderIsInvalid(string path, string fault)
    {
        using var request = Create("POST", path, out var trace);
        var token = Authorize(request, MakeInvalidToken(fault));
        using var response = await gateway.Client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var forwarded = Assert.IsType<GatewayFixture.ForwardedRequest>(gateway.Captured(trace));
        Assert.Equal(GatewayFixture.AuthHost, forwarded.Host);
        Assert.Equal($"Bearer {token}", forwarded.Authorization);
    }

    [Fact]
    public async Task RejectedAuthorizationDoesNotLeakToNextRequest()
    {
        const string path = "/api/courses";
        using var invalid = Create("GET", path, out var invalidTrace);
        Authorize(invalid, MakeInvalidToken("expired"));
        using var valid = Create("GET", path, out var validTrace);
        var token = Authorize(valid);

        using var rejected = await gateway.Client.SendAsync(invalid);
        using var passed = await gateway.Client.SendAsync(valid);

        Assert.Equal(HttpStatusCode.Unauthorized, rejected.StatusCode);
        Assert.Null(gateway.Captured(invalidTrace));
        Assert.Equal(HttpStatusCode.OK, passed.StatusCode);
        Assert.Equal($"Bearer {token}", gateway.Captured(validTrace)?.Authorization);
    }

    private static string MakeInvalidToken(string fault) => fault switch
    {
        "invalid-audience" => Jwt(audience: "other-audience"),
        "invalid-issuer" => Jwt(issuer: "other-team"),
        "invalid-signing-key" => Jwt(key: Convert.ToHexString(System.Security.Cryptography.RandomNumberGenerator.GetBytes(32))),
        "expired" => Jwt(expires: DateTime.UtcNow.AddMinutes(-2)),
        "future" => Jwt(starts: DateTime.UtcNow.AddMinutes(2)),
        "malformed" => "bad-token-value",
        "unsigned" => new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(
            GatewayFixture.Issuer, GatewayFixture.Audience, [new Claim("role", "Student")],
            DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(2))),
        "missing-expiry" => new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(
            new JwtHeader(new SigningCredentials(
                new SymmetricSecurityKey(System.Text.Encoding.UTF8.GetBytes(GatewayFixture.SigningKey)),
                SecurityAlgorithms.HmacSha256)),
            new JwtPayload(GatewayFixture.Issuer, GatewayFixture.Audience, [new Claim("role", "Student")], null, null))),
        _ => throw new ArgumentOutOfRangeException(nameof(fault), fault, null),
    };
}
