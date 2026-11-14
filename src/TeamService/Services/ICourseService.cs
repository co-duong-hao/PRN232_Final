using Exe.Shared.Web.Paging;
using Exe.TeamService.Dtos;

namespace Exe.TeamService.Services;

public interface ICourseService
{
    Task<PagedResult<CourseDto>> ListAsync(CourseQuery query, CancellationToken ct);
    Task<CourseDto> GetAsync(Guid id, CancellationToken ct);
    Task<CourseDto> CreateAsync(CourseRequest request, CancellationToken ct);
    Task<CourseDto> UpdateAsync(Guid id, UpdateCourseRequest request, CancellationToken ct);
    Task DeleteAsync(Guid id, CancellationToken ct);
    Task<CourseDto> TransitionAsync(Guid id, bool open, CancellationToken ct);
    Task<PagedResult<CourseStudentDto>> StudentsAsync(Guid id, CourseStudentQuery query, CancellationToken ct);
    Task<EnrollmentResult> EnrollAsync(Guid id, IReadOnlyList<Guid> studentIds, CancellationToken ct);
    Task RemoveStudentAsync(Guid id, Guid studentId, CancellationToken ct);
    Task<CourseStatsDto> StatsAsync(Guid id, CancellationToken ct);
    Task<PagedResult<MyCourseDto>> MyCoursesAsync(PageQuery query, CancellationToken ct);
}
