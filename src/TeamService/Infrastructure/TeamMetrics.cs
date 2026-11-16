using System.Diagnostics.Metrics;

namespace Exe.TeamService.Infrastructure;

public sealed class TeamMetrics(IMeterFactory factory)
{
    public const string MeterName = "Exe.TeamService";
    private readonly Meter meter = factory.Create(MeterName);
    internal Meter Meter => meter;
    private Counter<long> Counter(string name) => meter.CreateCounter<long>(name);
    public void RoomCreated(string course) => Counter("exe.rooms.created").Add(1, new KeyValuePair<string, object?>("course", course));
    public void RoomJoined(string mode) => Counter("exe.room.joins").Add(1, new KeyValuePair<string, object?>("mode", mode));
    public void Application(string result) => Counter("exe.room.applications").Add(1, new KeyValuePair<string, object?>("result", result));
    public void RoomLeft() => Counter("exe.room.leaves").Add(1);
    public void GroupFormed(string course) => Counter("exe.groups.formed").Add(1, new KeyValuePair<string, object?>("course", course));
    public void RoomCancelled() => Counter("exe.rooms.cancelled").Add(1);
    public void KafkaPublished(string type, string result) => Counter("exe.kafka.events.published").Add(1, new KeyValuePair<string, object?>("type", type), new KeyValuePair<string, object?>("result", result));
    public void CacheRequest(string cache, bool hit) => Counter("exe.cache.requests").Add(1, new KeyValuePair<string, object?>("cache", cache), new KeyValuePair<string, object?>("result", hit ? "hit" : "miss"));
    public void CourseCloseJobRun(string result) => Counter("exe.course.close.job.runs").Add(1, new KeyValuePair<string, object?>("result", result));
    public void CourseClosed() => Counter("exe.courses.closed").Add(1);
}
