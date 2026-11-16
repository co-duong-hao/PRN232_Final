# Dữ liệu mẫu v0.4

Tài liệu tham chiếu cho PRN232 Final v0.4 tại commit 2e3789f.

[Mục lục bộ tài liệu](01-architecture.md)

## Cách hoạt động

AuthDb có 3 tài khoản quản lý và 12 tài khoản sinh viên. Quy trình seed chỉ đặt mật khẩu lúc tạo các user mẫu.

Dữ liệu TeamDb v0.4 mới có hai Course `FA26-EXE101` và `FA26-EXE201` ở trạng thái `Forming`. Sinh viên mẫu được ghi danh vào cả hai Course.

GPA và vai trò của sinh viên nằm trong TeamDb. Khi sửa bằng ứng dụng, kết quả chạy sau đó cần dựa trên hồ sơ hiện tại.

## Cách kiểm tra

1. Dùng bốn sinh viên 01, 02, 06, 08 để tạo cơ cấu 2 SE, 1 AI và 1 GD.
2. Kiểm tra `GET /api/me/courses` bằng sinh viên để phân biệt dữ liệu mẫu mới với database đã dùng để diễn tập.

## Đối chiếu mã nguồn

Các trích đoạn dưới đây hỗ trợ tra cứu. Đường dẫn mở phần tương ứng trong repo.

### AuthDbSeeder.cs

Tạo user và gắn vai trò hệ thống.

[src/AuthService/Data/AuthDbSeeder.cs dòng 1–49](../../src/AuthService/Data/AuthDbSeeder.cs#L1-L49)

~~~csharp
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
~~~

### TeamDbSeeder.cs

Khởi tạo Semester, Course, sinh viên, GPA, vai trò và ghi danh.

[src/TeamService/Data/TeamDbSeeder.cs dòng 1–48](../../src/TeamService/Data/TeamDbSeeder.cs#L1-L48)

~~~csharp
using Exe.TeamService.Domain;
using Microsoft.EntityFrameworkCore;

namespace Exe.TeamService.Data;

public static class TeamDbSeeder
{
    public static async Task SeedAsync(TeamDbContext db, CancellationToken ct = default)
    {
        if (!await db.Semesters.AnyAsync(ct))
        {
        var semester = new Semester { Code = "FA26", Name = "Fall 2026", StartDate = new DateTime(2026, 9, 7, 0, 0, 0, DateTimeKind.Utc), EndDate = new DateTime(2026, 12, 27, 0, 0, 0, DateTimeKind.Utc) };
        var subjects = new[] { new Subject { Code = "EXE101", Name = "Trải nghiệm khởi nghiệp 1" }, new Subject { Code = "EXE201", Name = "Trải nghiệm khởi nghiệp 2" } };
        var majors = new[] { new Major { Code = "SE", Name = "Kỹ thuật phần mềm" }, new Major { Code = "AI", Name = "Trí tuệ nhân tạo" }, new Major { Code = "GD", Name = "Thiết kế đồ họa" }, new Major { Code = "MKT", Name = "Marketing" } };
        var type = new GroupType { Name = "Nhóm EXE chuẩn", MinMemberCount = 4, MaxMemberCount = 6, MinMajorCount = 3 };
        type.Majors.Add(new GroupTypeMajor { Major = majors[0], MinQuantity = 2, MaxQuantity = 3 });
        var students = Enumerable.Range(1, 12).Select(i => {
            var major = majors[i <= 5 ? 0 : i <= 7 ? 1 : i <= 10 ? 2 : 3];
            return new Student { Id = Guid.Parse($"20000000-0000-0000-0000-{i:000000000000}"), UserId = Guid.Parse($"10000000-0000-0000-0000-{i:000000000000}"), StudentCode = $"{(i > 10 ? "MK" : major.Code)}1800{i:00}", FullName = $"Sinh viên {i:00}", Email = $"student{i:00}@exe.local", Major = major };
        }).ToArray();
        var courses = subjects.Select((s, i) => new Course { Id = i == 0 ? Guid.Parse("30000000-0000-0000-0000-000000000001") : Guid.Parse("30000000-0000-0000-0000-000000000002"), Code = $"FA26-{s.Code}", Semester = semester, Subject = s, GroupType = type, Status = CourseStatus.Forming, StartTime = new DateTime(2026, 11, 1, 0, 0, 0, DateTimeKind.Utc), Deadline = new DateTime(2026, 12, 15, 0, 0, 0, DateTimeKind.Utc) }).ToArray();
        db.AddRange(courses); db.AddRange(students);
        db.StudentInCourses.AddRange(students.Select(s => new StudentInCourse { Course = courses[0], Student = s, EnrolledAt = DateTime.UtcNow }));
        await db.SaveChangesAsync(ct);
        }
        var needsRecruitmentSeed = !await db.TeamRoles.AnyAsync(ct);
        var roleSeeds = new[] { ("FE", "Frontend"), ("BE", "Backend"), ("MOBILE", "Mobile"), ("UIUX", "UI/UX Design"), ("BA", "Business Analyst"), ("MKT", "Marketing"), ("BIZ", "Business/Finance") };
        foreach (var (code, name) in roleSeeds)
            if (!await db.TeamRoles.AnyAsync(x => x.Code == code, ct)) db.TeamRoles.Add(new TeamRole { Code = code, Name = name });
        await db.SaveChangesAsync(ct);
        if (!needsRecruitmentSeed) return;
        var roles = await db.TeamRoles.ToDictionaryAsync(x => x.Code, ct);
        decimal[] gpas = [3.40m, 3.10m, 2.80m, 3.60m, 2.20m, 3.50m, 2.60m, 3.00m, 2.40m, 3.20m, 2.90m, 3.30m];
        string[][] desired = [["BE", "FE"], ["FE"], ["BE", "MOBILE"], ["BA"], ["MOBILE"], ["BE"], ["BE"], ["UIUX"], ["UIUX", "FE"], ["UIUX"], ["MKT", "BIZ"], ["MKT"]];
        var course = await db.Courses.SingleOrDefaultAsync(x => x.Code == "FA26-EXE201", ct);
        if (course is not null) course.Status = CourseStatus.Forming;
        for (var i = 1; i <= 12; i++)
        {
            var id = Guid.Parse($"20000000-0000-0000-0000-{i:000000000000}");
            var student = await db.Students.Include(x => x.Roles).SingleOrDefaultAsync(x => x.Id == id, ct);
            if (student is null) continue;
            if (!student.Gpa.HasValue) student.Gpa = gpas[i - 1];
            if (student.Roles.Count == 0) foreach (var code in desired[i - 1]) student.Roles.Add(new StudentTeamRole { TeamRole = roles[code] });
            if (course is not null && !await db.StudentInCourses.AnyAsync(x => x.CourseId == course.Id && x.StudentId == id, ct)) db.StudentInCourses.Add(new StudentInCourse { CourseId = course.Id, StudentId = id, EnrolledAt = DateTime.UtcNow });
        }
        await db.SaveChangesAsync(ct);
    }
}
~~~

### AuthDbContext.cs

Cấu trúc persistence của tài khoản.

[src/AuthService/Data/AuthDbContext.cs dòng 1–41](../../src/AuthService/Data/AuthDbContext.cs#L1-L41)

~~~csharp
using Exe.AuthService.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Exe.AuthService.Data;

public sealed class AuthDbContext(DbContextOptions<AuthDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();

    public DbSet<Role> Roles => Set<Role>();

    public DbSet<UserRole> UserRoles => Set<UserRole>();


    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<User>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Email).HasMaxLength(256).IsRequired();
            e.HasIndex(x => x.Email).IsUnique();
            e.Property(x => x.FullName).HasMaxLength(200).IsRequired();
            e.Property(x => x.PasswordHash).IsRequired();
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
        });
        b.Entity<Role>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Code).HasMaxLength(50).IsRequired();
            e.HasIndex(x => x.Code).IsUnique();
            e.Property(x => x.Name).HasMaxLength(100).IsRequired();
        });
        b.Entity<UserRole>(e =>
        {
            e.HasKey(x => new { x.UserId, x.RoleId });
            e.HasOne(x => x.User).WithMany(x => x.UserRoles).HasForeignKey(x => x.UserId);
            e.HasOne(x => x.Role).WithMany(x => x.UserRoles).HasForeignKey(x => x.RoleId);
        });
    }
}
~~~

### TeamDbContext.cs

Cấu trúc persistence của dữ liệu ghép nhóm.

[src/TeamService/Data/TeamDbContext.cs dòng 1–45](../../src/TeamService/Data/TeamDbContext.cs#L1-L45)

~~~csharp
using Exe.TeamService.Domain;
using Microsoft.EntityFrameworkCore;

namespace Exe.TeamService.Data;

public class TeamDbContext(DbContextOptions<TeamDbContext> options) : DbContext(options)
{
    public DbSet<Semester> Semesters => Set<Semester>();
    public DbSet<Subject> Subjects => Set<Subject>();
    public DbSet<Major> Majors => Set<Major>();
    public DbSet<TeamRole> TeamRoles => Set<TeamRole>();
    public DbSet<StudentTeamRole> StudentTeamRoles => Set<StudentTeamRole>();
    public DbSet<RoomNeededRole> RoomNeededRoles => Set<RoomNeededRole>();
    public DbSet<Student> Students => Set<Student>();
    public DbSet<GroupType> GroupTypes => Set<GroupType>();
    public DbSet<GroupTypeMajor> GroupTypeMajors => Set<GroupTypeMajor>();
    public DbSet<Course> Courses => Set<Course>();
    public DbSet<StudentInCourse> StudentInCourses => Set<StudentInCourse>();
    public DbSet<Room> Rooms => Set<Room>();
    public DbSet<StudentInRoom> StudentInRooms => Set<StudentInRoom>();
    public DbSet<RoomApply> RoomApplies => Set<RoomApply>();
    public DbSet<Group> Groups => Set<Group>();
    public DbSet<StudentInGroup> StudentInGroups => Set<StudentInGroup>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Semester>(e => { e.Property(x => x.Code).HasMaxLength(20); e.Property(x => x.Name).HasMaxLength(100); e.HasIndex(x => x.Code).IsUnique(); });
        b.Entity<Subject>(e => { e.Property(x => x.Code).HasMaxLength(20); e.Property(x => x.Name).HasMaxLength(200); e.HasIndex(x => x.Code).IsUnique(); });
        b.Entity<Major>(e => { e.Property(x => x.Code).HasMaxLength(20); e.Property(x => x.Name).HasMaxLength(100); e.HasIndex(x => x.Code).IsUnique(); });
        b.Entity<TeamRole>(e => { e.Property(x => x.Code).HasMaxLength(20); e.Property(x => x.Name).HasMaxLength(100); e.HasIndex(x => x.Code).IsUnique(); });
        b.Entity<StudentTeamRole>().HasKey(x => new { x.StudentId, x.TeamRoleId });
        b.Entity<RoomNeededRole>().HasKey(x => new { x.RoomId, x.TeamRoleId });
        b.Entity<Student>(e => { e.Property(x => x.Gpa).HasPrecision(3, 2); e.Property(x => x.StudentCode).HasMaxLength(20); e.Property(x => x.FullName).HasMaxLength(200); e.Property(x => x.Email).HasMaxLength(256); e.HasIndex(x => x.UserId).IsUnique(); e.HasIndex(x => x.StudentCode).IsUnique(); });
        b.Entity<GroupType>().Property(x => x.Name).HasMaxLength(100);
        b.Entity<GroupTypeMajor>().HasKey(x => new { x.GroupTypeId, x.MajorId });
        b.Entity<Course>(e => { e.Property(x => x.Code).HasMaxLength(50); e.Property(x => x.Status).HasConversion<string>().HasMaxLength(20); e.Property(x => x.RoomSequence).IsConcurrencyToken(); e.HasIndex(x => x.Code).IsUnique(); e.HasIndex(x => new { x.SemesterId, x.SubjectId }).IsUnique(); });
        b.Entity<StudentInCourse>().HasKey(x => new { x.CourseId, x.StudentId });
        b.Entity<Room>(e => { e.Property(x => x.Name).HasMaxLength(100); e.Property(x => x.ProjectName).HasMaxLength(200); e.Property(x => x.IdeaDescription).HasMaxLength(1000); e.Property(x => x.RequiredGpa).HasPrecision(3, 2); e.Property(x => x.TargetGrade).HasPrecision(4, 2); e.Property(x => x.Code).HasMaxLength(60); e.Property(x => x.Status).HasConversion<string>().HasMaxLength(20); e.Property(x => x.Version).IsConcurrencyToken(); e.HasIndex(x => x.Code).IsUnique(); });
        b.Entity<StudentInRoom>(e => { e.HasKey(x => new { x.RoomId, x.StudentId }); e.HasIndex(x => new { x.CourseId, x.StudentId }).IsUnique(); });
        b.Entity<RoomApply>(e => { e.Property(x => x.Message).HasMaxLength(500); e.Property(x => x.Status).HasConversion<string>().HasMaxLength(20); e.HasIndex(x => new { x.RoomId, x.StudentId }).IsUnique().HasFilter("[Status] = 'Pending'"); e.HasOne(x => x.Decider).WithMany().HasForeignKey(x => x.DecidedBy); });
        b.Entity<Group>(e => { e.Property(x => x.Code).HasMaxLength(60); e.Property(x => x.Name).HasMaxLength(200); e.HasIndex(x => x.Code).IsUnique(); e.HasIndex(x => x.RoomId).IsUnique(); });
        b.Entity<StudentInGroup>().HasKey(x => new { x.GroupId, x.StudentId });
        foreach (var fk in b.Model.GetEntityTypes().SelectMany(x => x.GetForeignKeys())) fk.DeleteBehavior = DeleteBehavior.Restrict;
    }
}
~~~

### Entities.cs

Các entity liên quan nhau qua khóa ngoại hoặc thực thể nối.

[src/TeamService/Domain/Entities.cs dòng 1–21](../../src/TeamService/Domain/Entities.cs#L1-L21)

~~~csharp
namespace Exe.TeamService.Domain;

public enum CourseStatus { Planned, Forming, Closed }
public enum RoomStatus { Open, Locked, Completed, Cancelled }
public enum ApplyStatus { Pending, Approved, Rejected, Cancelled }
public class Semester { public Guid Id { get; set; } = Guid.NewGuid(); public string Code { get; set; } = ""; public string Name { get; set; } = ""; public DateTime StartDate { get; set; } public DateTime EndDate { get; set; } }
public class Subject { public Guid Id { get; set; } = Guid.NewGuid(); public string Code { get; set; } = ""; public string Name { get; set; } = ""; }
public class Major { public Guid Id { get; set; } = Guid.NewGuid(); public string Code { get; set; } = ""; public string Name { get; set; } = ""; }
public class TeamRole { public Guid Id { get; set; } = Guid.NewGuid(); public string Code { get; set; } = ""; public string Name { get; set; } = ""; }
public class StudentTeamRole { public Guid StudentId { get; set; } public Student Student { get; set; } = null!; public Guid TeamRoleId { get; set; } public TeamRole TeamRole { get; set; } = null!; }
public class RoomNeededRole { public Guid RoomId { get; set; } public Room Room { get; set; } = null!; public Guid TeamRoleId { get; set; } public TeamRole TeamRole { get; set; } = null!; }
public class Student { public Guid Id { get; set; } = Guid.NewGuid(); public Guid UserId { get; set; } public string StudentCode { get; set; } = ""; public string FullName { get; set; } = ""; public string Email { get; set; } = ""; public Guid MajorId { get; set; } public Major Major { get; set; } = null!; public decimal? Gpa { get; set; } public ICollection<StudentTeamRole> Roles { get; set; } = new List<StudentTeamRole>(); }
public class GroupType { public Guid Id { get; set; } = Guid.NewGuid(); public string Name { get; set; } = ""; public int MinMemberCount { get; set; } public int MaxMemberCount { get; set; } public int MinMajorCount { get; set; } public ICollection<GroupTypeMajor> Majors { get; set; } = new List<GroupTypeMajor>(); }
public class GroupTypeMajor { public Guid GroupTypeId { get; set; } public GroupType GroupType { get; set; } = null!; public Guid MajorId { get; set; } public Major Major { get; set; } = null!; public int MinQuantity { get; set; } public int MaxQuantity { get; set; } }
public class Course { public Guid Id { get; set; } = Guid.NewGuid(); public string Code { get; set; } = ""; public Guid SemesterId { get; set; } public Semester Semester { get; set; } = null!; public Guid SubjectId { get; set; } public Subject Subject { get; set; } = null!; public Guid GroupTypeId { get; set; } public GroupType GroupType { get; set; } = null!; public CourseStatus Status { get; set; } public DateTime StartTime { get; set; } public DateTime Deadline { get; set; } public int RoomSequence { get; set; } }
public class StudentInCourse { public Guid CourseId { get; set; } public Course Course { get; set; } = null!; public Guid StudentId { get; set; } public Student Student { get; set; } = null!; public DateTime EnrolledAt { get; set; } }
public class Room { public Guid Id { get; set; } = Guid.NewGuid(); public Guid CourseId { get; set; } public Course Course { get; set; } = null!; public string Code { get; set; } = ""; public Guid LeaderId { get; set; } public Student Leader { get; set; } = null!; public RoomStatus Status { get; set; } public int MemberCount { get; set; } public int Version { get; set; } public DateTime CreatedAt { get; set; } public ICollection<StudentInRoom> Members { get; set; } = new List<StudentInRoom>(); public string? Name { get; set; } public string? ProjectName { get; set; } public string? IdeaDescription { get; set; } public decimal? RequiredGpa { get; set; } public decimal? TargetGrade { get; set; } public ICollection<RoomNeededRole> NeededRoles { get; set; } = new List<RoomNeededRole>(); }
public class StudentInRoom { public Guid RoomId { get; set; } public Room Room { get; set; } = null!; public Guid StudentId { get; set; } public Student Student { get; set; } = null!; public Guid CourseId { get; set; } public Course Course { get; set; } = null!; public DateTime JoinedAt { get; set; } }
public class RoomApply { public Guid Id { get; set; } = Guid.NewGuid(); public Guid RoomId { get; set; } public Room Room { get; set; } = null!; public Guid StudentId { get; set; } public Student Student { get; set; } = null!; public string Message { get; set; } = ""; public ApplyStatus Status { get; set; } public Guid? DecidedBy { get; set; } public Student? Decider { get; set; } public DateTime? DecidedAt { get; set; } public DateTime CreatedAt { get; set; } }
public class Group { public Guid Id { get; set; } = Guid.NewGuid(); public Guid CourseId { get; set; } public Course Course { get; set; } = null!; public Guid RoomId { get; set; } public Room Room { get; set; } = null!; public Guid GroupTypeId { get; set; } public GroupType GroupType { get; set; } = null!; public string Code { get; set; } = ""; public string Name { get; set; } = ""; public DateTime CreatedAt { get; set; } public ICollection<StudentInGroup> Members { get; set; } = new List<StudentInGroup>(); }
public class StudentInGroup { public Guid GroupId { get; set; } public Group Group { get; set; } = null!; public Guid StudentId { get; set; } public Student Student { get; set; } = null!; public bool IsLeader { get; set; } }
~~~
