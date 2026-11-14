using System.ComponentModel.DataAnnotations;
using Exe.AuthService.Domain;
using Exe.Shared.Web.Paging;

namespace Exe.AuthService.Dtos;

public sealed record CreateUserRequest
{
    [Required, EmailAddress, MaxLength(256)]

    public string Email { get; init; } = "";

    [Required, MaxLength(200)]

    public string FullName { get; init; } = "";

    [Required, MinLength(8)]

    public string Password { get; init; } = "";

    [Required]

    public string[] Roles { get; init; } = [];
}
