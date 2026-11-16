using Exe.Contracts;
using Exe.Shared.Web.Errors;
using Exe.TeamService.Dtos;
using Microsoft.EntityFrameworkCore;

namespace Exe.TeamService.Tests;

public sealed class StudentRecruitmentProfileTests : WorkflowFixture
{
    [Theory]
    [InlineData(null)]
    [InlineData("0")]
    [InlineData("0.01")]
    [InlineData("2.85")]
    [InlineData("3.99")]
    [InlineData("4")]
    public async Task StoresGpaAtSupportedBoundaries(string? gpaText)
    {
        var gpa = gpaText is null ? (decimal?)null : decimal.Parse(gpaText, System.Globalization.CultureInfo.InvariantCulture);
        var updated = await Rooms.UpdateStudentProfileAsync(new StudentProfileRequest(gpa, [Role("BE")]), Ct);

        Assert.Equal(Student(1), updated.Id);
        Assert.Equal(gpa, updated.Gpa);
        Assert.Equal("BE", Assert.Single(updated.Roles).Code);

        await using var reader = NewReader();
        var stored = await reader.Students.SingleAsync(x => x.Id == Student(1), Ct);
        Assert.Equal(gpa, stored.Gpa);
    }

    [Theory]
    [InlineData("-0.01")]
    [InlineData("4.01")]
    [InlineData("3.141")]
    [InlineData("0.001")]
    [InlineData("3.999")]
    public async Task InvalidGpaLeavesExistingProfileUntouched(string gpaText)
    {
        var gpa = decimal.Parse(gpaText, System.Globalization.CultureInfo.InvariantCulture);
        var before = await References.StudentAsync(Student(1), Ct);

        await Assert.ThrowsAsync<BadRequestException>(() =>
            Rooms.UpdateStudentProfileAsync(new StudentProfileRequest(gpa, [Role("MOBILE")]), Ct));

        await using var reader = NewReader();
        var stored = await reader.Students.Include(x => x.Roles).SingleAsync(x => x.Id == before.Id, Ct);
        Assert.Equal(before.Gpa, stored.Gpa);
        Assert.Equal(before.Roles.Select(x => x.Id).Order(), stored.Roles.Select(x => x.TeamRoleId).Order());
    }

    [Theory]
    [InlineData("empty")]
    [InlineData("duplicate")]
    [InlineData("too-many")]
    [InlineData("unknown")]
    [InlineData("null")]
    public async Task InvalidRoleSelectionLeavesOriginalGpaAndRoles(string selection)
    {
        var existing = Role("FE");
        Guid[] roles = selection switch
        {
            "empty" => [],
            "duplicate" => [existing, existing],
            "too-many" => [existing, Role("BE"), Role("BA"), Role("MKT")],
            "unknown" => [existing, Guid.NewGuid()],
            _ => null!,
        };
        var before = await References.StudentAsync(Student(1), Ct);

        await Assert.ThrowsAsync<BadRequestException>(() =>
            Rooms.UpdateStudentProfileAsync(new StudentProfileRequest(1.45m, roles), Ct));

        await using var reader = NewReader();
        var stored = await reader.Students.Include(x => x.Roles).SingleAsync(x => x.Id == before.Id, Ct);
        Assert.Equal(before.Gpa, stored.Gpa);
        Assert.Equal(before.Roles.Select(x => x.Id).Order(), stored.Roles.Select(x => x.TeamRoleId).Order());
        Assert.Empty(Events);
    }

    [Fact]
    public async Task EditingRoleSelectionRetainsOverlapAndRemovesObsoleteRoles()
    {
        var first = await Rooms.UpdateStudentProfileAsync(
            new StudentProfileRequest(3.30m, [Role("BE"), Role("FE")]), Ct);
        Assert.Equal(2, first.Roles.Count);

        var second = await Rooms.UpdateStudentProfileAsync(
            new StudentProfileRequest(3.50m, [Role("FE"), Role("BA"), Role("UIUX")]), Ct);

        await using var reader = NewReader();
        var stored = await reader.Students.Include(x => x.Roles).ThenInclude(x => x.TeamRole)
            .SingleAsync(x => x.Id == second.Id, Ct);
        Assert.Equal(3.50m, stored.Gpa);
        Assert.Equal(new[] { "BA", "FE", "UIUX" }, stored.Roles.Select(x => x.TeamRole.Code).Order());
        Assert.Equal(stored.Roles.Select(x => x.TeamRoleId).Order(), second.Roles.Select(x => x.Id).Order());
    }

    [Fact]
    public async Task UpdateAppliesOnlyToCurrentStudent()
    {
        var other = await References.StudentAsync(Student(1), Ct);
        AsStudent(2);

        var changed = await Rooms.UpdateStudentProfileAsync(
            new StudentProfileRequest(4m, [Role("BA"), Role("BE")]), Ct);

        await using var reader = NewReader();
        var untouched = await reader.Students.Include(x => x.Roles).SingleAsync(x => x.Id == other.Id, Ct);
        Assert.Equal(Student(2), changed.Id);
        Assert.Equal(other.Gpa, untouched.Gpa);
        Assert.Equal(other.Roles.Select(x => x.Id).Order(), untouched.Roles.Select(x => x.TeamRoleId).Order());
    }

    [Fact]
    public async Task RepeatedSubmissionWithDifferentRoleOrderKeepsSingleLinkPerRole()
    {
        await Rooms.UpdateStudentProfileAsync(new StudentProfileRequest(3m, [Role("BE"), Role("FE")]), Ct);

        var repeated = await Rooms.UpdateStudentProfileAsync(new StudentProfileRequest(3m, [Role("FE"), Role("BE")]), Ct);

        await using var reader = NewReader();
        var stored = await reader.StudentTeamRoles.Where(x => x.StudentId == repeated.Id).ToListAsync(Ct);
        Assert.Equal(2, stored.Count);
        Assert.Equal(stored.Select(x => x.TeamRoleId).Order(), repeated.Roles.Select(x => x.Id).Order());
    }

    [Fact]
    public async Task AccountWithoutStudentRecordCannotUpdate()
    {
        AsStudent(99);

        var error = await Assert.ThrowsAsync<ForbiddenException>(() =>
            Rooms.UpdateStudentProfileAsync(new StudentProfileRequest(3m, [Role("BE")]), Ct));

        Assert.Equal("NOT_A_STUDENT", error.Code);
        Assert.Empty(Events);
    }

    [Fact]
    public async Task EditedStudentProfileAppearsInRoomMemberProjection()
    {
        await Rooms.UpdateStudentProfileAsync(new StudentProfileRequest(3.75m, [Role("BA"), Role("UIUX")]), Ct);
        var room = await MakeRoom();

        var detail = await Rooms.GetAsync(room.Id, Ct);

        var member = Assert.Single(detail.Members);
        Assert.Equal(Student(1), member.StudentId);
        Assert.Equal(3.75m, member.Gpa);
        Assert.Equal(new[] { "BA", "UIUX" }, member.Roles.Select(x => x.Code).Order());
        Assert.True(member.IsLeader);
    }
}
