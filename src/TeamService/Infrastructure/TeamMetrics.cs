using System.Diagnostics.Metrics;

namespace Exe.TeamService.Infrastructure;

public sealed class TeamMetrics
{
    public const string MeterName = "Exe.TeamService";
    private readonly Meter meter;
    private readonly Counter<long> roomsCreated;
    private readonly Counter<long> roomJoins;
    private readonly Counter<long> applications;
    private readonly Counter<long> roomLeaves;
    private readonly Counter<long> groupsFormed;
    private readonly Counter<long> roomsCancelled;
    private readonly Counter<long> kafkaPublished;
    private readonly Counter<long> cacheRequests;
    private readonly Counter<long> courseCloseJobRuns;
    private readonly Counter<long> coursesClosed;

    public TeamMetrics(IMeterFactory factory)
    {
        meter = factory.Create(MeterName);
        roomsCreated = meter.CreateCounter<long>("exe.rooms.created");
        roomJoins = meter.CreateCounter<long>("exe.room.joins");
        applications = meter.CreateCounter<long>("exe.room.applications");
        roomLeaves = meter.CreateCounter<long>("exe.room.leaves");
        groupsFormed = meter.CreateCounter<long>("exe.groups.formed");
        roomsCancelled = meter.CreateCounter<long>("exe.rooms.cancelled");
        kafkaPublished = meter.CreateCounter<long>("exe.kafka.events.published");
        cacheRequests = meter.CreateCounter<long>("exe.cache.requests");
        courseCloseJobRuns = meter.CreateCounter<long>("exe.course.close.job.runs");
        coursesClosed = meter.CreateCounter<long>("exe.courses.closed");
    }

    internal Meter Meter => meter;
    public void RoomCreated(string course) => roomsCreated.Add(1, new KeyValuePair<string, object?>("course", course));
    public void RoomJoined(string mode) => roomJoins.Add(1, new KeyValuePair<string, object?>("mode", mode));
    public void Application(string result) => applications.Add(1, new KeyValuePair<string, object?>("result", result));
    public void RoomLeft() => roomLeaves.Add(1);
    public void GroupFormed(string course) => groupsFormed.Add(1, new KeyValuePair<string, object?>("course", course));
    public void RoomCancelled() => roomsCancelled.Add(1);
    public void KafkaPublished(string type, string result) => kafkaPublished.Add(1, new KeyValuePair<string, object?>("type", type), new KeyValuePair<string, object?>("result", result));
    public void CacheRequest(string cache, bool hit) => cacheRequests.Add(1, new KeyValuePair<string, object?>("cache", cache), new KeyValuePair<string, object?>("result", hit ? "hit" : "miss"));
    public void CourseCloseJobRun(string result) => courseCloseJobRuns.Add(1, new KeyValuePair<string, object?>("result", result));
    public void CourseClosed() => coursesClosed.Add(1);
}
