using Exe.TeamService.Abstractions;
using Exe.TeamService.Domain;
using Exe.TeamService.Services;

namespace Exe.TeamService.Infrastructure.Jobs;

public sealed class CourseCloseProcessor
{
    private readonly ICourseCloseRepository repository;
    private readonly IEventPublisher publisher;

    internal CourseCloseProcessor(ICourseCloseRepository repository, IEventPublisher publisher)
    {
        this.repository = repository;
        this.publisher = publisher;
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
        foreach (var course in courses)
        {
            recipients.TryGetValue(course.Id, out var courseRecipients);
            var envelope = RoomEventFactory.CourseClosed(course.Code, courseRecipients ?? []);
            await publisher.PublishAsync(envelope, cancellationToken);
        }
        return courses.Count;
    }
}
