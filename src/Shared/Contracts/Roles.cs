namespace Exe.Contracts;

/// <summary>System roles. The values are the role codes stored in AuthDb and carried in the JWT.</summary>
public static class Roles
{
    public const string Admin = "Admin";
    public const string HeadOfDepartment = "HeadOfDepartment";
    public const string Lecturer = "Lecturer";
    public const string Student = "Student";

    /// <summary>For <c>[Authorize(Roles = Roles.AdminOrHead)]</c>.</summary>
    public const string AdminOrHead = Admin + "," + HeadOfDepartment;

    /// <summary>For <c>[Authorize(Roles = Roles.Staff)]</c>: everyone except students.</summary>
    public const string Staff = Admin + "," + HeadOfDepartment + "," + Lecturer;

    public static readonly IReadOnlyList<string> All = [Admin, HeadOfDepartment, Lecturer, Student];
}

/// <summary>Claim names used in the access token. Inbound claim mapping is disabled.</summary>
public static class ExeClaims
{
    /// <summary>User id (Guid).</summary>
    public const string Sub = "sub";
    public const string Email = "email";
    public const string Name = "name";
    /// <summary>One claim per role.</summary>
    public const string Role = "role";
}
