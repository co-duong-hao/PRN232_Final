namespace Exe.TeamService.Dtos;

public sealed record RoomMemberDto(Guid StudentId, string StudentCode, string FullName, string MajorCode, bool IsLeader, DateTime JoinedAt) { public decimal? Gpa { get; init; } public IReadOnlyList<RoleDto> Roles { get; init; } = []; }
public sealed record MajorCountDto(string MajorCode, int Count);
public sealed record RoomSummaryDto(Guid Id, string Code, string Status, int MemberCount, string LeaderName, IReadOnlyList<MajorCountDto> Majors, DateTime CreatedAt) { public string? Name { get; init; } public string? ProjectName { get; init; } public string? IdeaDescription { get; init; } public decimal? RequiredGpa { get; init; } public decimal? TargetGrade { get; init; } public IReadOnlyList<RoleDto> NeededRoles { get; init; } = []; }
public sealed record RoomDto(Guid Id, string Code, string Status, int MemberCount, string LeaderName, IReadOnlyList<MajorCountDto> Majors, DateTime CreatedAt, Guid CourseId, string CourseCode, Guid LeaderId, IReadOnlyList<RoomMemberDto> Members) { public string? Name { get; init; } public string? ProjectName { get; init; } public string? IdeaDescription { get; init; } public decimal? RequiredGpa { get; init; } public decimal? TargetGrade { get; init; } public IReadOnlyList<RoleDto> NeededRoles { get; init; } = []; }
public sealed record GroupMemberDto(Guid StudentId, string StudentCode, string FullName, string MajorCode, bool IsLeader);
public sealed record GroupDto(Guid Id, string Code, string Name, Guid CourseId, string CourseCode, Guid RoomId, Guid GroupTypeId, string GroupTypeName, DateTime CreatedAt, IReadOnlyList<GroupMemberDto> Members);
public sealed record ApplyDto(Guid Id, Guid RoomId, string RoomCode, Guid StudentId, string StudentCode, string FullName, string MajorCode, string Message, string Status, DateTime? DecidedAt, DateTime CreatedAt) { public decimal? Gpa { get; init; } public IReadOnlyList<RoleDto> Roles { get; init; } = []; }
public sealed record RoomProfileRequest(string? Name, string? ProjectName, string? IdeaDescription, decimal? RequiredGpa, decimal? TargetGrade, IReadOnlyList<Guid>? NeededRoleIds);
public sealed record ChangeLeaderRequest(Guid StudentId);
public sealed record CreateApplyRequest(string Message);
