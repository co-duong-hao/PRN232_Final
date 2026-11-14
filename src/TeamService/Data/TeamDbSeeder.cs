using Exe.TeamService.Domain;
using Microsoft.EntityFrameworkCore;

namespace Exe.TeamService.Data;

public static class TeamDbSeeder
{
    public static async Task SeedAsync(TeamDbContext db, CancellationToken ct = default)
    {
        if (await db.Semesters.AnyAsync(ct)) return;
        var semester = new Semester { Code = "FA26", Name = "Fall 2026", StartDate = new DateTime(2026, 9, 7, 0, 0, 0, DateTimeKind.Utc), EndDate = new DateTime(2026, 12, 27, 0, 0, 0, DateTimeKind.Utc) };
        var subjects = new[] { new Subject { Code = "EXE101", Name = "Trải nghiệm khởi nghiệp 1" }, new Subject { Code = "EXE201", Name = "Trải nghiệm khởi nghiệp 2" } };
        var majors = new[] { new Major { Code = "SE", Name = "Kỹ thuật phần mềm" }, new Major { Code = "AI", Name = "Trí tuệ nhân tạo" }, new Major { Code = "GD", Name = "Thiết kế đồ họa" }, new Major { Code = "MKT", Name = "Marketing" } };
        var type = new GroupType { Name = "Nhóm EXE chuẩn", MinMemberCount = 4, MaxMemberCount = 6, MinMajorCount = 3 };
        type.Majors.Add(new GroupTypeMajor { Major = majors[0], MinQuantity = 2, MaxQuantity = 3 });
        var students = Enumerable.Range(1, 12).Select(i => {
            var major = majors[i <= 5 ? 0 : i <= 7 ? 1 : i <= 10 ? 2 : 3];
            return new Student { Id = Guid.Parse($"20000000-0000-0000-0000-{i:000000000000}"), UserId = Guid.Parse($"10000000-0000-0000-0000-{i:000000000000}"), StudentCode = $"{(i > 10 ? "MK" : major.Code)}1800{i:00}", FullName = $"Sinh viên {i:00}", Email = $"student{i:00}@exe.local", Major = major };
        }).ToArray();
        var courses = subjects.Select((s, i) => new Course { Id = i == 0 ? Guid.Parse("30000000-0000-0000-0000-000000000001") : Guid.NewGuid(), Code = $"FA26-{s.Code}", Semester = semester, Subject = s, GroupType = type, Status = i == 0 ? CourseStatus.Forming : CourseStatus.Planned, StartTime = new DateTime(2026, 11, 1, 0, 0, 0, DateTimeKind.Utc), Deadline = new DateTime(2026, 12, 15, 0, 0, 0, DateTimeKind.Utc) }).ToArray();
        db.AddRange(courses); db.AddRange(students);
        db.StudentInCourses.AddRange(students.Select(s => new StudentInCourse { Course = courses[0], Student = s, EnrolledAt = DateTime.UtcNow }));
        await db.SaveChangesAsync(ct);
    }
}
