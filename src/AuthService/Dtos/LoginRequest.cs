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
