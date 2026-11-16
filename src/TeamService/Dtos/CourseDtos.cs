using Exe.Shared.Web.Paging;

namespace Exe.TeamService.Dtos;

public sealed record CourseRequest(Guid SemesterId, Guid SubjectId, Guid GroupTypeId, DateTime StartTime, DateTime Deadline);
public sealed record UpdateCourseRequest(Guid GroupTypeId, DateTime StartTime, DateTime Deadline);
public sealed record EnrollRequest(IReadOnlyList<Guid> StudentIds);
public sealed record EnrollmentResult(int Added, int Skipped);
public sealed record CourseDto(Guid Id, string Code, Guid SemesterId, Guid SubjectId, Guid GroupTypeId, string GroupTypeName, string Status, DateTime StartTime, DateTime Deadline, int StudentCount)
{
    public CourseDto() : this(default, "", default, default, default, "", "", default, default, 0) { }
}
public sealed record CourseStudentDto(Guid Id, string StudentCode, string FullName, string Email, Guid MajorId, string MajorCode, bool HasRoom, decimal? Gpa, IReadOnlyList<RoleDto> Roles)
{
    public CourseStudentDto() : this(default, "", "", "", default, "", false, null, []) { }
}
public sealed record CourseStatsDto(int TotalStudents, int StudentsInRoom, int StudentsInGroup, IReadOnlyDictionary<string, int> RoomsByStatus, int GroupCount);
public sealed record MyCourseDto(Guid Id, string Code, Guid SemesterId, Guid SubjectId, Guid GroupTypeId, string GroupTypeName, string Status, DateTime StartTime, DateTime Deadline, int StudentCount, RoomDto? MyRoom, GroupDto? MyGroup);
public sealed class CourseQuery : PageQuery
{
    public Guid? SemesterId { get; set; }
    public Guid? SubjectId { get; set; }
    public string? Status { get; set; }
}
public sealed class CourseStudentQuery : PageQuery
{
    public Guid? MajorId { get; set; }
    public bool? HasRoom { get; set; }
}
