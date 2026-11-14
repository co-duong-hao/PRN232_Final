namespace Exe.AuthService.Domain;
public enum UserStatus { Active, Inactive }
public sealed class User { public Guid Id { get; set; } = Guid.NewGuid(); public string Email { get; set; } = ""; public string PasswordHash { get; set; } = ""; public string FullName { get; set; } = ""; public UserStatus Status { get; set; } = UserStatus.Active; public DateTime CreatedAt { get; set; } = DateTime.UtcNow; public ICollection<UserRole> UserRoles { get; set; } = new List<UserRole>(); }
public sealed class Role { public Guid Id { get; set; } = Guid.NewGuid(); public string Code { get; set; } = ""; public string Name { get; set; } = ""; public ICollection<UserRole> UserRoles { get; set; } = new List<UserRole>(); }
public sealed class UserRole { public Guid UserId { get; set; } public User User { get; set; } = null!; public Guid RoleId { get; set; } public Role Role { get; set; } = null!; }
