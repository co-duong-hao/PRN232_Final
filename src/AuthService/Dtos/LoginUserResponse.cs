using System.ComponentModel.DataAnnotations;
using Exe.AuthService.Domain;
using Exe.Shared.Web.Paging;

namespace Exe.AuthService.Dtos;

public sealed record LoginUserResponse(Guid Id, string Email, string FullName, IReadOnlyList<string> Roles);
