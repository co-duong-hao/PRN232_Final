using Exe.Contracts;
using Exe.Shared.Web.Errors;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

namespace Exe.Shared.Web.Auth;

/// <summary>The caller of the current HTTP request, read from the validated access token.</summary>
public interface ICurrentUser
{
    bool IsAuthenticated { get; }

    /// <summary>User id from the <c>sub</c> claim. Throws 401 when the request is anonymous.</summary>
    Guid UserId { get; }

    string? Email { get; }
    string? FullName { get; }
    IReadOnlyCollection<string> Roles { get; }
    bool IsInRole(string role);
}

public sealed class HttpCurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    private System.Security.Claims.ClaimsPrincipal? Principal => accessor.HttpContext?.User;

    public bool IsAuthenticated => Principal?.Identity?.IsAuthenticated == true;

    public Guid UserId =>
        Guid.TryParse(Principal?.FindFirst(ExeClaims.Sub)?.Value, out var id)
            ? id
            : throw new UnauthorizedAppException("The access token does not identify a user.");

    public string? Email => Principal?.FindFirst(ExeClaims.Email)?.Value;

    public string? FullName => Principal?.FindFirst(ExeClaims.Name)?.Value;

    public IReadOnlyCollection<string> Roles =>
        Principal?.FindAll(ExeClaims.Role).Select(c => c.Value).ToArray() ?? [];

    public bool IsInRole(string role) => Roles.Contains(role, StringComparer.Ordinal);
}

public static class CurrentUserExtensions
{
    public static IServiceCollection AddExeCurrentUser(this IServiceCollection services)
    {
        services.AddHttpContextAccessor();
        services.AddScoped<ICurrentUser, HttpCurrentUser>();
        return services;
    }
}
