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

    internal static EventEnvelope CreateEvent(string type) => new()
    {
        Type = type,
        Data = new Dictionary<string, string>
        {
            [EventDataKeys.RoomCode] = "R1", [EventDataKeys.CourseCode] = "C1",
            [EventDataKeys.GroupCode] = "G1", [EventDataKeys.ActorName] = "An",
            [EventDataKeys.MemberCount] = "4", [EventDataKeys.Decision] = "Approved"
        }
    };
}
