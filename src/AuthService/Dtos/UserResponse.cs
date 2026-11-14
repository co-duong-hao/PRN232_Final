using System.ComponentModel.DataAnnotations;
using Exe.AuthService.Domain;
using Exe.Shared.Web.Paging;

namespace Exe.AuthService.Dtos;

public sealed record UserResponse(Guid Id, string Email, string FullName, UserStatus Status, IReadOnlyList<string> Roles, DateTime CreatedAt);
