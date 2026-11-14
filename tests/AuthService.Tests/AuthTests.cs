using Exe.AuthService.Data;
using Exe.AuthService.Domain;
using Exe.AuthService.Dtos;
using Exe.AuthService.Repositories;
using Exe.AuthService.Services;
using Exe.Contracts;
using Exe.Shared.Web.Auth;
using Exe.Shared.Web.Errors;
using Microsoft.AspNetCore.Identity;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Moq;
using System.IdentityModel.Tokens.Jwt;

namespace Exe.AuthService.Tests;

public sealed class AuthTests : IDisposable
{
    private readonly SqliteConnection connection = new("DataSource=:memory:");

    private readonly AuthDbContext db;

    private readonly PasswordHasher<User> hasher = new();

    private readonly UserRepository repo;

    private readonly Mock<ICurrentUser> current = new();

    public AuthTests()
    {
        connection.Open();
        db = new(new DbContextOptionsBuilder<AuthDbContext>().UseSqlite(connection).Options);
        db.Database.EnsureCreated();
        repo = new(db);
        current.Setup(x => x.UserId).Returns(Guid.NewGuid());
        var role = new Role
        {
            Code = Roles.Student,
            Name = "Student"
        };
        var user = new User
        {
            Email = "student@example.com",
            FullName = "Student"
        };
        user.PasswordHash = hasher.HashPassword(user, "password123");
        user.UserRoles.Add(new UserRole { User = user, Role = role });
        db.Users.Add(user);
        db.SaveChanges();
    }


    private AuthService.Services.AuthService Auth() => new(repo, hasher, new TokenService(Options.Create(new JwtOptions { Issuer = "issuer", Audience = "audience", Key = "12345678901234567890123456789012" })), current.Object);
    [Fact]

    public async Task Login_Valid_ContainsClaims()
    {
        var result = await Auth().LoginAsync(new() { Email = "STUDENT@example.com", Password = "password123" }, default);
        var token = new JwtSecurityTokenHandler().ReadJwtToken(result.AccessToken);
        Assert.Equal("issuer", token.Issuer);
        Assert.Contains("audience", token.Audiences);
        Assert.Equal("student@example.com", token.Claims.Single(x => x.Type == "email").Value);
        Assert.Equal("Student", token.Claims.Single(x => x.Type == "role").Value);
        Assert.NotNull(token.Claims.Single(x => x.Type == "sub"));
        Assert.Equal("Student", token.Claims.Single(x => x.Type == "name").Value);
    }

    [Fact]

    public async Task Login_InvalidPasswordOrInactive_RejectsBoth()
    {
        var a = await Assert.ThrowsAsync<UnauthorizedAppException>(() => Auth().LoginAsync(new() { Email = "student@example.com", Password = "wrong" }, default));
        var u = db.Users.Single();
        u.Status = UserStatus.Inactive;
        await db.SaveChangesAsync();
        var b = await Assert.ThrowsAsync<UnauthorizedAppException>(() => Auth().LoginAsync(new() { Email = u.Email, Password = "password123" }, default));
        Assert.Equal("INVALID_CREDENTIALS", a.Code);
        Assert.Equal(a.Code, b.Code);
        Assert.Equal(a.Message, b.Message);
    }

    [Fact]

    public async Task Create_DuplicateEmail_Throws()
    {
        var service = new UserService(repo, hasher, current.Object);
        var ex = await Assert.ThrowsAsync<BusinessRuleException>(() => service.CreateAsync(new() { Email = "STUDENT@example.com", Password = "password123", FullName = "Name" }, default));
        Assert.Equal("EMAIL_EXISTS", ex.Code);
    }

    [Fact]

    public async Task List_FiltersAndPages()
    {
        db.Users.Add(new User { Email = "another@example.com", FullName = "Other", PasswordHash = "x", Status = UserStatus.Inactive });
        await db.SaveChangesAsync();
        var service = new UserService(repo, hasher, current.Object);
        var page = await service.ListAsync(new() { Q = "student", Role = "Student", Status = UserStatus.Active, PageSize = 1 }, default);
        Assert.Equal(1, page.TotalItems);
        Assert.Equal("student@example.com", Assert.Single(page.Items).Email);
    }


    public void Dispose()
    {
        db.Dispose();
        connection.Dispose();
    }
}
