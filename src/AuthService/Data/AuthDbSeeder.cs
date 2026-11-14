using Exe.AuthService.Domain;
using Exe.Contracts;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Exe.AuthService.Data;

public sealed class AuthDbSeeder(AuthDbContext db, IConfiguration config, ILogger<AuthDbSeeder> logger, IPasswordHasher<User> hasher)
{
    public async Task SeedAsync(CancellationToken ct)
    {
        if (!await db.Roles.AnyAsync(ct))
        {
            foreach (var code in Roles.All)
                db.Roles.Add(new Role { Code = code, Name = code });
            await db.SaveChangesAsync(ct);
        }

        if (await db.Users.AnyAsync(ct))
            return;
        var password = config["Seed:DefaultPassword"];
        if (string.IsNullOrWhiteSpace(password))
        {
            logger.LogWarning("Seed:DefaultPassword chưa được cấu hình; bỏ qua tạo tài khoản mẫu.");
            return;
        }

        var roles = await db.Roles.ToDictionaryAsync(x => x.Code, ct);
        void Add(string id, string email, string name, string role)
        {
            var u = new User
            {
                Id = Guid.Parse(id),
                Email = email,
                FullName = name
            };
            u.PasswordHash = hasher.HashPassword(u, password);
            u.UserRoles.Add(new UserRole { User = u, Role = roles[role] });
            db.Users.Add(u);
        }

        Add("00000000-0000-0000-0000-000000000001", "admin@exe.local", "Quản trị viên", Roles.Admin);
        Add("00000000-0000-0000-0000-000000000002", "hod@exe.local", "Trưởng bộ môn", Roles.HeadOfDepartment);
        Add("00000000-0000-0000-0000-000000000003", "lecturer@exe.local", "Giảng viên", Roles.Lecturer);
        for (int i = 1; i <= 12; i++)
            Add($"10000000-0000-0000-0000-{i:000000000000}", $"student{i:00}@exe.local", $"Sinh viên {i:00}", Roles.Student);
        await db.SaveChangesAsync(ct);
    }
}
