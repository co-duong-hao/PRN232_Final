using Exe.Contracts;
using Exe.Shared.Web.Errors;
using Exe.TeamService.Dtos;
using Exe.TeamService.Services;

namespace Exe.TeamService.Tests;

public sealed class RoomDiscoveryWorkflowTests : WorkflowFixture
{
    [Theory]
    [InlineData(1, 1)]
    [InlineData(2, 0)]
    public async Task CombinedFiltersApplyBeforePagination(int page, int roomIndex)
    {
        var rooms = await PrepareRooms();
        var query = new RoomListQuery { Q = "Campus", RoleIds = [Role("BE")], Gpa = 3.20m, Status = "OPEN",
            SortBy = "targetGrade", SortDir = "desc", Page = page, PageSize = 1 };

        var result = await Read.RoomsAsync(FirstCourse, query, Ct);

        Assert.Equal(2, result.TotalItems);
        Assert.Equal(2, result.TotalPages);
        Assert.Equal(page, result.Page);
        var choice = Assert.Single(result.Items);
        Assert.Equal(rooms[roomIndex].Id, choice.Id);
        Assert.Equal("BE", Assert.Single(choice.NeededRoles).Code);
        Assert.Contains("Campus", choice.ProjectName!);
    }

    [Fact]
    public async Task GpaThresholdIncludesExactMatchAndRoomsWithoutRequirement()
    {
        var rooms = await PrepareRooms();

        var result = await Read.RoomsAsync(FirstCourse, new RoomListQuery { Gpa = 3.20m, SortBy = "requiredGpa" }, Ct);

        Assert.Equal(new[] { rooms[0].Id, rooms[1].Id }, result.Items.Select(x => x.Id));
        Assert.Null(result.Items[0].RequiredGpa);
        Assert.Equal(3.20m, result.Items[1].RequiredGpa);
    }

    [Fact]
    public async Task RoleFilterMatchesAnyRequestedRole()
    {
        var rooms = await PrepareRooms();

        var result = await Read.RoomsAsync(FirstCourse,
            new RoomListQuery { RoleIds = [Role("BE"), Role("MKT"), Guid.NewGuid()] }, Ct);

        Assert.Equal(new[] { rooms[0].Id, rooms[1].Id, rooms[2].Id }, result.Items.Select(x => x.Id));
        Assert.DoesNotContain(result.Items, x => x.Id == rooms[3].Id);
    }

    [Theory]
    [InlineData("Campus", "0,1")]
    [InlineData("Green", "0")]
    [InlineData("Science", "2")]
    [InlineData("Design", "3")]
    public async Task RoomSearchMatchesProjectNameAndRoomNameIndependently(string query, string expectedIndices)
    {
        var rooms = await PrepareRooms();

        var result = await Read.RoomsAsync(FirstCourse, new RoomListQuery { Q = query }, Ct);

        Assert.Equal(expectedIndices.Split(',').Select(idx => rooms[int.Parse(idx)].Id), result.Items.Select(x => x.Id));
    }

    [Fact]
    public async Task RoomSearchCanAddressGeneratedRoomCode()
    {
        var rooms = await PrepareRooms();

        var result = await Read.RoomsAsync(FirstCourse, new RoomListQuery { Q = rooms[2].Code }, Ct);

        var match = Assert.Single(result.Items);
        Assert.Equal(rooms[2].Id, match.Id);
        Assert.Equal(rooms[2].Code, match.Code);
    }

    [Fact]
    public async Task PaginatesWithNoResultsWhenPastLastPage()
    {
        await PrepareRooms();

        var result = await Read.RoomsAsync(FirstCourse, new RoomListQuery { Page = 3, PageSize = 2 }, Ct);

        Assert.Equal(4, result.TotalItems);
        Assert.Equal(2, result.TotalPages);
        Assert.Equal(3, result.Page);
        Assert.Empty(result.Items);
    }

    [Theory]
    [InlineData(Roles.Student, false)]
    [InlineData(Roles.Lecturer, false)]
    [InlineData(Roles.Admin, true)]
    public async Task StudentsAndStaffSeeCancelledRoomsAccordingToRole(string role, bool visible)
    {
        var room = await MakeRoom();
        await Rooms.LeaveAsync(room.Id, Ct);

        AsRole(role);
        var result = await Read.RoomsAsync(FirstCourse, new RoomListQuery { Status = "Cancelled" }, Ct);

        Assert.Equal(visible ? 1 : 0, result.TotalItems);
        if (visible)
        {
            var cancelled = Assert.Single(result.Items);
            Assert.Equal(room.Id, cancelled.Id);
            Assert.Equal(0, cancelled.MemberCount);
            Assert.Empty(cancelled.Majors);
        }
    }

    [Fact]
    public async Task NonEnrolledUserCannotListOrReadAnotherCourseRooms()
    {
        var room = await MakeRoom(course: SecondCourse);
        await Courses.RemoveStudentAsync(SecondCourse, Student(8), Ct);
        AsStudent(8);

        var listError = await Assert.ThrowsAsync<ForbiddenException>(() => Read.RoomsAsync(SecondCourse, new RoomListQuery(), Ct));
        var detailError = await Assert.ThrowsAsync<ForbiddenException>(() => Rooms.GetAsync(room.Id, Ct));

        Assert.Equal("BR02", listError.Code);
        Assert.Equal("BR02", detailError.Code);
        AsRole(Roles.Lecturer);
        Assert.Equal(room.Id, Assert.Single((await Read.RoomsAsync(SecondCourse, new RoomListQuery(), Ct)).Items).Id);
    }

    [Fact]
    public async Task MemberCountOrderingMatchesProjectedMajorCounts()
    {
        var first = await MakeRoom();
        var second = await MakeLocked(3, 4, 7);
        var third = await MakeRoom(8);
        await Join(third, 11);

        var result = await Read.RoomsAsync(FirstCourse, new RoomListQuery { SortBy = "membercount", SortDir = "desc" }, Ct);

        Assert.Equal(new[] { second.Id, third.Id, first.Id }, result.Items.Select(x => x.Id));
        var summary = result.Items[0];
        Assert.Equal(3, summary.MemberCount);
        Assert.Equal(2, Assert.Single(summary.Majors, x => x.MajorCode == "SE").Count);
        Assert.Equal(1, Assert.Single(summary.Majors, x => x.MajorCode == "AI").Count);
    }

    private async Task<RoomDto[]> PrepareRooms()
    {
        var first = await MakeRoom(1, profile: new RoomProfileRequest("Green", "Campus Watch", "Theo dõi", null, 6m, [Role("BE")]));
        var second = await MakeRoom(2, profile: new RoomProfileRequest("Energy", "Campus Energy", null, 3.20m, 9m, [Role("BE")]));
        var third = await MakeRoom(3, profile: new RoomProfileRequest("Science", "Data Lab", null, 3.21m, 8m, [Role("MKT")]));
        var fourth = await MakeRoom(4, profile: new RoomProfileRequest("Design", null, null, 3.90m, 7m, [Role("UIUX")]));
        return [first, second, third, fourth];
    }
}
