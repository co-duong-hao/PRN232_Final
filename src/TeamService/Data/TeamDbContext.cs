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
        b.Entity<RoomApply>(e =>
        {
            e.Property(x => x.Message).HasMaxLength(500);
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(20).IsConcurrencyToken();
            e.HasIndex(x => new { x.RoomId, x.StudentId }).IsUnique().HasFilter("[Status] = 'Pending'");
            e.HasOne(x => x.Decider).WithMany().HasForeignKey(x => x.DecidedBy);
        });
        b.Entity<Group>(e => { e.Property(x => x.Code).HasMaxLength(60); e.Property(x => x.Name).HasMaxLength(200); e.HasIndex(x => x.Code).IsUnique(); e.HasIndex(x => x.RoomId).IsUnique(); });
        b.Entity<StudentInGroup>().HasKey(x => new { x.GroupId, x.StudentId });
        foreach (var fk in b.Model.GetEntityTypes().SelectMany(x => x.GetForeignKeys())) fk.DeleteBehavior = DeleteBehavior.Restrict;
    }
}
