using Exe.Contracts.Events;
using Exe.Shared.Web.Errors;
using Exe.TeamService.Domain;
using Exe.TeamService.Dtos;
using Microsoft.EntityFrameworkCore;

namespace Exe.TeamService.Tests;

public sealed class CourseLifecycleWorkflowTests : WorkflowFixture
{
    [Fact]
    public async Task PlannedCourseCanBeOpenedAndClosedOnce()
    {
        var planned = await CreatePlannedCourse();
        Assert.Equal("Planned", planned.Status);
        Assert.Equal("SP27-EXE101", planned.Code);

        var forming = await Courses.TransitionAsync(planned.Id, true, Ct);
        var closed = await Courses.TransitionAsync(planned.Id, false, Ct);
        var replay = await Assert.ThrowsAsync<BusinessRuleException>(() => Courses.TransitionAsync(planned.Id, false, Ct));

        Assert.Equal("Forming", forming.Status);
        Assert.Equal("Closed", closed.Status);
        Assert.Equal("INVALID_COURSE_STATE", replay.Code);
        var notification = Assert.Single(Events);
        Assert.Equal(EventTypes.CourseClosed, notification.Type);
        Assert.Equal(planned.Code, notification.EventKey);
        Assert.Empty(notification.Recipients);
    }

    [Fact]
    public async Task PlannedCourseRejectsClosureAndRoomCreation()
    {
        var planned = await CreatePlannedCourse();
        await Courses.EnrollAsync(planned.Id, [Student(1)], Ct);

        var premature = await Assert.ThrowsAsync<BusinessRuleException>(() => Courses.TransitionAsync(planned.Id, false, Ct));
        var create = await Assert.ThrowsAsync<BusinessRuleException>(() => MakeRoom(course: planned.Id));

        Assert.Equal("INVALID_COURSE_STATE", premature.Code);
        Assert.Equal("COURSE_NOT_FORMING", create.Code);
        Assert.Equal("Planned", (await Courses.GetAsync(planned.Id, Ct)).Status);
        Assert.Empty(Events);
    }

    [Fact]
    public async Task CannotCreateDuplicateCourseForSameSemesterAndSubject()
    {
        var first = await CreatePlannedCourse();
        var duplicate = new CourseRequest(first.SemesterId, first.SubjectId, first.GroupTypeId, first.StartTime, first.Deadline);

        var error = await Assert.ThrowsAsync<BusinessRuleException>(() => Courses.CreateAsync(duplicate, Ct));

        Assert.Equal("COURSE_EXISTS", error.Code);
        await using var reader = NewReader();
        Assert.Equal(first.Id, (await reader.Courses.SingleAsync(x => x.SemesterId == first.SemesterId && x.SubjectId == first.SubjectId, Ct)).Id);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(-120)]
    public async Task InvalidDeadlineEditKeepsCourseDates(int offset)
    {
        var first = await Courses.GetAsync(FirstCourse, Ct);
        var update = new UpdateCourseRequest(first.GroupTypeId, first.StartTime, first.StartTime.AddMinutes(offset));

        await Assert.ThrowsAsync<BadRequestException>(() => Courses.UpdateAsync(first.Id, update, Ct));

        var after = await Courses.GetAsync(first.Id, Ct);
        Assert.Equal(first.StartTime, after.StartTime);
        Assert.Equal(first.Deadline, after.Deadline);
        Assert.Equal(first.Status, after.Status);
    }

    [Fact]
    public async Task DeletingPlannedCourseRemovesOnlyItsEnrollments()
    {
        var planned = await CreatePlannedCourse();
        await Courses.EnrollAsync(planned.Id, [Student(1), Student(8)], Ct);

        await Courses.DeleteAsync(planned.Id, Ct);

        await Assert.ThrowsAsync<NotFoundException>(() => Courses.GetAsync(planned.Id, Ct));
        await using var reader = NewReader();
        Assert.False(await reader.StudentInCourses.AnyAsync(x => x.CourseId == planned.Id, Ct));
        Assert.Equal(12, await reader.StudentInCourses.CountAsync(x => x.CourseId == FirstCourse, Ct));
        Assert.Equal(12, await reader.Students.CountAsync(Ct));
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task ActiveAndClosedCoursesCannotBeDeleted(bool close)
    {
        if (close)
        {
            await Courses.TransitionAsync(FirstCourse, false, Ct);
        }

        var error = await Assert.ThrowsAsync<BusinessRuleException>(() => Courses.DeleteAsync(FirstCourse, Ct));

        Assert.Equal("IN_USE", error.Code);
        Assert.Equal(12, (await Courses.GetAsync(FirstCourse, Ct)).StudentCount);
    }

    [Fact]
    public async Task ClosingCourseNotifiesOnlyMembersInThatCourse()
    {
        var first = await MakeLocked();
        await MakeRoom(8, SecondCourse);
        await MakeRoom(9);
        Events.Clear();

        var closed = await Courses.TransitionAsync(FirstCourse, false, Ct);

        Assert.Equal("Closed", closed.Status);
        Assert.Equal("Forming", (await Courses.GetAsync(SecondCourse, Ct)).Status);
        var notification = Assert.Single(Events);
        Assert.Equal(EventTypes.CourseClosed, notification.Type);
        Assert.Equal(closed.Code, notification.EventKey);
        Assert.Equal(new[] { "student01@exe.local", "student02@exe.local", "student06@exe.local", "student09@exe.local" },
            notification.Recipients.Select(x => x.Email).Order());
        Assert.Equal("Locked", (await Rooms.GetAsync(first.Id, Ct)).Status);
    }

    [Fact]
    public async Task CourseListCombinesSemesterSubjectStatusAndQuery()
    {
        var planned = await CreatePlannedCourse();

        var page = await Courses.ListAsync(new CourseQuery
        {
            SemesterId = planned.SemesterId,
            SubjectId = planned.SubjectId,
            Status = "planned",
            Q = "-EXE101",
            SortBy = "deadline",
            SortDir = "desc",
            PageSize = 1,
        }, Ct);

        Assert.Equal(1, page.TotalItems);
        Assert.Equal(planned.Id, Assert.Single(page.Items).Id);
    }

    private async Task<CourseDto> CreatePlannedCourse()
    {
        var seed = await Courses.GetAsync(FirstCourse, Ct);
        var start = new DateTime(2027, 1, 10, 0, 0, 0, DateTimeKind.Utc);
        var semester = new Semester { Code = "SP27", Name = "Spring 2027", StartDate = start, EndDate = start.AddMonths(4) };
        Db.Semesters.Add(semester);
        await Db.SaveChangesAsync(Ct);
        return await Courses.CreateAsync(new CourseRequest(semester.Id, seed.SubjectId, seed.GroupTypeId, start, start.AddMonths(3)), Ct);
    }
}
