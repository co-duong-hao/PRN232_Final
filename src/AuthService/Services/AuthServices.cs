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
public interface ITokenService { (string Token,DateTime ExpiresAt) Create(User user); }
public sealed class TokenService(IOptions<JwtOptions> options) : ITokenService {
 public (string,DateTime) Create(User u) { var o=options.Value; var expires=DateTime.UtcNow.AddMinutes(o.AccessTokenMinutes); var claims=new List<Claim> { new(ExeClaims.Sub,u.Id.ToString()),new(ExeClaims.Email,u.Email),new(ExeClaims.Name,u.FullName) }; claims.AddRange(u.UserRoles.Select(x=>new Claim(ExeClaims.Role,x.Role.Code))); var jwt=new JwtSecurityToken(o.Issuer,o.Audience,claims,expires:expires,signingCredentials:new SigningCredentials(o.CreateSigningKey(),SecurityAlgorithms.HmacSha256)); return (new JwtSecurityTokenHandler().WriteToken(jwt),expires); }
}
public interface IAuthService { Task<LoginResponse> LoginAsync(LoginRequest request,CancellationToken ct); Task<UserResponse> MeAsync(CancellationToken ct); }
public sealed class AuthService(IUserRepository repository,IPasswordHasher<User> hasher,ITokenService tokens,ICurrentUser current) : IAuthService {
 public async Task<LoginResponse> LoginAsync(LoginRequest request,CancellationToken ct) { var u=await repository.FindEmailAsync(request.Email.Trim().ToLowerInvariant(),ct); if(u is null || u.Status!=UserStatus.Active || hasher.VerifyHashedPassword(u,u.PasswordHash,request.Password)==PasswordVerificationResult.Failed) throw new UnauthorizedAppException("Email hoặc mật khẩu không hợp lệ.","INVALID_CREDENTIALS"); var (token,expires)=tokens.Create(u); return new(token,"Bearer",expires,new(u.Id,u.Email,u.FullName,u.UserRoles.Select(x=>x.Role.Code).ToArray())); }
 public async Task<UserResponse> MeAsync(CancellationToken ct) => UserService.Map(await repository.FindAsync(current.UserId,ct) ?? throw new NotFoundException("Không tìm thấy tài khoản."));
}
