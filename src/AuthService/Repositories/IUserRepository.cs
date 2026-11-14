using Exe.AuthService.Data;
using Exe.AuthService.Domain;
using Microsoft.EntityFrameworkCore;

namespace Exe.AuthService.Repositories;

public interface IUserRepository
{
    IQueryable<User> Query();

    Task<User?> FindAsync(Guid id, CancellationToken ct);

    Task<User?> FindEmailAsync(string email, CancellationToken ct);

    Task<List<Role>> RolesAsync(CancellationToken ct);

    void Add(User user);

    Task SaveAsync(CancellationToken ct);
}
