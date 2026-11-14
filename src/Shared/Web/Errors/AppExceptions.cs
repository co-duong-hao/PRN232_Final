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
