using System.ComponentModel.DataAnnotations;
using Exe.AuthService.Domain;
using Exe.Shared.Web.Paging;

namespace Exe.AuthService.Dtos;

public sealed record UpdateUserRequest
{
    [Required, MaxLength(200)]

    public string FullName { get; init; } = "";

    [Required]

    public UserStatus Status { get; init; }

    [Required]

    public string[] Roles { get; init; } = [];
}
