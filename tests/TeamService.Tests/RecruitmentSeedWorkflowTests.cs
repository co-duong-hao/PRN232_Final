using Exe.Contracts;
using Exe.TeamService.Data;
using Exe.TeamService.Domain;
using Exe.TeamService.Dtos;
using Microsoft.EntityFrameworkCore;

namespace Exe.TeamService.Tests;

public sealed class RecruitmentSeedWorkflowTests : WorkflowFixture
{
    [Theory]
    [InlineData(1, "SE", "3.40", "BE,FE")]
    [InlineData(2, "SE", "3.10", "FE")]
    [InlineData(3, "SE", "2.80", "BE,MOBILE")]
    [InlineData(4, "SE", "3.60", "BA")]
    [InlineData(5, "SE", "2.20", "MOBILE")]
    [InlineData(6, "AI", "3.50", "BE")]
    [InlineData(7, "AI", "2.60", "BE")]
    [InlineData(8, "GD", "3.00", "UIUX")]
    [InlineData(9, "GD", "2.40", "UIUX,FE")]
    [InlineData(10, "GD", "3.20", "UIUX")]
    [InlineData(11, "MKT", "2.90", "MKT,BIZ")]
    [InlineData(12, "MKT", "3.30", "MKT")]
    public async Task EveryDemoAccountHasUniqueRecruitmentIdentityInBothCourses(int number, string expectedMajor, string gpa, string roleCodes)
    {
        var student = await References.StudentAsync(Student(number), Ct);

        Assert.Equal(Student(number), student.Id);
        Assert.Equal($"student{number:00}@exe.local", student.Email);
        Assert.Equal(expectedMajor, student.MajorCode);
        Assert.Equal(decimal.Parse(gpa, System.Globalization.CultureInfo.InvariantCulture), student.Gpa);
        Assert.Equal(roleCodes.Split(',').Order(), student.Roles.Select(r => r.Code).Order());

        await using var reader = NewReader();
        var courseIds = await reader.StudentInCourses.Where(x => x.StudentId == student.Id)
            .Select(x => x.CourseId).ToListAsync(Ct);
        Assert.Equal(new[] { FirstCourse, SecondCourse }.Order(), courseIds.Order());
    }

    [Fact]
    public async Task ReseedPreservesCatalogRoleKeysAndEnrollmentCounts()
    {
        var roles = await Db.TeamRoles.ToDictionaryAsync(x => x.Code, x => x.Id, Ct);

        await TeamDbSeeder.SeedAsync(Db, Ct);
        await TeamDbSeeder.SeedAsync(Db, Ct);

        await using var reader = NewReader();
        var persistedRoles = await reader.TeamRoles.ToDictionaryAsync(x => x.Code, x => x.Id, Ct);
        Assert.Equal(roles.OrderBy(x => x.Key), persistedRoles.OrderBy(x => x.Key));
        Assert.Equal(12, await reader.Students.CountAsync(Ct));
        Assert.Equal(24, await reader.StudentInCourses.CountAsync(Ct));
        Assert.Equal(2, await reader.Courses.CountAsync(Ct));
        Assert.False(await reader.Rooms.AnyAsync(Ct));
    }

    [Fact]
    public async Task ReseedKeepsEditedStudentGpaAndRoles()
    {
        var userEdit = new StudentProfileRequest(2.75m, [Role("MKT"), Role("BIZ")]);
        AsStudent(1);
        await Rooms.UpdateStudentProfileAsync(userEdit, Ct);

        await TeamDbSeeder.SeedAsync(Db, Ct);

        await using var reader = NewReader();
        var student = await reader.Students.Include(x => x.Roles).ThenInclude(x => x.TeamRole)
            .SingleAsync(x => x.Id == Student(1), Ct);
        Assert.Equal(2.75m, student.Gpa);
        Assert.Equal(new[] { "BIZ", "MKT" }, student.Roles.Select(x => x.TeamRole.Code).Order());
    }

    [Fact]
    public async Task ReseedAddsMissingCatalogRoleWithoutChangingRoomsOrStudents()
    {
        var unassigned = await Db.TeamRoles.SingleAsync(x => x.Code == "MOBILE", Ct);
        var assigned = await Db.StudentTeamRoles.Where(x => x.TeamRoleId == unassigned.Id).ToListAsync(Ct);
        Db.StudentTeamRoles.RemoveRange(assigned);
        Db.TeamRoles.Remove(unassigned);
        await Db.SaveChangesAsync(Ct);
        var room = await MakeRoom(profile: new RoomProfileRequest("Đã tạo trước", null, null, null, null, [Role("FE")]));

        await TeamDbSeeder.SeedAsync(Db, Ct);

        await using var reader = NewReader();
        var replacement = await reader.TeamRoles.SingleAsync(x => x.Code == "MOBILE", Ct);
        Assert.NotEqual(unassigned.Id, replacement.Id);
        Assert.Equal("Mobile", replacement.Name);
        Assert.Equal("Đã tạo trước", (await reader.Rooms.SingleAsync(x => x.Id == room.Id, Ct)).Name);
        Assert.Equal(12, await reader.Students.CountAsync(Ct));
        Assert.False(await reader.StudentTeamRoles.AnyAsync(x => x.TeamRoleId == replacement.Id, Ct));
    }

    [Fact]
    public async Task ReseedPreservesClosedCourseAndHistoricalMembership()
    {
        var room = await MakeLocked();
        var apply = await Send(room, 8);
        await Courses.TransitionAsync(FirstCourse, false, Ct);

        await TeamDbSeeder.SeedAsync(Db, Ct);

        await using var reader = NewReader();
        Assert.Equal(CourseStatus.Closed, await reader.Courses.Where(x => x.Id == FirstCourse).Select(x => x.Status).SingleAsync(Ct));
        Assert.Equal(3, await reader.StudentInRooms.CountAsync(x => x.RoomId == room.Id, Ct));
        Assert.Equal(ApplyStatus.Pending, await reader.RoomApplies.Where(x => x.Id == apply.Id).Select(x => x.Status).SingleAsync(Ct));
    }

    [Fact]
    public async Task RoomSequenceIsIndependentForEachSeededCourse()
    {
        var first = await MakeRoom();
        var second = await MakeRoom(course: SecondCourse);
        var next = await MakeRoom(2);

        Assert.Equal("FA26-EXE101-R001", first.Code);
        Assert.Equal("FA26-EXE201-R001", second.Code);
        Assert.Equal("FA26-EXE101-R002", next.Code);

        await using var reader = NewReader();
        Assert.Equal(2, await reader.Courses.Where(x => x.Id == FirstCourse).Select(x => x.RoomSequence).SingleAsync(Ct));
        Assert.Equal(1, await reader.Courses.Where(x => x.Id == SecondCourse).Select(x => x.RoomSequence).SingleAsync(Ct));
    }
}
