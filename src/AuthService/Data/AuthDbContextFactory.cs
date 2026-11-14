using Exe.AuthService.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Exe.AuthService.Data;

public sealed class AuthDbContextFactory : IDesignTimeDbContextFactory<AuthDbContext>
{
    public AuthDbContext CreateDbContext(string[] args) => new(new DbContextOptionsBuilder<AuthDbContext>().UseSqlServer("Server=localhost;Database=AuthDb;Trusted_Connection=True;TrustServerCertificate=True").Options);
}
