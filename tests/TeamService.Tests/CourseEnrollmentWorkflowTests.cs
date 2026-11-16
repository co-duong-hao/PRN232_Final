using Exe.Shared.Web.Errors;
using Exe.Shared.Web.Paging;
using Exe.TeamService.Dtos;
using Microsoft.EntityFrameworkCore;

namespace Exe.TeamService.Tests;

public sealed class CourseEnrollmentWorkflowTests : WorkflowFixture
{
    [Fact]
    public async Task EnrollDeduplicatesRequestsAndReportsSkippedInputs()
    {
        await Courses.RemoveStudentAsync(FirstCourse, Student(8), Ct);
        await Courses.RemoveStudentAsync(FirstCourse, Student(9), Ct);

        var result = await Courses.EnrollAsync(FirstCourse, [Student(8), Student(8), Student(9), Student(1)], Ct);

        Assert.Equal(2, result.Added);
        Assert.Equal(2, result.Skipped);
        await using var reader = NewReader();
        Assert.Equal(12, await reader.StudentInCourses.CountAsync(x => x.CourseId == FirstCourse, Ct));
        Assert.Equal(12, await reader.StudentInCourses.CountAsync(x => x.CourseId == SecondCourse, Ct));
        var repeated = await Courses.EnrollAsync(FirstCourse, [Student(8), Student(9), Student(8)], Ct);
        Assert.Equal(new EnrollmentResult(0, 3), repeated);
    }

    [Fact]
    public async Task UnknownStudentPreventsWholeBatchFromBeingEnrolled()
    {
        await Courses.RemoveStudentAsync(FirstCourse, Student(8), Ct);
        await Courses.RemoveStudentAsync(FirstCourse, Student(9), Ct);

        await Assert.ThrowsAsync<NotFoundException>(() =>
            Courses.EnrollAsync(FirstCourse, [Student(8), Student(99), Student(9)], Ct));

        await using var reader = NewReader();
        var remaining = await reader.StudentInCourses.Where(x => x.CourseId == FirstCourse).Select(x => x.StudentId).ToListAsync(Ct);
        Assert.Equal(10, remaining.Count);
        Assert.DoesNotContain(Student(8), remaining);
        Assert.DoesNotContain(Student(9), remaining);
    }

    [Fact]
    public async Task StudentInRoomCannotBeRemovedUntilMembershipEnds()
    {
        var room = await MakeRoom();
        await Join(room, 8);

        var error = await Assert.ThrowsAsync<BusinessRuleException>(() => Courses.RemoveStudentAsync(FirstCourse, Student(8), Ct));

        Assert.Equal("IN_USE", error.Code);
        Assert.Equal(12, (await Courses.StatsAsync(FirstCourse, Ct)).TotalStudents);
        await Rooms.LeaveAsync(room.Id, Ct);
        await Courses.RemoveStudentAsync(FirstCourse, Student(8), Ct);
        Assert.Equal(11, (await Courses.StatsAsync(FirstCourse, Ct)).TotalStudents);
        Assert.Equal(12, (await Courses.StatsAsync(SecondCourse, Ct)).TotalStudents);
    }

    [Fact]
    public async Task MyCourseListShowsEnrollmentAndRoomPerCourse()
    {
        var room = await MakeRoom(course: SecondCourse);

        var page = await Courses.MyCoursesAsync(new PageQuery { SortDir = "desc" }, Ct);

        Assert.Equal(2, page.TotalItems);
        Assert.Collection(page.Items,
            first =>
            {
                Assert.Equal(SecondCourse, first.Id);
                Assert.Equal(room.Id, first.MyRoom!.Id);
                Assert.Null(first.MyGroup);
            },
            second =>
            {
                Assert.Equal(FirstCourse, second.Id);
                Assert.Null(second.MyRoom);
                Assert.Null(second.MyGroup);
            });
    }

    [Fact]
    public async Task RosterFiltersMembershipAndMajorWithinRequestedCourse()
    {
        var room = await MakeRoom();
        await Join(room, 8);
        var major = (await References.StudentAsync(Student(8), Ct)).MajorId;

        var joined = await Courses.StudentsAsync(FirstCourse, new CourseStudentQuery { MajorId = major, HasRoom = true }, Ct);
        var available = await Courses.StudentsAsync(FirstCourse, new CourseStudentQuery { MajorId = major, HasRoom = false }, Ct);
        var another = await Courses.StudentsAsync(SecondCourse, new CourseStudentQuery { MajorId = major, HasRoom = true }, Ct);

        var current = Assert.Single(joined.Items);
        Assert.Equal(Student(8), current.Id);
        Assert.Equal(3m, current.Gpa);
        Assert.Equal("UIUX", Assert.Single(current.Roles).Code);
        Assert.Equal(new[] { Student(9), Student(10) }, available.Items.Select(x => x.Id));
        Assert.Empty(another.Items);
    }

    [Theory]
    [InlineData("@exe.local", 3, 2, 12, "9,8,7")]
    [InlineData("Sinh viên 0", 3, 3, 9, "3,2,1")]
    [InlineData("student01@", 2, 1, 1, "1")]
    [InlineData("SE1800", 2, 3, 5, "1")]
    [InlineData("unknown", 3, 1, 0, "")]
    public async Task RosterSearchSortsAndPagesAfterFiltering(string query, int size, int page, int total, string studentNumbers)
    {
        var result = await Courses.StudentsAsync(FirstCourse,
            new CourseStudentQuery { Q = query, PageSize = size, Page = page, SortBy = "fullName", SortDir = "desc" }, Ct);

        Assert.Equal(total, result.TotalItems);
        Assert.Equal(page, result.Page);
        Assert.Equal(size, result.PageSize);
        Assert.Equal(studentNumbers.Split(',', StringSplitOptions.RemoveEmptyEntries).Select(x => Student(int.Parse(x))),
            result.Items.Select(x => x.Id));
    }

    [Fact]
    public async Task UnenrolledStudentDoesNotSeeCourseInPersonalList()
    {
        await Courses.RemoveStudentAsync(SecondCourse, Student(1), Ct);

        var visible = await Courses.MyCoursesAsync(new PageQuery(), Ct);
        var searched = await Courses.MyCoursesAsync(new PageQuery { Q = "EXE201" }, Ct);

        Assert.Equal(FirstCourse, Assert.Single(visible.Items).Id);
        Assert.Empty(searched.Items);
        Assert.Equal(0, searched.TotalItems);
    }

    [Fact]
    public async Task UnknownCourseIsRejectedByRosterAndEnrollment()
    {
        var absent = Guid.NewGuid();

        await Assert.ThrowsAsync<NotFoundException>(() => Courses.StudentsAsync(absent, new CourseStudentQuery(), Ct));
        await Assert.ThrowsAsync<NotFoundException>(() => Courses.EnrollAsync(absent, [Student(1)], Ct));

        await using var reader = NewReader();
        Assert.Equal(24, await reader.StudentInCourses.CountAsync(Ct));
    }
}
