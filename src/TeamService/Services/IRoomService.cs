using Exe.TeamService.Abstractions;
using Exe.TeamService.Dtos;

namespace Exe.TeamService.Services;

public interface IRoomService
{
    Task<RoomDto> CreateAsync(Guid courseId, CancellationToken ct);
    Task<RoomDto> JoinAsync(Guid roomId, CancellationToken ct);
    Task LeaveAsync(Guid roomId, CancellationToken ct);
    Task<RoomDto> ChangeLeaderAsync(Guid roomId, Guid studentId, CancellationToken ct);
    Task<CompositionAnalysis> CompositionAsync(Guid roomId, CancellationToken ct);
    Task<GroupDto> CompleteAsync(Guid roomId, CancellationToken ct);
    Task<RoomDto> GetAsync(Guid roomId, CancellationToken ct);
    Task<IReadOnlyList<RoomRecommendation>> RecommendAsync(Guid courseId, int limit, CancellationToken ct);
}

public sealed class RoomOptions
{
    public int LockThreshold { get; set; } = 3;
}
