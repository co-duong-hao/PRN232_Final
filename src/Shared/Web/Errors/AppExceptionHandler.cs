using Exe.Shared.Web.Observability;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Exe.Shared.Web.Errors;

/// <summary>Maps exceptions to RFC 7807 ProblemDetails. Unknown exceptions become 500 without details.</summary>
public sealed class AppExceptionHandler(ILogger<AppExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        var (status, code, title) = exception switch
        {
            AppException app => (app.StatusCode, app.Code, app.Message),
            DbUpdateConcurrencyException => (StatusCodes.Status409Conflict, "CONCURRENCY_CONFLICT",
                "The resource was changed by another request. Please retry."),
            _ => (StatusCodes.Status500InternalServerError, "INTERNAL_ERROR", "An unexpected error occurred."),
        };

        SharedMetrics.RecordApiError(code, status);

        if (status >= 500)
        {
            logger.LogError(exception, "Unhandled error {Code} on {Method} {Path}",
                code, httpContext.Request.Method, httpContext.Request.Path);
        }
        else
        {
            logger.LogWarning("Request rejected with {Status} {Code}: {Message}", status, code, exception.Message);
        }

        var problem = new ProblemDetails
        {
            Status = status,
            Title = title,
            Type = $"https://httpstatuses.io/{status}",
            Instance = httpContext.Request.Path,
        };
        problem.Extensions["code"] = code;
        problem.Extensions["traceId"] = httpContext.TraceIdentifier;

        httpContext.Response.StatusCode = status;
        await httpContext.Response.WriteAsJsonAsync(problem, options: null,
            contentType: "application/problem+json", cancellationToken);
        return true;
    }
}

public static class ErrorHandlingExtensions
{
    public static IServiceCollection AddExeErrorHandling(this IServiceCollection services)
    {
        services.AddProblemDetails();
        services.AddExceptionHandler<AppExceptionHandler>();
        return services;
    }

    /// <summary>Call first in the pipeline so every later middleware is covered.</summary>
    public static IApplicationBuilder UseExeErrorHandling(this IApplicationBuilder app) => app.UseExceptionHandler();
}
