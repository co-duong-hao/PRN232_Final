using Exe.Contracts.Events;
using Exe.TeamService.Domain;

namespace Exe.TeamService.Services;

internal static class RoomEventFactory
{
    public static EventEnvelope CourseClosed(string courseCode, IReadOnlyList<EventRecipient> recipients)
    {
        return new EventEnvelope
        {
            Type = EventTypes.CourseClosed,
            Recipients = recipients,
            Data = new Dictionary<string, string> { [EventDataKeys.CourseCode] = courseCode }
        };
    }

    public static EventEnvelope Create(string type, Room room, IEnumerable<Student> recipients, params (string Key, string Value)[] data)
    {
        var values = new Dictionary<string, string>
        {
            [EventDataKeys.CourseCode] = room.Course.Code,
            [EventDataKeys.RoomCode] = room.Code
        };
        foreach (var (key, value) in data)
        {
            values[key] = value;
        }
        return new EventEnvelope
        {
            Type = type,
            Recipients = recipients.Select(x => new EventRecipient(x.Email, x.FullName)).ToArray(),
            Data = values
        };
    }
}

