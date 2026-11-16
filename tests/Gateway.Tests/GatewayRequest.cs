using System.IdentityModel.Tokens.Jwt;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace Exe.Gateway.Tests;

internal static class GatewayRequest
{
    internal static HttpRequestMessage Create(string method, string path, out string trace)
    {
        trace = Guid.NewGuid().ToString("N");
        var request = new HttpRequestMessage(new HttpMethod(method), path);
        request.Headers.Add("X-Test-Trace", trace);
        return request;
    }

    internal static string Jwt(
        string issuer = GatewayFixture.Issuer, string audience = GatewayFixture.Audience,
        string? key = null, DateTime? starts = null, DateTime? expires = null, string role = "Student")
    {
        var now = DateTime.UtcNow;
        var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key ?? GatewayFixture.SigningKey));
        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, Guid.NewGuid().ToString()),
            new Claim("role", role),
            new Claim("name", "Gateway Test Student"),
        };
        return new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(issuer, audience, claims,
            starts ?? now.AddMinutes(-3), expires ?? now.AddMinutes(10),
            new SigningCredentials(signingKey, SecurityAlgorithms.HmacSha256)));
    }

    internal static string Authorize(HttpRequestMessage request, string? token = null)
    {
        token ??= Jwt();
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return token;
    }
}
