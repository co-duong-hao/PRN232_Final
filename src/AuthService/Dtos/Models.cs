using System.ComponentModel.DataAnnotations;
using Exe.AuthService.Domain;
using Exe.Shared.Web.Paging;
namespace Exe.AuthService.Dtos;
public sealed record LoginRequest { [Required,EmailAddress] public string Email { get; init; } = ""; [Required] public string Password { get; init; } = ""; }
public sealed record CreateUserRequest { [Required,EmailAddress,MaxLength(256)] public string Email { get; init; } = ""; [Required,MaxLength(200)] public string FullName { get; init; } = ""; [Required,MinLength(8)] public string Password { get; init; } = ""; [Required] public string[] Roles { get; init; } = []; }
public sealed record UpdateUserRequest { [Required,MaxLength(200)] public string FullName { get; init; } = ""; [Required] public UserStatus Status { get; init; } [Required] public string[] Roles { get; init; } = []; }
public sealed record ResetPasswordRequest { [Required,MinLength(8)] public string Password { get; init; } = ""; }
public sealed record UserResponse(Guid Id,string Email,string FullName,UserStatus Status,IReadOnlyList<string> Roles,DateTime CreatedAt);
public sealed record LoginUserResponse(Guid Id,string Email,string FullName,IReadOnlyList<string> Roles);
public sealed record LoginResponse(string AccessToken,string TokenType,DateTime ExpiresAt,LoginUserResponse User);
public sealed record RoleResponse(Guid Id,string Code,string Name);
public sealed class UserQuery : PageQuery { public string? Role { get; set; } public UserStatus? Status { get; set; } }
