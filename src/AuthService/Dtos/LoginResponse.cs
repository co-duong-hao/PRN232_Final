using System.ComponentModel.DataAnnotations;
using Exe.AuthService.Domain;
using Exe.Shared.Web.Paging;

namespace Exe.AuthService.Dtos;

public sealed record LoginResponse(string AccessToken, string TokenType, DateTime ExpiresAt, LoginUserResponse User);
