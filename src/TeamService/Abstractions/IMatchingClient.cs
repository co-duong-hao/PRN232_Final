namespace Exe.TeamService.Abstractions;

/// <summary>Limits for one major inside a GroupType (BR15).</summary>
public sealed record MajorRule(string MajorCode, int MinQuantity, int MaxQuantity);

/// <summary>A GroupType flattened for Matching Service (BR14 + BR15).</summary>
public sealed record GroupTypeRule(
    int MinMemberCount, int MaxMemberCount, int MinMajorCount, IReadOnlyList<MajorRule> MajorRules);

/// <summary><c>Required</c> is the minimum for a missing major and the maximum for an exceeding one.</summary>
public sealed record MajorGap(string MajorCode, int Current, int Required);

public sealed record CompositionAnalysis(
    bool Satisfied,
    int MemberCount,
    int MissingMemberCount,
    int DistinctMajorCount,
    int MissingMajorCount,
    IReadOnlyList<MajorGap> MissingMajors,
    IReadOnlyList<MajorGap> ExceedingMajors,
    IReadOnlyList<string> Violations);

/// <summary><c>Status</c> is "Open" or "Locked".</summary>
public sealed record RoomSnapshot(Guid RoomId, string RoomCode, string Status, IReadOnlyList<string> MemberMajorCodes);

public sealed record RoomRecommendation(Guid RoomId, string RoomCode, int Score, bool CanJoin, IReadOnlyList<string> Reasons);

/// <summary>
/// Team Service's view of Matching Service (gRPC). Kept free of generated gRPC types so the domain
/// and its tests do not depend on the transport. Semantics: docs/design/matching.md.
/// Implementations throw <c>ServiceUnavailableException</c> (code MATCHING_UNAVAILABLE) when the
/// service cannot be reached.
/// </summary>
public interface IMatchingClient
{
    Task<CompositionAnalysis> AnalyzeCompositionAsync(
        GroupTypeRule rule, IReadOnlyList<string> memberMajorCodes, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<RoomRecommendation>> RecommendRoomsAsync(
        GroupTypeRule rule, string studentMajorCode, IReadOnlyList<RoomSnapshot> rooms, int limit,
        CancellationToken cancellationToken = default);
}
