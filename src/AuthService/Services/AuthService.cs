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

public sealed class AuthService(IUserRepository repository, IPasswordHasher<User> hasher, ITokenService tokens, ICurrentUser current, AuthMetrics metrics) : IAuthService
{
    public async Task<LoginResponse> LoginAsync(LoginRequest request, CancellationToken ct)
    {
        var u = await repository.FindEmailAsync(request.Email.Trim().ToLowerInvariant(), ct);
        if (u is null || u.Status != UserStatus.Active || hasher.VerifyHashedPassword(u, u.PasswordHash, request.Password) == PasswordVerificationResult.Failed)
        {
            metrics.Record("failed");
            throw new UnauthorizedAppException("Email hoặc mật khẩu không hợp lệ.", "INVALID_CREDENTIALS");
        }
        var (token, expires) = tokens.Create(u);
        metrics.Record("success");
        return new(token, "Bearer", expires, new(u.Id, u.Email, u.FullName, u.UserRoles.Select(x => x.Role.Code).ToArray()));
    }


    public async Task<UserResponse> MeAsync(CancellationToken ct) => UserService.Map(await repository.FindAsync(current.UserId, ct) ?? throw new NotFoundException("Không tìm thấy tài khoản."));
}
