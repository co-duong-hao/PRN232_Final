using System.ComponentModel.DataAnnotations;
using Exe.AuthService.Domain;
using Exe.Shared.Web.Paging;

namespace Exe.AuthService.Dtos;

public sealed record ResetPasswordRequest
{
    [Required, MinLength(8)]

    public string Password { get; init; } = "";
}
