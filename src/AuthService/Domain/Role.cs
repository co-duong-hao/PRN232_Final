namespace Exe.AuthService.Domain;

public sealed class Role
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public string Code { get; set; } = "";

    public string Name { get; set; } = "";

    public ICollection<UserRole> UserRoles { get; set; } = new List<UserRole>();
}
