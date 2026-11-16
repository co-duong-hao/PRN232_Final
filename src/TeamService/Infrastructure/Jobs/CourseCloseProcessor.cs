using Exe.TeamService.Infrastructure;
using Exe.TeamService.Abstractions;
using Exe.TeamService.Infrastructure.Caching;
using Exe.TeamService.Domain;
using Exe.TeamService.Services;

namespace Exe.TeamService.Infrastructure.Jobs;

public sealed class CourseCloseProcessor
{
    private readonly ICourseCloseRepository repository;
    private readonly IEventPublisher publisher;
    private readonly ITeamCache cache;
    private readonly TeamMetrics metrics;

    internal CourseCloseProcessor(ICourseCloseRepository repository, IEventPublisher publisher, ITeamCache cache, TeamMetrics metrics)
    {
        this.repository = repository;
        this.publisher = publisher;
        this.cache = cache;
        this.metrics = metrics;
    }

    public async Task<int> RunOnceAsync(DateTime utcNow, CancellationToken cancellationToken = default)
    {
        var courses = await repository.FindOverdueAsync(utcNow, cancellationToken);
        if (courses.Count == 0)
        {
            return 0;
        }
        var recipients = await repository.FindRecipientsAsync(courses.Select(x => x.Id).ToArray(), cancellationToken);
        foreach (var course in courses)
        {
            course.Status = CourseStatus.Closed;
        }
        await repository.SaveChangesAsync(cancellationToken);
        foreach (var course in courses) metrics.CourseClosed();
        foreach (var course in courses)
        {
            await cache.RemoveAsync(TeamCacheKeys.CourseStats(course.Id), cancellationToken);
            recipients.TryGetValue(course.Id, out var courseRecipients);
            var envelope = RoomEventFactory.CourseClosed(course.Code, courseRecipients ?? []);
            await publisher.PublishAsync(envelope, cancellationToken);
        }
        return courses.Count;
    }
}
