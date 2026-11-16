using Exe.Contracts.Events;
using Exe.NotiService.Email;

namespace Exe.NotiService.Tests;

public sealed class EmailTemplateRendererTests
{
    [Theory]
    [InlineData(EventTypes.RoomCreated, "[EXE] Bạn đã tạo phòng R1")]
    [InlineData(EventTypes.RoomMemberJoined, "[EXE] An đã vào phòng R1")]
    [InlineData(EventTypes.RoomLocked, "[EXE] Phòng R1 đã khóa")]
    [InlineData(EventTypes.RoomApplyCreated, "[EXE] Đơn xin vào phòng R1")]
    [InlineData(EventTypes.RoomApplyDecided, "[EXE] Đơn vào phòng R1: được chấp nhận")]
    [InlineData(EventTypes.RoomLeaderChanged, "[EXE] Phòng R1 có trưởng phòng mới")]
    [InlineData(EventTypes.RoomCompleted, "[EXE] Nhóm G1 đã được thành lập")]
    [InlineData(EventTypes.CourseDeadlineReminder, "[EXE] Sắp hết hạn ghép nhóm C1")]
    [InlineData(EventTypes.CourseClosed, "[EXE] C1 đã đóng ghép nhóm")]
    public void Render_KnownEvent_ReturnsExpectedSubject(string type, string expected)
    {
        var email = new EmailTemplateRenderer().Render(CreateEvent(type), new("a@example.com", "Bình"));
        Assert.NotNull(email);
        Assert.Equal(expected, email.Subject);
        Assert.StartsWith("Chào Bình,", email.Body);
    }

    [Fact]
    public void Render_RejectedApplication_UsesRejectionWording()
    {
        var envelope = CreateEvent(EventTypes.RoomApplyDecided) with
        {
            Data = new Dictionary<string, string> { [EventDataKeys.RoomCode] = "R1", [EventDataKeys.ActorName] = "An", [EventDataKeys.Decision] = "Rejected" }
        };
        var result = new EmailTemplateRenderer().Render(envelope, new("a@example.com", "Bình"));
        Assert.Equal("[EXE] Đơn vào phòng R1: bị từ chối", result!.Subject);
        Assert.Contains("An đã từ chối đơn của bạn.", result.Body);
    }

    [Fact]
    public void Render_UnknownEvent_ReturnsNull()
    {
        Assert.Null(new EmailTemplateRenderer().Render(CreateEvent("Unknown"), new("a@example.com", "Bình")));
    }

    [Theory]
    [InlineData(EventTypes.RoomCreated, "Bạn là trưởng phòng R1 của C1.")]
    [InlineData(EventTypes.RoomMemberJoined, "Phòng hiện có 4 thành viên.")]
    [InlineData(EventTypes.RoomLocked, "Phòng đủ 4 thành viên; người mới phải gửi đơn để trưởng phòng duyệt.")]
    [InlineData(EventTypes.RoomApplyCreated, "An xin vào phòng. Lời nhắn: Xin vào nhóm.")]
    [InlineData(EventTypes.RoomApplyDecided, "An đã chấp nhận đơn của bạn.")]
    [InlineData(EventTypes.RoomLeaderChanged, "Trưởng phòng mới là An.")]
    [InlineData(EventTypes.RoomCompleted, "Phòng R1 đã hoàn tất và trở thành nhóm G1.")]
    [InlineData(EventTypes.CourseDeadlineReminder, "Hạn ghép nhóm là 2026-12-01T00:00:00Z. Bạn chưa có nhóm.")]
    [InlineData(EventTypes.CourseClosed, "Phòng của bạn chưa hoàn tất; giảng viên sẽ hỗ trợ xếp nhóm.")]
    public void Render_AllKnownEvents_IncludeExpectedBodyContent(string type, string expectedBody)
    {
        var email = new EmailTemplateRenderer().Render(CreateEvent(type), new("a@example.com", "Bình"));
        Assert.NotNull(email);
        Assert.Equal($"Chào Bình,\n\n{expectedBody}", email.Body);
    }

    [Fact]
    public void Render_WhenOptionalDataKeysMissing_DoesNotThrow()
    {
        var envelope = new EventEnvelope { Type = EventTypes.RoomCreated };
        var email = new EmailTemplateRenderer().Render(envelope, new("a@example.com", "Bình"));
        Assert.NotNull(email);
        Assert.Equal("[EXE] Bạn đã tạo phòng ", email.Subject);
        Assert.StartsWith("Chào Bình,", email.Body);
    }

    internal static EventEnvelope CreateEvent(string type) => new()
    {
        Type = type,
        Data = new Dictionary<string, string>
        {
            [EventDataKeys.RoomCode] = "R1",
            [EventDataKeys.CourseCode] = "C1",
            [EventDataKeys.GroupCode] = "G1",
            [EventDataKeys.ActorName] = "An",
            [EventDataKeys.MemberCount] = "4",
            [EventDataKeys.Decision] = "Approved",
            [EventDataKeys.Message] = "Xin vào nhóm",
            [EventDataKeys.Deadline] = "2026-12-01T00:00:00Z"
        }
    };
}
