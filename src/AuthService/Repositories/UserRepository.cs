using Exe.AuthService.Data;
using Exe.AuthService.Domain;
using Microsoft.EntityFrameworkCore;

namespace Exe.AuthService.Repositories;

public sealed class UserRepository(AuthDbContext db) : IUserRepository
{
    public IQueryable<User> Query() => db.Users.Include(x => x.UserRoles).ThenInclude(x => x.Role);

    public Task<User?> FindAsync(Guid id, CancellationToken ct) => Query().FirstOrDefaultAsync(x => x.Id == id, ct);

    public Task<User?> FindEmailAsync(string email, CancellationToken ct) => Query().FirstOrDefaultAsync(x => x.Email == email, ct);

    public Task<List<Role>> RolesAsync(CancellationToken ct) => db.Roles.ToListAsync(ct);

    public void Add(User user) => db.Users.Add(user);

    public Task SaveAsync(CancellationToken ct) => db.SaveChangesAsync(ct);
}
