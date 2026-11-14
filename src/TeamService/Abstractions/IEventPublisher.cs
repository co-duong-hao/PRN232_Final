using Exe.Contracts.Events;

namespace Exe.TeamService.Abstractions;

/// <summary>
/// Publishes business events for Noti Service. Call it after the database transaction has committed.
/// Implementations must not throw: a broker failure is logged and never fails the business operation.
/// </summary>
public interface IEventPublisher
{
    Task PublishAsync(EventEnvelope envelope, CancellationToken cancellationToken = default);
}
