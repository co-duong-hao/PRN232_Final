using Exe.AuthService.Domain;
using Exe.AuthService.Dtos;
using Exe.AuthService.Repositories;
using Exe.Contracts;
using Exe.Shared.Web.Auth;
using Exe.Shared.Web.Errors;
using Exe.Shared.Web.Paging;
using Microsoft.AspNetCore.Identity;

namespace Exe.AuthService.Services;

public interface IUserService
{
    Task<PagedResult<UserResponse>> ListAsync(UserQuery q, CancellationToken ct);

    Task<UserResponse> GetAsync(Guid id, CancellationToken ct);

    Task<UserResponse> CreateAsync(CreateUserRequest r, CancellationToken ct);

    Task<UserResponse> UpdateAsync(Guid id, UpdateUserRequest r, CancellationToken ct);

    Task ResetAsync(Guid id, ResetPasswordRequest r, CancellationToken ct);

    Task DeleteAsync(Guid id, CancellationToken ct);

    Task<IReadOnlyList<RoleResponse>> RolesAsync(CancellationToken ct);
}
