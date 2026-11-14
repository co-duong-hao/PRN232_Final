using Exe.TeamService.Dtos;

namespace Exe.TeamService.Services;

public interface IRoomApplyService
{
    Task<ApplyDto> CreateAsync(Guid roomId, string message, CancellationToken ct);
    Task<ApplyDto> DecideAsync(Guid applyId, bool approve, CancellationToken ct);
    Task<ApplyDto> CancelAsync(Guid applyId, CancellationToken ct);
}
