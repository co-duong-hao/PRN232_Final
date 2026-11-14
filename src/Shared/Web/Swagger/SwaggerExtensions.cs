using Microsoft.Extensions.DependencyInjection;
using Microsoft.OpenApi.Models;

namespace Exe.Shared.Web.Swagger;

public static class SwaggerExtensions
{
    /// <summary>Swagger document with a Bearer "Authorize" button. Pair with UseSwagger/UseSwaggerUI.</summary>
    public static IServiceCollection AddExeSwagger(this IServiceCollection services, string title)
    {
        services.AddEndpointsApiExplorer();
        services.AddSwaggerGen(options =>
        {
            options.SwaggerDoc("v1", new OpenApiInfo { Title = title, Version = "v1" });

            var scheme = new OpenApiSecurityScheme
            {
                Name = "Authorization",
                Description = "Paste the access token returned by POST /api/auth/login.",
                In = ParameterLocation.Header,
                Type = SecuritySchemeType.Http,
                Scheme = "bearer",
                BearerFormat = "JWT",
                Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" },
            };
            options.AddSecurityDefinition("Bearer", scheme);
            options.AddSecurityRequirement(new OpenApiSecurityRequirement { [scheme] = Array.Empty<string>() });
        });
        return services;
    }
}
