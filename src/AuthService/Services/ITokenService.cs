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

public interface ITokenService
{
    (string Token, DateTime ExpiresAt) Create(User user);
}
