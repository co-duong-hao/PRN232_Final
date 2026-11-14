using System.Text;
using Exe.Contracts;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;

namespace Exe.Shared.Web.Auth;

/// <summary>Bound from the <c>Jwt</c> configuration section. Every service shares the same values.</summary>
public sealed class JwtOptions
{
    public const string SectionName = "Jwt";

    public string Issuer { get; set; } = "exe-auth";
    public string Audience { get; set; } = "exe-api";

    /// <summary>HMAC-SHA256 signing key, at least 32 bytes. Supplied by configuration, never hard-coded.</summary>
    public string Key { get; set; } = string.Empty;

    public int AccessTokenMinutes { get; set; } = 60;

    public SymmetricSecurityKey CreateSigningKey()
    {
        if (string.IsNullOrWhiteSpace(Key) || Encoding.UTF8.GetByteCount(Key) < 32)
        {
            throw new InvalidOperationException("Jwt:Key must be configured with at least 32 bytes.");
        }

        return new SymmetricSecurityKey(Encoding.UTF8.GetBytes(Key));
    }
}

public static class JwtAuthExtensions
{
    /// <summary>
    /// Registers JWT bearer validation with the shared options, plus authorization.
    /// Role checks use <see cref="ExeClaims.Role"/>, so <c>[Authorize(Roles = Roles.Admin)]</c> works.
    /// </summary>
    public static IServiceCollection AddExeJwtAuth(this IServiceCollection services, IConfiguration configuration)
    {
        var section = configuration.GetSection(JwtOptions.SectionName);
        services.Configure<JwtOptions>(section);

        var options = section.Get<JwtOptions>() ?? new JwtOptions();
        var signingKey = options.CreateSigningKey();

        services
            .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(bearer =>
            {
                bearer.MapInboundClaims = false;
                bearer.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuer = options.Issuer,
                    ValidateAudience = true,
                    ValidAudience = options.Audience,
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = signingKey,
                    ValidateLifetime = true,
                    ClockSkew = TimeSpan.FromSeconds(30),
                    NameClaimType = ExeClaims.Name,
                    RoleClaimType = ExeClaims.Role,
                };
            });

        services.AddAuthorization();
        return services;
    }
}
