using Exe.TeamService.Data;
using Exe.TeamService.Domain;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Exe.TeamService.Tests;

public class TeamDbTests
{
    [Fact]
    public async Task Seed_EmptyDatabase_CreatesExpectedCoursesAndStudents()
    {
        await using var connection = new SqliteConnection("DataSource=:memory:");
        await connection.OpenAsync();
        await using var db = new TeamDbContext(new DbContextOptionsBuilder<TeamDbContext>().UseSqlite(connection).Options);
        await db.Database.EnsureCreatedAsync();
        await TeamDbSeeder.SeedAsync(db);
        await TeamDbSeeder.SeedAsync(db);
        Assert.Equal(12, await db.Students.CountAsync());
        Assert.Equal(24, await db.StudentInCourses.CountAsync());
        Assert.Equal(CourseStatus.Forming, (await db.Courses.SingleAsync(x => x.Code == "FA26-EXE101")).Status);
        Assert.Equal(CourseStatus.Forming, (await db.Courses.SingleAsync(x => x.Code == "FA26-EXE201")).Status);
        Assert.Equal(2, await db.Courses.CountAsync());
    }

    [Fact]
    public async Task StudentInRoom_DuplicateCourseAndStudent_IsRejected()
    {
        await using var connection = new SqliteConnection("DataSource=:memory:");
        await connection.OpenAsync();
        await using var db = new TeamDbContext(new DbContextOptionsBuilder<TeamDbContext>().UseSqlite(connection).Options);
        await db.Database.EnsureCreatedAsync();
        await TeamDbSeeder.SeedAsync(db);
        var course = await db.Courses.SingleAsync(x => x.Code == "FA26-EXE101");
        var student = await db.Students.FirstAsync();
        var room1 = new Room { CourseId = course.Id, Code = "R1", LeaderId = student.Id, CreatedAt = DateTime.UtcNow };
        var room2 = new Room { CourseId = course.Id, Code = "R2", LeaderId = student.Id, CreatedAt = DateTime.UtcNow };
        db.Rooms.AddRange(room1, room2);
        db.StudentInRooms.Add(new StudentInRoom { Room = room1, StudentId = student.Id, CourseId = course.Id });
        await db.SaveChangesAsync();
        db.StudentInRooms.Add(new StudentInRoom { Room = room2, StudentId = student.Id, CourseId = course.Id });
        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
    }
}
