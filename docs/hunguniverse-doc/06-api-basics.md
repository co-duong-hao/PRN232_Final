# Quy ước HTTP dùng chung

Tài liệu tham chiếu cho PRN232 Final v0.4 tại commit 2e3789f.

[Mục lục bộ tài liệu](01-architecture.md)

## Cách hoạt động

API dùng ngoại lệ nghiệp vụ để trả mã trạng thái cùng mã lỗi. Mã lỗi giúp phân biệt ví dụ `BR05` với các xung đột khác cùng HTTP 409.

Danh sách dùng `PageQuery` và `PagedResult`. Tham số truy vấn phân trang và sắp xếp cần được đọc cùng endpoint cụ thể.

Dữ liệu ngày giờ giữ quy ước UTC qua converter. Khi kiểm thử thời hạn Course, nên ghi rõ múi giờ của giá trị gửi đi.

## Cách kiểm tra

1. Gọi danh sách với `page=1&pageSize=5` rồi so sánh `items` và `totalItems`.
2. Thử một thao tác trả lỗi nghiệp vụ và ghi cả HTTP status lẫn trường `code`.

## Đối chiếu mã nguồn

Các trích đoạn dưới đây hỗ trợ tra cứu. Đường dẫn mở phần tương ứng trong repo.

### AppExceptions.cs

Lớp ngoại lệ mà service ném ra.

[src/Shared/Web/Errors/AppExceptions.cs dòng 1–37](../../src/Shared/Web/Errors/AppExceptions.cs#L1-L37)

~~~csharp
namespace Exe.Shared.Web.Errors;

/// <summary>
/// Base for errors the API reports to the caller. Services throw these; <see cref="AppExceptionHandler"/>
/// turns them into ProblemDetails with <c>code</c> in the extensions.
/// </summary>
public class AppException(int statusCode, string code, string message) : Exception(message)
{
    public int StatusCode { get; } = statusCode;

    /// <summary>Stable machine-readable code, e.g. "BR05" or "NOT_FOUND".</summary>
    public string Code { get; } = code;
}

/// <summary>400.</summary>
public sealed class BadRequestException(string message, string code = "BAD_REQUEST")
    : AppException(400, code, message);

/// <summary>401.</summary>
public sealed class UnauthorizedAppException(string message, string code = "UNAUTHORIZED")
    : AppException(401, code, message);

/// <summary>403: authenticated but not allowed, e.g. not the room leader.</summary>
public sealed class ForbiddenException(string message, string code = "FORBIDDEN")
    : AppException(403, code, message);

/// <summary>404.</summary>
public sealed class NotFoundException(string message, string code = "NOT_FOUND")
    : AppException(404, code, message);

/// <summary>409: a business rule (BRxx) or a state precondition was violated. <c>code</c> is the rule code.</summary>
public sealed class BusinessRuleException(string code, string message)
    : AppException(409, code, message);

/// <summary>503: a dependency (e.g. Matching Service) did not respond.</summary>
public sealed class ServiceUnavailableException(string message, string code = "SERVICE_UNAVAILABLE")
    : AppException(503, code, message);
~~~

### AppExceptionHandler.cs

Chuyển một ngoại lệ thành ProblemDetails.

[src/Shared/Web/Errors/AppExceptionHandler.cs dòng 1–63](../../src/Shared/Web/Errors/AppExceptionHandler.cs#L1-L63)

~~~csharp
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
~~~

### Paging.cs

Hợp đồng phân trang dùng chung.

[src/Shared/Web/Paging/Paging.cs dòng 1–60](../../src/Shared/Web/Paging/Paging.cs#L1-L60)

~~~csharp
using Microsoft.EntityFrameworkCore;

namespace Exe.Shared.Web.Paging;

/// <summary>
/// Common list query parameters: <c>?page=1&amp;pageSize=20&amp;sortBy=code&amp;sortDir=desc&amp;q=text</c>.
/// Bind with <c>[FromQuery] PageQuery query</c>; derive from it to add filters.
/// </summary>
public class PageQuery
{
    public const int DefaultPageSize = 20;
    public const int MaxPageSize = 100;

    private int _page = 1;
    private int _pageSize = DefaultPageSize;

    /// <summary>1-based.</summary>
    public int Page
    {
        get => _page;
        set => _page = value < 1 ? 1 : value;
    }

    public int PageSize
    {
        get => _pageSize;
        set => _pageSize = value < 1 ? DefaultPageSize : Math.Min(value, MaxPageSize);
    }

    /// <summary>Field name, case-insensitive. Each endpoint documents the fields it accepts.</summary>
    public string? SortBy { get; set; }

    /// <summary>"asc" (default) or "desc".</summary>
    public string? SortDir { get; set; }

    /// <summary>Free-text search.</summary>
    public string? Q { get; set; }

    public bool Descending => string.Equals(SortDir, "desc", StringComparison.OrdinalIgnoreCase);
}

public sealed record PagedResult<T>(IReadOnlyList<T> Items, int Page, int PageSize, int TotalItems)
{
    public int TotalPages => PageSize <= 0 ? 0 : (int)Math.Ceiling(TotalItems / (double)PageSize);
}

public static class PagingExtensions
{
    /// <summary>Counts, then fetches one page. Apply filtering and ordering before calling.</summary>
    public static async Task<PagedResult<T>> ToPagedResultAsync<T>(
        this IQueryable<T> query, PageQuery page, CancellationToken cancellationToken = default)
    {
        var total = await query.CountAsync(cancellationToken);
        var items = await query
            .Skip((page.Page - 1) * page.PageSize)
            .Take(page.PageSize)
            .ToListAsync(cancellationToken);
        return new PagedResult<T>(items, page.Page, page.PageSize, total);
    }
}
~~~

### UtcDateTimeConverter.cs

Xử lý UTC khi đọc hoặc ghi JSON.

[src/Shared/Web/Json/UtcDateTimeConverter.cs dòng 1–50](../../src/Shared/Web/Json/UtcDateTimeConverter.cs#L1-L50)

~~~csharp
using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Http.Json;
using Microsoft.Extensions.DependencyInjection;

namespace Exe.Shared.Web.Json;

/// <summary>
/// All timestamps in this system are UTC, but SQL Server <c>datetime2</c> does not store the kind, so values
/// read through EF Core come back as <see cref="DateTimeKind.Unspecified"/> and would be serialised without a
/// "Z". This converter writes every <see cref="DateTime"/> as UTC ("2026-11-15T08:21:33.433Z") and reads
/// incoming values as UTC, so clients never misread them as local time.
/// </summary>
public sealed class UtcDateTimeConverter : JsonConverter<DateTime>
{
    public override DateTime Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var value = reader.GetDateTime();
        return value.Kind switch
        {
            DateTimeKind.Utc => value,
            DateTimeKind.Local => value.ToUniversalTime(),
            _ => DateTime.SpecifyKind(value, DateTimeKind.Utc),
        };
    }

    public override void Write(Utf8JsonWriter writer, DateTime value, JsonSerializerOptions options)
    {
        var utc = value.Kind switch
        {
            DateTimeKind.Local => value.ToUniversalTime(),
            DateTimeKind.Unspecified => DateTime.SpecifyKind(value, DateTimeKind.Utc),
            _ => value,
        };
        writer.WriteStringValue(utc.ToString("yyyy-MM-dd'T'HH:mm:ss.FFFFFFF'Z'", CultureInfo.InvariantCulture));
    }
}

public static class JsonExtensions
{
    /// <summary>Applies the shared JSON conventions to MVC controllers and minimal APIs.</summary>
    public static IServiceCollection AddExeJson(this IServiceCollection services)
    {
        services.Configure<Microsoft.AspNetCore.Mvc.JsonOptions>(o =>
            o.JsonSerializerOptions.Converters.Add(new UtcDateTimeConverter()));
        services.Configure<JsonOptions>(o => o.SerializerOptions.Converters.Add(new UtcDateTimeConverter()));
        return services;
    }
}
~~~

### SwaggerExtensions.cs

Khai báo Swagger và xác thực bearer.

[src/Shared/Web/Swagger/SwaggerExtensions.cs dòng 1–31](../../src/Shared/Web/Swagger/SwaggerExtensions.cs#L1-L31)

~~~csharp
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
~~~
