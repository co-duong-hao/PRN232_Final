# Đăng nhập và JWT

Tài liệu tham chiếu cho PRN232 Final v0.4 tại commit 2e3789f.

[Mục lục bộ tài liệu](01-architecture.md)

## Cách hoạt động

AuthService xác minh email và mật khẩu băm, sau đó trả token và thông tin người dùng. Frontend gửi bearer token khi gọi API bảo vệ.

JWT mang thông tin định danh và vai trò hệ thống. Quyền trưởng phòng được kiểm tra riêng bằng quan hệ với phòng trong TeamService.

JWT của môi trường chạy được cấu hình qua `Jwt` và biến môi trường. Khi minh họa token, dùng giá trị giữ chỗ thay cho khóa ký hoặc token thật.

## Cách kiểm tra

1. Đăng nhập bằng một tài khoản mẫu rồi gọi `/api/auth/me`.
2. Thử đăng nhập với mật khẩu sai và phân biệt lỗi này với lỗi thiếu quyền ở endpoint quản trị.

## Đối chiếu mã nguồn

Các trích đoạn dưới đây hỗ trợ tra cứu. Đường dẫn mở phần tương ứng trong repo.

### AuthController.cs

Endpoint đăng nhập và thông tin tài khoản hiện tại.

[src/AuthService/Controllers/AuthController.cs dòng 1–17](../../src/AuthService/Controllers/AuthController.cs#L1-L17)

~~~csharp
using Exe.AuthService.Dtos;
using Exe.AuthService.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Exe.AuthService.Controllers;

[ApiController, Route("api/auth"), Authorize]
public sealed class AuthController(IAuthService service) : ControllerBase
{
    [HttpPost("login"), AllowAnonymous]

    public async Task<ActionResult<LoginResponse>> Login(LoginRequest request, CancellationToken ct) => Ok(await service.LoginAsync(request, ct));
    [HttpGet("me")]

    public async Task<ActionResult<UserResponse>> Me(CancellationToken ct) => Ok(await service.MeAsync(ct));
}
~~~

### AuthService.cs

Tìm người dùng, kiểm tra trạng thái và mật khẩu.

[src/AuthService/Services/AuthService.cs dòng 1–28](../../src/AuthService/Services/AuthService.cs#L1-L28)

~~~csharp
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Exe.AuthService.Domain;
using Exe.AuthService.Dtos;
using Exe.AuthService.Repositories;
using Exe.Contracts;
using Exe.Shared.Web.Auth;
using Exe.Shared.Web.Errors;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace Exe.AuthService.Services;

public sealed class AuthService(IUserRepository repository, IPasswordHasher<User> hasher, ITokenService tokens, ICurrentUser current) : IAuthService
{
    public async Task<LoginResponse> LoginAsync(LoginRequest request, CancellationToken ct)
    {
        var u = await repository.FindEmailAsync(request.Email.Trim().ToLowerInvariant(), ct);
        if (u is null || u.Status != UserStatus.Active || hasher.VerifyHashedPassword(u, u.PasswordHash, request.Password) == PasswordVerificationResult.Failed)
            throw new UnauthorizedAppException("Email hoặc mật khẩu không hợp lệ.", "INVALID_CREDENTIALS");
        var (token, expires) = tokens.Create(u);
        return new(token, "Bearer", expires, new(u.Id, u.Email, u.FullName, u.UserRoles.Select(x => x.Role.Code).ToArray()));
    }


    public async Task<UserResponse> MeAsync(CancellationToken ct) => UserService.Map(await repository.FindAsync(current.UserId, ct) ?? throw new NotFoundException("Không tìm thấy tài khoản."));
}
~~~

### TokenService.cs

Tạo JWT và claim.

[src/AuthService/Services/TokenService.cs dòng 1–31](../../src/AuthService/Services/TokenService.cs#L1-L31)

~~~csharp
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Exe.AuthService.Domain;
using Exe.AuthService.Dtos;
using Exe.AuthService.Repositories;
using Exe.Contracts;
using Exe.Shared.Web.Auth;
using Exe.Shared.Web.Errors;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace Exe.AuthService.Services;

public sealed class TokenService(IOptions<JwtOptions> options) : ITokenService
{
    public (string, DateTime) Create(User u)
    {
        var o = options.Value;
        var expires = DateTime.UtcNow.AddMinutes(o.AccessTokenMinutes);
        var claims = new List<Claim>
        {
            new(ExeClaims.Sub, u.Id.ToString()),
            new(ExeClaims.Email, u.Email),
            new(ExeClaims.Name, u.FullName)
        };
        claims.AddRange(u.UserRoles.Select(x => new Claim(ExeClaims.Role, x.Role.Code)));
        var jwt = new JwtSecurityToken(o.Issuer, o.Audience, claims, expires: expires, signingCredentials: new SigningCredentials(o.CreateSigningKey(), SecurityAlgorithms.HmacSha256));
        return (new JwtSecurityTokenHandler().WriteToken(jwt), expires);
    }
}
~~~

### JwtAuth.cs

Cấu hình chung cho các ứng dụng kiểm JWT.

[src/Shared/Web/Auth/JwtAuth.cs dòng 1–71](../../src/Shared/Web/Auth/JwtAuth.cs#L1-L71)

~~~csharp
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
~~~

### CurrentUser.cs

Đọc định danh và vai trò từ request.

[src/Shared/Web/Auth/CurrentUser.cs dòng 1–51](../../src/Shared/Web/Auth/CurrentUser.cs#L1-L51)

~~~csharp
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
~~~

### Roles.cs

Vai trò hệ thống và tên claim.

[src/Shared/Contracts/Roles.cs dòng 1–29](../../src/Shared/Contracts/Roles.cs#L1-L29)

~~~csharp
namespace Exe.Contracts;

/// <summary>System roles. The values are the role codes stored in AuthDb and carried in the JWT.</summary>
public static class Roles
{
    public const string Admin = "Admin";
    public const string HeadOfDepartment = "HeadOfDepartment";
    public const string Lecturer = "Lecturer";
    public const string Student = "Student";

    /// <summary>For <c>[Authorize(Roles = Roles.AdminOrHead)]</c>.</summary>
    public const string AdminOrHead = Admin + "," + HeadOfDepartment;

    /// <summary>For <c>[Authorize(Roles = Roles.Staff)]</c>: everyone except students.</summary>
    public const string Staff = Admin + "," + HeadOfDepartment + "," + Lecturer;

    public static readonly IReadOnlyList<string> All = [Admin, HeadOfDepartment, Lecturer, Student];
}

/// <summary>Claim names used in the access token. Inbound claim mapping is disabled.</summary>
public static class ExeClaims
{
    /// <summary>User id (Guid).</summary>
    public const string Sub = "sub";
    public const string Email = "email";
    public const string Name = "name";
    /// <summary>One claim per role.</summary>
    public const string Role = "role";
}
~~~

### LoginRequest.cs

Kiểu dữ liệu đầu vào cho đăng nhập.

[src/AuthService/Dtos/LoginRequest.cs dòng 1–16](../../src/AuthService/Dtos/LoginRequest.cs#L1-L16)

~~~csharp
using System.ComponentModel.DataAnnotations;
using Exe.AuthService.Domain;
using Exe.Shared.Web.Paging;

namespace Exe.AuthService.Dtos;

public sealed record LoginRequest
{
    [Required, EmailAddress]

    public string Email { get; init; } = "";

    [Required]

    public string Password { get; init; } = "";
}
~~~

### LoginResponse.cs

Kiểu dữ liệu phản hồi.

[src/AuthService/Dtos/LoginResponse.cs dòng 1–7](../../src/AuthService/Dtos/LoginResponse.cs#L1-L7)

~~~csharp
using System.ComponentModel.DataAnnotations;
using Exe.AuthService.Domain;
using Exe.Shared.Web.Paging;

namespace Exe.AuthService.Dtos;

public sealed record LoginResponse(string AccessToken, string TokenType, DateTime ExpiresAt, LoginUserResponse User);
~~~
