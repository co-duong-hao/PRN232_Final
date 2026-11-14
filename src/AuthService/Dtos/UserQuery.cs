using System.ComponentModel.DataAnnotations;
using Exe.AuthService.Domain;
using Exe.Shared.Web.Paging;

namespace Exe.AuthService.Dtos;

public sealed class UserQuery : PageQuery
{
    public string? Role { get; set; }

    public UserStatus? Status { get; set; }
}
