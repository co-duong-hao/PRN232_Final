using Exe.Contracts.Events;
using Exe.TeamService.Data;
using Exe.TeamService.Domain;
using Microsoft.EntityFrameworkCore;

namespace Exe.TeamService.Infrastructure.Jobs;

internal interface ICourseCloseRepository
{
    Task<List<Course>> FindOverdueAsync(DateTime utcNow, CancellationToken cancellationToken);
    Task<Dictionary<Guid, IReadOnlyList<EventRecipient>>> FindRecipientsAsync(
        IReadOnlyCollection<Guid> courseIds, CancellationToken cancellationToken);
    Task SaveChangesAsync(CancellationToken cancellationToken);
}

internal sealed class CourseCloseRepository(TeamDbContext db) : ICourseCloseRepository
{
    public Task<List<Course>> FindOverdueAsync(DateTime utcNow, CancellationToken cancellationToken)
    {
        return db.Courses.Where(x => x.Status == CourseStatus.Forming && x.Deadline <= utcNow)
            .ToListAsync(cancellationToken);
    }

    public async Task<Dictionary<Guid, IReadOnlyList<EventRecipient>>> FindRecipientsAsync(
        IReadOnlyCollection<Guid> courseIds, CancellationToken cancellationToken)
    {
        var members = await db.StudentInRooms
            .Where(x => courseIds.Contains(x.CourseId) &&
                (x.Room.Status == RoomStatus.Open || x.Room.Status == RoomStatus.Locked))
            .Select(x => new { x.CourseId, x.Student.Email, x.Student.FullName })
            .ToListAsync(cancellationToken);
        return members.GroupBy(x => x.CourseId).ToDictionary(
            x => x.Key,
            x => (IReadOnlyList<EventRecipient>)x.Select(y => new EventRecipient(y.Email, y.FullName)).ToArray());
    }

    public async Task SaveChangesAsync(CancellationToken cancellationToken)
    {
        await db.SaveChangesAsync(cancellationToken);
    }
}
