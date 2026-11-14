using Exe.Shared.Web.Paging;

namespace Exe.TeamService.Dtos;

public sealed record LookupRequest(string Code, string Name, DateTime? StartDate, DateTime? EndDate);
public sealed record LookupDto(Guid Id, string Code, string Name, DateTime? StartDate, DateTime? EndDate)
{
    public LookupDto() : this(default, "", "", null, null) { }
}
public sealed record StudentRequest(Guid UserId, string StudentCode, string FullName, string Email, Guid MajorId);
public sealed record StudentDto(Guid Id, Guid UserId, string StudentCode, string FullName, string Email, Guid MajorId, string MajorCode)
{
    public StudentDto() : this(default, default, "", "", "", default, "") { }
}
public sealed class StudentQuery : PageQuery
{
    public Guid? MajorId { get; set; }
}
public sealed record GroupTypeMajorDto(Guid MajorId, string MajorCode, int MinQuantity, int MaxQuantity);
public sealed record GroupTypeMajorRequest(Guid MajorId, int MinQuantity, int MaxQuantity);
public sealed record GroupTypeRequest(string Name, int MinMemberCount, int MaxMemberCount, int MinMajorCount, IReadOnlyList<GroupTypeMajorRequest> Majors);
public sealed record GroupTypeDto(Guid Id, string Name, int MinMemberCount, int MaxMemberCount, int MinMajorCount, IReadOnlyList<GroupTypeMajorDto> Majors);
