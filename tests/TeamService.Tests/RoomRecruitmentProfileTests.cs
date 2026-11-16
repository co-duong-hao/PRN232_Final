using Exe.Contracts;
using Exe.Shared.Web.Errors;
using Exe.TeamService.Domain;
using Exe.TeamService.Dtos;
using Microsoft.EntityFrameworkCore;

namespace Exe.TeamService.Tests;

public sealed class RoomRecruitmentProfileTests : WorkflowFixture
{
    [Fact]
    public async Task EachTextFieldAcceptsItsExactLimit()
    {
        var details = new RoomProfileRequest(new string('N', 100), new string('P', 200),
            new string('D', 1000), 4m, 10m, [Role("BE"), Role("UIUX")]);

        var room = await MakeRoom(profile: details);

        Assert.Equal(details.Name, room.Name);
        Assert.Equal(details.ProjectName, room.ProjectName);
        Assert.Equal(details.IdeaDescription, room.IdeaDescription);
        Assert.Equal(4m, room.RequiredGpa);
        Assert.Equal(10m, room.TargetGrade);
        Assert.Equal(new[] { "BE", "UIUX" }, room.NeededRoles.Select(x => x.Code).Order());
    }

    [Theory]
    [InlineData("name")]
    [InlineData("project")]
    [InlineData("description")]
    [InlineData("gpa-high")]
    [InlineData("gpa-low")]
    [InlineData("gpa-scale")]
    [InlineData("grade-high")]
    [InlineData("grade-low")]
    [InlineData("duplicate")]
    [InlineData("too-many")]
    [InlineData("unknown")]
    public async Task BadProfileCreationDoesNotReserveMembershipOrPublish(string invalid)
    {
        var good = new RoomProfileRequest("Tuyển thành viên", "Project", "Idea", 3m, 8m, [Role("FE")]);
        var bad = invalid switch
        {
            "name" => good with { Name = new string('N', 101) },
            "project" => good with { ProjectName = new string('P', 201) },
            "description" => good with { IdeaDescription = new string('D', 1001) },
            "gpa-high" => good with { RequiredGpa = 4.01m },
            "gpa-low" => good with { RequiredGpa = -0.01m },
            "gpa-scale" => good with { RequiredGpa = 3.141m },
            "grade-high" => good with { TargetGrade = 10.01m },
            "grade-low" => good with { TargetGrade = -0.01m },
            "duplicate" => good with { NeededRoleIds = [Role("FE"), Role("FE")] },
            "too-many" => good with { NeededRoleIds = [Role("FE"), Role("BE"), Role("BA"), Role("MKT"), Role("BIZ"), Role("UIUX")] },
            _ => good with { NeededRoleIds = [Guid.NewGuid()] },
        };

        await Assert.ThrowsAsync<BadRequestException>(() => MakeRoom(profile: bad));

        Assert.Empty(Events);
        await using var reader = NewReader();
        Assert.False(await reader.Rooms.AnyAsync(Ct));
        Assert.False(await reader.StudentInRooms.AnyAsync(Ct));
        var created = await MakeRoom(profile: good);
        Assert.Equal(good.Name, created.Name);
    }

    [Fact]
    public async Task UpdateRetainsUnchangedRoleAndReplacesObsoleteRole()
    {
        var room = await MakeRoom(profile: new RoomProfileRequest("Ban đầu", null, null, 0m, 0m, [Role("BE"), Role("FE")]));
        var changed = new RoomProfileRequest("Sau khi sửa", "Tái chế", "Theo dõi rác thải", 2.15m, 8.75m,
            [Role("BE"), Role("BA"), Role("MOBILE")]);

        var result = await Rooms.UpdateProfileAsync(room.Id, changed, Ct);

        await using var reader = NewReader();
        var stored = await reader.Rooms.Include(x => x.NeededRoles).SingleAsync(x => x.Id == room.Id, Ct);
        Assert.Equal(changed.Name, stored.Name);
        Assert.Equal(changed.ProjectName, stored.ProjectName);
        Assert.Equal(changed.IdeaDescription, stored.IdeaDescription);
        Assert.Equal(changed.RequiredGpa, stored.RequiredGpa);
        Assert.Equal(changed.TargetGrade, stored.TargetGrade);
        Assert.Equal(changed.NeededRoleIds!.Order(), stored.NeededRoles.Select(x => x.TeamRoleId).Order());
        Assert.Equal(stored.NeededRoles.Select(x => x.TeamRoleId).Order(), result.NeededRoles.Select(x => x.Id).Order());
        Assert.Equal(room.LeaderId, result.LeaderId);
        Assert.Equal(room.MemberCount, result.MemberCount);
    }

    [Fact]
    public async Task LeaderCanClearEveryFieldAndNeededRole()
    {
        var room = await MakeRoom(profile: new RoomProfileRequest("Nhóm", "Dự án", "Ý tưởng", 3m, 8m, [Role("BE")]));

        var result = await Rooms.UpdateProfileAsync(room.Id, new RoomProfileRequest(null, null, null, null, null, null), Ct);

        await using var reader = NewReader();
        var stored = await reader.Rooms.SingleAsync(x => x.Id == room.Id, Ct);
        Assert.Null(stored.Name);
        Assert.Null(stored.ProjectName);
        Assert.Null(stored.IdeaDescription);
        Assert.Null(stored.RequiredGpa);
        Assert.Null(stored.TargetGrade);
        Assert.Empty(result.NeededRoles);
        Assert.False(await reader.RoomNeededRoles.AnyAsync(x => x.RoomId == room.Id, Ct));
    }

    [Fact]
    public async Task InvalidUpdateRetainsExistingValuesAndRoles()
    {
        var room = await MakeRoom(profile: new RoomProfileRequest("Tên gốc", "Dự án gốc", null, 2m, 7m, [Role("BE")]));
        var badEdit = new RoomProfileRequest("Tên sửa", "Dự án sửa", null, 3m, 8m, [Role("FE"), Guid.NewGuid()]);

        await Assert.ThrowsAsync<BadRequestException>(() => Rooms.UpdateProfileAsync(room.Id, badEdit, Ct));

        var actual = await Rooms.GetAsync(room.Id, Ct);
        Assert.Equal(room.Name, actual.Name);
        Assert.Equal(room.ProjectName, actual.ProjectName);
        Assert.Equal(room.RequiredGpa, actual.RequiredGpa);
        Assert.Equal(room.TargetGrade, actual.TargetGrade);
        Assert.Equal("BE", Assert.Single(actual.NeededRoles).Code);
    }

    [Fact]
    public async Task LeaderCanEditWhileRoomIsLocked()
    {
        var room = await MakeLocked();
        AsStudent(1);
        Events.Clear();

        var result = await Rooms.UpdateProfileAsync(room.Id,
            new RoomProfileRequest("Cần thiết kế", null, null, null, null, [Role("UIUX")]), Ct);

        Assert.Equal("Locked", result.Status);
        Assert.Equal(3, result.MemberCount);
        Assert.Equal("UIUX", Assert.Single(result.NeededRoles).Code);
        Assert.Empty(Events);
    }

    [Fact]
    public async Task CancelledRoomCannotBeEdited()
    {
        var room = await MakeRoom();
        await Rooms.LeaveAsync(room.Id, Ct);
        var update = new RoomProfileRequest("Tên sửa", null, null, null, null, []);

        var error = await Assert.ThrowsAsync<BusinessRuleException>(() => Rooms.UpdateProfileAsync(room.Id, update, Ct));

        Assert.Equal("ROOM_NOT_ACTIVE", error.Code);
        await using var reader = NewReader();
        var stored = await reader.Rooms.SingleAsync(x => x.Id == room.Id, Ct);
        Assert.Equal(RoomStatus.Cancelled, stored.Status);
        Assert.Null(stored.Name);
    }

    [Fact]
    public async Task RoleRemovalDoesNotChangeStudentProfile()
    {
        var room = await MakeRoom(profile: new RoomProfileRequest("Tuyển FE", null, null, null, null, [Role("FE")]));
        var before = await References.StudentAsync(Student(1), Ct);

        await Rooms.UpdateProfileAsync(room.Id, new RoomProfileRequest("Tuyển BA", null, null, null, null, [Role("BA")]), Ct);

        var after = await References.StudentAsync(Student(1), Ct);
        Assert.Equal(before.Gpa, after.Gpa);
        Assert.Equal(before.Roles.Select(x => x.Id).Order(), after.Roles.Select(x => x.Id).Order());
        Assert.Contains(after.Roles, x => x.Code == "FE");
    }
}
