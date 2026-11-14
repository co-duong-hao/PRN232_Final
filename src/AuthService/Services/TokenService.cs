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

public sealed class TokenService(IOptions<JwtOptions> options) : ITokenService
{
    public (string, DateTime) Create(User u)
    {
        var o = options.Value;
        var expires = DateTime.UtcNow.AddMinutes(o.AccessTokenMinutes);
        var claims = new List<Claim>
        {
            new(ExeClaims.Sub, u.Id.ToString()),
            new(ExeClaims.Email, u.Email),
            new(ExeClaims.Name, u.FullName)
        };
        claims.AddRange(u.UserRoles.Select(x => new Claim(ExeClaims.Role, x.Role.Code)));
        var jwt = new JwtSecurityToken(o.Issuer, o.Audience, claims, expires: expires, signingCredentials: new SigningCredentials(o.CreateSigningKey(), SecurityAlgorithms.HmacSha256));
        return (new JwtSecurityTokenHandler().WriteToken(jwt), expires);
    }
}
