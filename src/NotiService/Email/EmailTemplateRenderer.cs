using Exe.Contracts.Events;
namespace Exe.NotiService.Email;
public sealed class EmailTemplateRenderer
{
    public RenderedEmail? Render(EventEnvelope envelope, EventRecipient recipient)
    {
        string Get(string key) => envelope.Data.GetValueOrDefault(key, "");
        var room = Get(EventDataKeys.RoomCode);
        var course = Get(EventDataKeys.CourseCode);
        var actor = Get(EventDataKeys.ActorName);
        var count = Get(EventDataKeys.MemberCount);
        var group = Get(EventDataKeys.GroupCode);
        var approved = string.Equals(Get(EventDataKeys.Decision), "Approved", StringComparison.OrdinalIgnoreCase);
        var content = envelope.Type switch
        {
            EventTypes.RoomCreated => ($"[EXE] Bạn đã tạo phòng {room}", $"Bạn là trưởng phòng {room} của {course}."),
            EventTypes.RoomMemberJoined => ($"[EXE] {actor} đã vào phòng {room}", $"Phòng hiện có {count} thành viên."),
            EventTypes.RoomLocked => ($"[EXE] Phòng {room} đã khóa", $"Phòng đủ {count} thành viên; người mới phải gửi đơn để trưởng phòng duyệt."),
            EventTypes.RoomApplyCreated => ($"[EXE] Đơn xin vào phòng {room}", $"{actor} xin vào phòng. Lời nhắn: {Get(EventDataKeys.Message)}."),
            EventTypes.RoomApplyDecided => ($"[EXE] Đơn vào phòng {room}: {(approved ? "được chấp nhận" : "bị từ chối")}", $"{actor} đã {(approved ? "chấp nhận" : "từ chối")} đơn của bạn."),
            EventTypes.RoomLeaderChanged => ($"[EXE] Phòng {room} có trưởng phòng mới", $"Trưởng phòng mới là {actor}."),
            EventTypes.RoomCompleted => ($"[EXE] Nhóm {group} đã được thành lập", $"Phòng {room} đã hoàn tất và trở thành nhóm {group}."),
            EventTypes.CourseDeadlineReminder => ($"[EXE] Sắp hết hạn ghép nhóm {course}", $"Hạn ghép nhóm là {Get(EventDataKeys.Deadline)}. Bạn chưa có nhóm."),
            EventTypes.CourseClosed => ($"[EXE] {course} đã đóng ghép nhóm", "Phòng của bạn chưa hoàn tất; giảng viên sẽ hỗ trợ xếp nhóm."),
            _ => default
        };
        return content.Item1 is null ? null : new RenderedEmail(content.Item1, $"Chào {recipient.FullName},\n\n{content.Item2}");
    }
}
