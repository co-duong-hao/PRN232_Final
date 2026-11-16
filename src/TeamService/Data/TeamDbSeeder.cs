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
