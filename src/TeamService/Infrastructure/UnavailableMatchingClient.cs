using Exe.Shared.Web.Errors;
using Exe.TeamService.Abstractions;

namespace Exe.TeamService.Infrastructure;

/// <summary>Placeholder used until T4 adds the gRPC client. Every call answers 503 MATCHING_UNAVAILABLE.</summary>
public sealed class UnavailableMatchingClient : IMatchingClient
{
    private static ServiceUnavailableException NotConfigured() =>
        new("Matching Service is not configured.", "MATCHING_UNAVAILABLE");

    public Task<CompositionAnalysis> AnalyzeCompositionAsync(
        GroupTypeRule rule, IReadOnlyList<string> memberMajorCodes, CancellationToken cancellationToken = default) =>
        throw NotConfigured();

    public Task<IReadOnlyList<RoomRecommendation>> RecommendRoomsAsync(
        GroupTypeRule rule, string studentMajorCode, IReadOnlyList<RoomSnapshot> rooms, int limit,
        CancellationToken cancellationToken = default) =>
        throw NotConfigured();
}
