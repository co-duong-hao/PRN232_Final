# Kiểm thử .NET

Tài liệu tham chiếu cho PRN232 Final v0.4 tại commit 2e3789f.

[Mục lục bộ tài liệu](01-architecture.md)

## Cách hoạt động

Bộ kiểm thử chia theo Auth, Matching, Noti và Team. Các test service dùng lớp phụ thuộc giả lập và trong nhiều trường hợp dùng SQLite in-memory.

Kiểm thử hạ tầng tập trung vào adapter, Kafka publisher, cache, lỗi dịch vụ ghép nhóm và job nền. Kết quả .NET nên gọi là kiểm thử .NET vì có cả test tích hợp.

Các ca đồng thời trên SQL Server và các ca UI cần kiểm tra thêm qua bản chạy thật. Kết quả một test cần ràng buộc với phiên bản thực tế của repo.

## Cách kiểm tra

1. Chạy `dotnet test ExeTeamMatching.sln` và lưu số lượng test theo từng project.
2. Đối chiếu ca BR19 của phòng đã khóa với ca phòng mở có GPA dưới yêu cầu.

## Đối chiếu mã nguồn

Các trích đoạn dưới đây hỗ trợ tra cứu. Đường dẫn mở phần tương ứng trong repo.

### AuthTests.cs

Kiểm thử nghiệp vụ Auth.

[tests/AuthService.Tests/AuthTests.cs dòng 1–110](../../tests/AuthService.Tests/AuthTests.cs#L1-L110)

~~~csharp
using Exe.AuthService.Data;
using Exe.AuthService.Domain;
using Exe.AuthService.Dtos;
using Exe.AuthService.Repositories;
using Exe.AuthService.Services;
using Exe.Contracts;
using Exe.Shared.Web.Auth;
using Exe.Shared.Web.Errors;
using Microsoft.AspNetCore.Identity;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Moq;
using System.IdentityModel.Tokens.Jwt;

namespace Exe.AuthService.Tests;

public sealed class AuthTests : IDisposable
{
    private readonly SqliteConnection connection = new("DataSource=:memory:");

    private readonly AuthDbContext db;

    private readonly PasswordHasher<User> hasher = new();

    private readonly UserRepository repo;

    private readonly Mock<ICurrentUser> current = new();

    public AuthTests()
    {
        connection.Open();
        db = new(new DbContextOptionsBuilder<AuthDbContext>().UseSqlite(connection).Options);
        db.Database.EnsureCreated();
        repo = new(db);
        current.Setup(x => x.UserId).Returns(Guid.NewGuid());
        var role = new Role
        {
            Code = Roles.Student,
            Name = "Student"
        };
        var user = new User
        {
            Email = "student@example.com",
            FullName = "Student"
        };
        user.PasswordHash = hasher.HashPassword(user, "password123");
        user.UserRoles.Add(new UserRole { User = user, Role = role });
        db.Users.Add(user);
        db.SaveChanges();
    }


    private AuthService.Services.AuthService Auth() => new(repo, hasher, new TokenService(Options.Create(new JwtOptions { Issuer = "issuer", Audience = "audience", Key = "12345678901234567890123456789012" })), current.Object);
    [Fact]

    public async Task Login_Valid_ContainsClaims()
    {
        var result = await Auth().LoginAsync(new() { Email = "STUDENT@example.com", Password = "password123" }, default);
        var token = new JwtSecurityTokenHandler().ReadJwtToken(result.AccessToken);
        Assert.Equal("issuer", token.Issuer);
        Assert.Contains("audience", token.Audiences);
        Assert.Equal("student@example.com", token.Claims.Single(x => x.Type == "email").Value);
        Assert.Equal("Student", token.Claims.Single(x => x.Type == "role").Value);
        Assert.NotNull(token.Claims.Single(x => x.Type == "sub"));
        Assert.Equal("Student", token.Claims.Single(x => x.Type == "name").Value);
    }

    [Fact]

    public async Task Login_InvalidPasswordOrInactive_RejectsBoth()
    {
        var a = await Assert.ThrowsAsync<UnauthorizedAppException>(() => Auth().LoginAsync(new() { Email = "student@example.com", Password = "wrong" }, default));
        var u = db.Users.Single();
        u.Status = UserStatus.Inactive;
        await db.SaveChangesAsync();
        var b = await Assert.ThrowsAsync<UnauthorizedAppException>(() => Auth().LoginAsync(new() { Email = u.Email, Password = "password123" }, default));
        Assert.Equal("INVALID_CREDENTIALS", a.Code);
        Assert.Equal(a.Code, b.Code);
        Assert.Equal(a.Message, b.Message);
    }

    [Fact]

    public async Task Create_DuplicateEmail_Throws()
    {
        var service = new UserService(repo, hasher, current.Object);
        var ex = await Assert.ThrowsAsync<BusinessRuleException>(() => service.CreateAsync(new() { Email = "STUDENT@example.com", Password = "password123", FullName = "Name" }, default));
        Assert.Equal("EMAIL_EXISTS", ex.Code);
    }

    [Fact]

    public async Task List_FiltersAndPages()
    {
        db.Users.Add(new User { Email = "another@example.com", FullName = "Other", PasswordHash = "x", Status = UserStatus.Inactive });
        await db.SaveChangesAsync();
        var service = new UserService(repo, hasher, current.Object);
        var page = await service.ListAsync(new() { Q = "student", Role = "Student", Status = UserStatus.Active, PageSize = 1 }, default);
        Assert.Equal(1, page.TotalItems);
        Assert.Equal("student@example.com", Assert.Single(page.Items).Email);
    }


    public void Dispose()
    {
        db.Dispose();
        connection.Dispose();
    }
}
~~~

### MatchingTests.cs

Kiểm thử phân tích cơ cấu và gợi ý.

[tests/MatchingService.Tests/MatchingTests.cs dòng 1–10](../../tests/MatchingService.Tests/MatchingTests.cs#L1-L10)

~~~csharp
using Exe.MatchingService.Services;
namespace Exe.MatchingService.Tests;
public class MatchingTests {
 private static readonly GroupRule Rule=new(4,6,3,[new("SE",2,3)]);
 [Theory]
 [InlineData("SE,SE,GD,MKT",true,0)] [InlineData("SE,SE,GD",false,2)] [InlineData("SE,GD,MKT,AI",false,1)] [InlineData("SE,SE,SE,SE,GD,MKT",false,1)]
 public void Analyze_Examples_ReturnExpected(string input,bool satisfied,int count) { var result=new CompositionAnalyzer().Analyze(Rule,input.Split(',')); Assert.Equal(satisfied,result.Satisfied); Assert.Equal(count,result.Violations.Count); }
 [Fact] public void Analyze_AllViolations_AreOrdered() { var r=new CompositionAnalyzer().Analyze(new(8,3,3,[new("SE",2,3),new("GD",0,0)]),["se","GD","gd","gd"]); Assert.Equal(new[]{"BR14: thiếu 4 thành viên (4/8).","BR14: vượt số thành viên tối đa (4/3).","BR14: thiếu 1 ngành (2/3).","BR15: ngành SE thiếu 1 sinh viên (1/2).","BR15: ngành GD vượt tối đa (3/0)."},r.Violations); }
 [Fact] public void Recommend_FiltersScoresSortsAndLimits() { var rooms=new[] { new RoomModel("1","B","Open",["GD"]),new RoomModel("2","A","Open",["gd"]),new RoomModel("3","Full","Open",["SE","SE","SE"]),new RoomModel("4","Max","Open",["A","B","C","D","E","F"]) }; var result=new RoomRecommender().Recommend(Rule,"se",rooms,1); var item=Assert.Single(result); Assert.Equal("A",item.Code); Assert.Equal(92,item.Score); Assert.Equal(4,item.Reasons.Count); }
}
~~~

### EventConsumerWorkerTests.cs

Test retry và gửi vào DLQ.

[tests/NotiService.Tests/EventConsumerWorkerTests.cs dòng 1–66](../../tests/NotiService.Tests/EventConsumerWorkerTests.cs#L1-L66)

~~~csharp
using Confluent.Kafka;
using Exe.Contracts.Events;
using Exe.NotiService.Email;
using Exe.NotiService.Options;
using Exe.NotiService.Workers;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;

namespace Exe.NotiService.Tests;

public sealed class EventConsumerWorkerTests
{
    [Fact]
    public async Task ProcessMessage_TemporaryFailures_RetriesMaxAttemptsThenPublishesOriginal()
    {
        var sender = new Mock<IEmailSender>();
        sender.Setup(x => x.SendAsync(It.IsAny<EventRecipient>(), It.IsAny<RenderedEmail>(), It.IsAny<CancellationToken>())).ThrowsAsync(new IOException("smtp"));
        var dlq = new Mock<IDeadLetterPublisher>();
        var worker = CreateWorker(sender, dlq, 4);
        var message = ValidMessage();
        var delays = new List<double>();
        await worker.ProcessMessageAsync(message, default, (duration, _) => { delays.Add(duration.TotalSeconds); return Task.CompletedTask; });
        sender.Verify(x => x.SendAsync(It.IsAny<EventRecipient>(), It.IsAny<RenderedEmail>(), It.IsAny<CancellationToken>()), Times.Exactly(4));
        Assert.Equal(new double[] { 1, 2, 4 }, delays);
        dlq.Verify(x => x.PublishAsync(message, "smtp", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ProcessMessage_InvalidJson_PublishesImmediately()
    {
        var sender = new Mock<IEmailSender>(MockBehavior.Strict);
        var dlq = new Mock<IDeadLetterPublisher>();
        var worker = CreateWorker(sender, dlq, 3);
        var message = new Message<string, string> { Key = "key", Value = "{invalid" };
        await worker.ProcessMessageAsync(message, default, (_, _) => throw new Exception("Unexpected retry"));
        dlq.Verify(x => x.PublishAsync(message, It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Once);
        sender.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task ProcessMessage_SecondAttemptSucceeds_DoesNotPublish()
    {
        var sender = new Mock<IEmailSender>();
        sender.SetupSequence(x => x.SendAsync(It.IsAny<EventRecipient>(), It.IsAny<RenderedEmail>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new IOException()).Returns(Task.CompletedTask);
        var dlq = new Mock<IDeadLetterPublisher>(MockBehavior.Strict);
        var worker = CreateWorker(sender, dlq, 3);
        await worker.ProcessMessageAsync(ValidMessage(), default, (_, _) => Task.CompletedTask);
        sender.Verify(x => x.SendAsync(It.IsAny<EventRecipient>(), It.IsAny<RenderedEmail>(), It.IsAny<CancellationToken>()), Times.Exactly(2));
        dlq.VerifyNoOtherCalls();
    }

    private static EventConsumerWorker CreateWorker(Mock<IEmailSender> sender, Mock<IDeadLetterPublisher> dlq, int attempts) =>
        new(Microsoft.Extensions.Options.Options.Create(new KafkaOptions { MaxAttempts = attempts }),
            new EventProcessor(sender.Object, new EmailTemplateRenderer(), NullLogger<EventProcessor>.Instance),
            dlq.Object, NullLogger<EventConsumerWorker>.Instance);

    private static Message<string, string> ValidMessage() => new()
    {
        Key = "room",
        Value = (EmailTemplateRendererTests.CreateEvent(EventTypes.RoomCreated) with
        { Recipients = [new("one@example.com", "Một")] }).ToJson()
    };
}

~~~

### EventProcessorTests.cs

Test diễn giải và xử lý message.

[tests/NotiService.Tests/EventProcessorTests.cs dòng 1–44](../../tests/NotiService.Tests/EventProcessorTests.cs#L1-L44)

~~~csharp
using Exe.Contracts.Events;
using Exe.NotiService.Email;
using Exe.NotiService.Workers;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace Exe.NotiService.Tests;

public sealed class EventProcessorTests
{
    [Fact]
    public async Task Process_TwoRecipients_SendsBothEmails()
    {
        var sender = new Mock<IEmailSender>();
        var processor = new EventProcessor(sender.Object, new(), NullLogger<EventProcessor>.Instance);
        var envelope = EmailTemplateRendererTests.CreateEvent(EventTypes.RoomCreated) with
        {
            Recipients = [new("one@example.com", "Một"), new("two@example.com", "Hai")]
        };
        Assert.Equal(ProcessingStatus.Success, (await processor.ProcessAsync(envelope.ToJson(), default)).Status);
        sender.Verify(x => x.SendAsync(It.Is<EventRecipient>(r => r.Email == "one@example.com"), It.IsAny<RenderedEmail>(), It.IsAny<CancellationToken>()), Times.Once);
        sender.Verify(x => x.SendAsync(It.Is<EventRecipient>(r => r.Email == "two@example.com"), It.IsAny<RenderedEmail>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Process_SendFailure_ReturnsFalse()
    {
        var sender = new Mock<IEmailSender>();
        sender.Setup(x => x.SendAsync(It.IsAny<EventRecipient>(), It.IsAny<RenderedEmail>(), It.IsAny<CancellationToken>())).ThrowsAsync(new IOException());
        var processor = new EventProcessor(sender.Object, new(), NullLogger<EventProcessor>.Instance);
        var envelope = EmailTemplateRendererTests.CreateEvent(EventTypes.RoomCreated) with { Recipients = [new("one@example.com", "Một")] };
        Assert.Equal(ProcessingStatus.TemporaryFailure, (await processor.ProcessAsync(envelope.ToJson(), default)).Status);
    }

    [Fact]
    public async Task Process_BadJsonThenUnknown_ReturnsFailureThenSuccess()
    {
        var sender = new Mock<IEmailSender>(MockBehavior.Strict);
        var processor = new EventProcessor(sender.Object, new(), NullLogger<EventProcessor>.Instance);
        Assert.Equal(ProcessingStatus.PermanentFailure, (await processor.ProcessAsync("{invalid", default)).Status);
        Assert.Equal(ProcessingStatus.Success, (await processor.ProcessAsync(EmailTemplateRendererTests.CreateEvent("Unknown").ToJson(), default)).Status);
        sender.VerifyNoOtherCalls();
    }
}
~~~

### RoomServiceTests.cs

Ca hồ sơ, BR19, BR20 và tìm phòng.

[tests/TeamService.Tests/RoomServiceTests.cs dòng 61–143](../../tests/TeamService.Tests/RoomServiceTests.cs#L61-L143)

~~~csharp
    [Fact]
    public async Task Join_WhenGpaBelowOrMissing_ThrowsBR19_AndEqualSucceeds()
    {
        var room = await rooms.CreateAsync(courseId, new RoomProfileRequest("Team", null, null, 3.1m, null, []), default);
        SelectStudent(3);
        Assert.Equal("BR19", (await Assert.ThrowsAsync<BusinessRuleException>(() => rooms.JoinAsync(room.Id, default))).Code);
        var student = await db.Students.SingleAsync(x => x.UserId == userId);
        student.Gpa = null; await db.SaveChangesAsync();
        Assert.Equal("BR19", (await Assert.ThrowsAsync<BusinessRuleException>(() => rooms.JoinAsync(room.Id, default))).Code);
        SelectStudent(2);
        Assert.Equal(2, (await rooms.JoinAsync(room.Id, default)).MemberCount);
    }

    [Fact]
    public async Task Profile_WhenInvalidAndValid_ValidatesAndReturnsUpdatedData()
    {
        var role = await db.TeamRoles.FirstAsync();
        await Assert.ThrowsAsync<BadRequestException>(() => rooms.UpdateStudentProfileAsync(new(4.1m, [role.Id]), default));
        await Assert.ThrowsAsync<BadRequestException>(() => rooms.UpdateStudentProfileAsync(new(3m, [Guid.NewGuid()]), default));
        await Assert.ThrowsAsync<BadRequestException>(() => rooms.UpdateStudentProfileAsync(new(3m, [Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid()]), default));
        var result = await rooms.UpdateStudentProfileAsync(new(3.25m, [role.Id]), default);
        Assert.Equal(3.25m, result.Gpa); Assert.Equal(role.Id, Assert.Single(result.Roles).Id);
    }

    [Fact]
    public async Task Create_WhenDifferentCourses_AllowsBothAndRejectsSameCourse()
    {
        var first = await rooms.CreateAsync(courseId, default);
        var secondCourse = Guid.Parse("30000000-0000-0000-0000-000000000002");
        var second = await rooms.CreateAsync(secondCourse, default);
        Assert.NotEqual(first.Id, second.Id);
        Assert.Equal("BR05", (await Assert.ThrowsAsync<BusinessRuleException>(() => rooms.CreateAsync(courseId, default))).Code);
    }

    [Fact]
    public async Task CreateProfile_WhenInvalidOrNonLeader_RejectsRequests()
    {
        await Assert.ThrowsAsync<BadRequestException>(() => rooms.CreateAsync(courseId, new(null, null, null, 4.5m, null, []), default));
        await Assert.ThrowsAsync<BadRequestException>(() => rooms.CreateAsync(courseId, new(null, null, null, null, 11m, []), default));
        var role = await db.TeamRoles.FirstAsync();
        var created = await rooms.CreateAsync(courseId, new("Team", "Project", "Idea", 3m, 8m, [role.Id]), default);
        Assert.Equal("Team", created.Name); Assert.Equal(role.Id, Assert.Single(created.NeededRoles).Id);
        SelectStudent(2);
        Assert.Equal("NOT_ROOM_LEADER", (await Assert.ThrowsAsync<ForbiddenException>(() => rooms.UpdateProfileAsync(created.Id, new(null, null, null, null, null, []), default))).Code);
    }

    [Fact]
    public async Task Apply_WhenGpaBelowRequirement_CanBeApproved()
    {
        var room = await rooms.CreateAsync(courseId, new(null, null, null, 4m, null, []), default);
        var entity = await db.Rooms.SingleAsync(x => x.Id == room.Id); entity.Status = RoomStatus.Locked; await db.SaveChangesAsync();
        SelectStudent(2); var apply = await applies.CreateAsync(room.Id, "", default);
        SelectStudent(1); var approved = await applies.DecideAsync(apply.Id, true, default);
        Assert.Equal("Approved", approved.Status);
    }

    [Fact]
    public async Task Rooms_WhenCancelled_HiddenExceptForAdmin()
    {
        var room = await rooms.CreateAsync(courseId, default);
        await rooms.LeaveAsync(room.Id, default);
        user.Setup(x => x.IsInRole("Student")).Returns(true);
        var read = new TeamReadService(db, user.Object, rooms);
        Assert.Empty((await read.RoomsAsync(courseId, new RoomListQuery { Status = "Cancelled" }, default)).Items);
        await Assert.ThrowsAsync<NotFoundException>(() => rooms.GetAsync(room.Id, default));
        user.Setup(x => x.IsInRole("Student")).Returns(false);
        user.Setup(x => x.IsInRole("Lecturer")).Returns(true);
        Assert.Empty((await read.RoomsAsync(courseId, new RoomListQuery { Status = "Cancelled" }, default)).Items);
        user.Setup(x => x.IsInRole("Admin")).Returns(true);
        Assert.Single((await read.RoomsAsync(courseId, new RoomListQuery { Status = "Cancelled" }, default)).Items);
    }

    [Fact]
    public async Task Rooms_WhenFilteringGpaRolesAndName_ReturnsMatchingRoom()
    {
        var role = await db.TeamRoles.SingleAsync(x => x.Code == "BE");
        var created = await rooms.CreateAsync(courseId, new("Unique Team", null, null, 3m, 8m, [role.Id]), default);
        var read = new TeamReadService(db, user.Object, rooms);
        var result = await read.RoomsAsync(courseId, new RoomListQuery { Gpa = 3m, RoleIds = [Guid.NewGuid(), role.Id], Q = "Unique" }, default);
        Assert.Equal(created.Id, Assert.Single(result.Items).Id);
        Assert.Empty((await read.RoomsAsync(courseId, new RoomListQuery { Gpa = 2m }, default)).Items);
    }

~~~

### RoomServiceTests.cs

Ca ghi danh, giới hạn phòng và chuyển trạng thái.

[tests/TeamService.Tests/RoomServiceTests.cs dòng 161–250](../../tests/TeamService.Tests/RoomServiceTests.cs#L161-L250)

~~~csharp
    [Fact]
    public async Task Create_WhenEnrolled_CreatesRoomAndLeader()
    {
        var result = await rooms.CreateAsync(courseId, default);
        Assert.Equal("FA26-EXE101-R001", result.Code);
        Assert.Equal(result.LeaderId, Assert.Single(result.Members).StudentId);
        Assert.True(result.Members[0].IsLeader);
    }

    [Fact]
    public async Task CreateJoinApply_WhenNotEnrolled_ThrowsBR02()
    {
        var room = await rooms.CreateAsync(courseId, default);
        var entity = await db.Rooms.SingleAsync(x => x.Id == room.Id);
        var outsider = await db.Students.SingleAsync(x => x.UserId == Guid.Parse("10000000-0000-0000-0000-000000000012"));
        db.StudentInCourses.Remove(await db.StudentInCourses.SingleAsync(x => x.CourseId == courseId && x.StudentId == outsider.Id));
        await db.SaveChangesAsync();
        SelectStudent(12);
        Assert.Equal("BR02", (await Assert.ThrowsAsync<ForbiddenException>(() => rooms.CreateAsync(courseId, default))).Code);
        Assert.Equal("BR02", (await Assert.ThrowsAsync<ForbiddenException>(() => rooms.JoinAsync(room.Id, default))).Code);
        entity.Status = RoomStatus.Locked;
        await db.SaveChangesAsync();
        Assert.Equal("BR02", (await Assert.ThrowsAsync<ForbiddenException>(() => applies.CreateAsync(room.Id, "", default))).Code);
    }

    [Fact]
    public async Task CreateAndJoin_WhenAlreadyInRoom_ThrowsBR05()
    {
        var first = await rooms.CreateAsync(courseId, default);
        SelectStudent(2);
        var second = await rooms.CreateAsync(courseId, default);
        SelectStudent(1);
        Assert.Equal("BR05", (await Assert.ThrowsAsync<BusinessRuleException>(() => rooms.CreateAsync(courseId, default))).Code);
        Assert.Equal("BR05", (await Assert.ThrowsAsync<BusinessRuleException>(() => rooms.JoinAsync(second.Id, default))).Code);
        Assert.NotEqual(first.Id, second.Id);
    }

    [Fact]
    public async Task JoinAndLeave_WhenThresholdCrossed_LocksAndReopens()
    {
        var room = await rooms.CreateAsync(courseId, default);
        SelectStudent(6);
        await rooms.JoinAsync(room.Id, default);
        SelectStudent(8);
        var locked = await rooms.JoinAsync(room.Id, default);
        Assert.Equal("Locked", locked.Status);
        await rooms.LeaveAsync(room.Id, default);
        Assert.Equal(RoomStatus.Open, (await db.Rooms.SingleAsync(x => x.Id == room.Id)).Status);
    }

    [Fact]
    public async Task Join_WhenMajorAtLimit_ThrowsBR11()
    {
        var room = await rooms.CreateAsync(courseId, default);
        SelectStudent(2);
        await rooms.JoinAsync(room.Id, default);
        SelectStudent(3);
        await rooms.JoinAsync(room.Id, default);
        var entity = await db.Rooms.SingleAsync(x => x.Id == room.Id);
        entity.Status = RoomStatus.Open;
        await db.SaveChangesAsync();
        SelectStudent(4);
        Assert.Equal("BR11", (await Assert.ThrowsAsync<BusinessRuleException>(() => rooms.JoinAsync(room.Id, default))).Code);
    }

    [Fact]
    public async Task Join_WhenRoomFull_ThrowsBR11()
    {
        var type = await db.GroupTypes.SingleAsync();
        type.MaxMemberCount = 1;
        var room = await rooms.CreateAsync(courseId, default);
        SelectStudent(6);
        Assert.Equal("BR11", (await Assert.ThrowsAsync<BusinessRuleException>(() => rooms.JoinAsync(room.Id, default))).Code);
    }

    [Fact]
    public async Task Join_WhenOtherApplicationsPending_CancelsThem()
    {
        var target = await rooms.CreateAsync(courseId, default);
        SelectStudent(2);
        var other = await rooms.CreateAsync(courseId, default);
        var otherEntity = await db.Rooms.SingleAsync(x => x.Id == other.Id);
        otherEntity.Status = RoomStatus.Locked;
        await db.SaveChangesAsync();
        SelectStudent(6);
        var apply = await applies.CreateAsync(other.Id, "xin vào", default);
        await rooms.JoinAsync(target.Id, default);
        Assert.Equal(ApplyStatus.Cancelled, (await db.RoomApplies.SingleAsync(x => x.Id == apply.Id)).Status);
    }

~~~

### RoomServiceTests.cs

Ca hoàn tất khi cơ cấu không đạt hoặc đạt yêu cầu.

[tests/TeamService.Tests/RoomServiceTests.cs dòng 283–306](../../tests/TeamService.Tests/RoomServiceTests.cs#L283-L306)

~~~csharp
    [Fact]
    public async Task Complete_WhenUnsatisfied_ThrowsBR16()
    {
        var room = await rooms.CreateAsync(courseId, default);
        matching.Setup(x => x.AnalyzeCompositionAsync(It.IsAny<GroupTypeRule>(), It.IsAny<IReadOnlyList<string>>(), It.IsAny<CancellationToken>())).ReturnsAsync(Analysis(false));
        Assert.Equal("BR16", (await Assert.ThrowsAsync<BusinessRuleException>(() => rooms.CompleteAsync(room.Id, default))).Code);
    }

    [Fact]
    public async Task Complete_WhenSatisfied_CreatesGroupAndPreventsLeaving()
    {
        var room = await rooms.CreateAsync(courseId, default);
        SelectStudent(6);
        await rooms.JoinAsync(room.Id, default);
        SelectStudent(1);
        matching.Setup(x => x.AnalyzeCompositionAsync(It.IsAny<GroupTypeRule>(), It.IsAny<IReadOnlyList<string>>(), It.IsAny<CancellationToken>())).ReturnsAsync(Analysis(true));
        var group = await rooms.CompleteAsync(room.Id, default);
        Assert.Equal("FA26-EXE101-G001", group.Code);
        Assert.Equal(2, await db.StudentInGroups.CountAsync(x => x.GroupId == group.Id));
        Assert.Equal(RoomStatus.Completed, (await db.Rooms.SingleAsync(x => x.Id == room.Id)).Status);
        Assert.Equal("BR18", (await Assert.ThrowsAsync<BusinessRuleException>(() => rooms.LeaveAsync(room.Id, default))).Code);
    }

    [Fact]
~~~

### RoomServiceTests.cs

Ca thay đổi phòng đồng thời với hoàn tất.

[tests/TeamService.Tests/RoomServiceTests.cs dòng 332–349](../../tests/TeamService.Tests/RoomServiceTests.cs#L332-L349)

~~~csharp
    [Fact]
    public async Task Complete_WhenRoomChangesDuringAnalysis_ThrowsConcurrencyConflict()
    {
        var room = await rooms.CreateAsync(courseId, default);
        matching.Setup(x => x.AnalyzeCompositionAsync(It.IsAny<GroupTypeRule>(), It.IsAny<IReadOnlyList<string>>(), It.IsAny<CancellationToken>()))
            .Returns(async () =>
            {
                await using var other = new TeamDbContext(new DbContextOptionsBuilder<TeamDbContext>().UseSqlite(connection).Options);
                var changed = await other.Rooms.SingleAsync(x => x.Id == room.Id);
                changed.Version++;
                await other.SaveChangesAsync();
                return Analysis(true);
            });
        await Assert.ThrowsAsync<DbUpdateConcurrencyException>(() => rooms.CompleteAsync(room.Id, default));
        db.ChangeTracker.Clear();
        Assert.False(await db.Groups.AnyAsync(x => x.RoomId == room.Id));
        Assert.Equal(RoomStatus.Open, (await db.Rooms.SingleAsync(x => x.Id == room.Id)).Status);
    }
~~~

### CatalogTests.cs

Ca kiểm thử Course và danh mục.

[tests/TeamService.Tests/CatalogTests.cs dòng 56–108](../../tests/TeamService.Tests/CatalogTests.cs#L56-L108)

~~~csharp
    [Fact]
    public async Task Close_WhenForming_SendsEventAndChangesStatus()
    {
        var course = await db.Courses.SingleAsync(x => x.Code == "FA26-EXE101");
        var result = await courses.TransitionAsync(course.Id, false, default);
        Assert.Equal("Closed", result.Status);
        publisher.Verify(x => x.PublishAsync(It.Is<EventEnvelope>(e => e.Type == EventTypes.CourseClosed && e.Data[EventDataKeys.CourseCode] == "FA26-EXE101"), It.IsAny<CancellationToken>()), Times.Once);
        Assert.Equal("INVALID_COURSE_STATE", (await Assert.ThrowsAsync<BusinessRuleException>(() => courses.TransitionAsync(course.Id, false, default))).Code);
    }

    [Fact]
    public async Task Delete_WhenPlannedAndEnrolled_RemovesEnrollments()
    {
        var course = await db.Courses.SingleAsync(x => x.Code == "FA26-EXE201");
        course.Status = CourseStatus.Planned;
        await db.SaveChangesAsync();
        var student = await db.Students.FirstAsync();
        await courses.EnrollAsync(course.Id, [student.Id], default);
        await courses.DeleteAsync(course.Id, default);
        Assert.False(await db.Courses.AnyAsync(x => x.Id == course.Id));
        Assert.False(await db.StudentInCourses.AnyAsync(x => x.CourseId == course.Id));
    }

    [Fact]
    public async Task GroupType_WhenReplacingMajors_UpdatesExistingAndRemovesOmitted()
    {
        var type = await db.GroupTypes.Include(x => x.Majors).SingleAsync();
        var existing = type.Majors.Single().MajorId;
        var second = await db.Majors.Where(x => x.Code == "AI").Select(x => x.Id).SingleAsync();
        var result = await references.SaveGroupTypeAsync(null, new GroupTypeRequest("Khác", 2, 5, 2,
            [new(existing, 1, 2), new(second, 0, 2)]), default);
        result = await references.SaveGroupTypeAsync(result.Id, new GroupTypeRequest("Đổi", 2, 5, 2,
            [new(existing, 2, 3)]), default);
        Assert.Equal("Đổi", result.Name);
        Assert.Equal(2, Assert.Single(result.Majors).MinQuantity);
        Assert.Equal(existing, result.Majors[0].MajorId);
    }

    [Fact]
    public async Task GroupType_WhenDuplicateMajor_RejectsRequest()
    {
        var major = await db.Majors.Select(x => x.Id).FirstAsync();
        await Assert.ThrowsAsync<BadRequestException>(() => references.SaveGroupTypeAsync(null,
            new GroupTypeRequest("Nhóm", 1, 4, 1, [new(major, 1, 2), new(major, 1, 2)]), default));
    }

    [Fact]
    public async Task Lookups_WhenReferenced_RejectsDelete()
    {
        var semester = await db.Semesters.SingleAsync();
        Assert.Equal("IN_USE", (await Assert.ThrowsAsync<BusinessRuleException>(() => references.DeleteAsync("semesters", semester.Id, default))).Code);
        var page = await references.ListAsync("semesters", new PageQuery { Q = "FA26" }, default);
        Assert.Equal("FA26", Assert.Single(page.Items).Code);
~~~

### TeamDbTests.cs

Ràng buộc của DbContext.

[tests/TeamService.Tests/TeamDbTests.cs dòng 1–44](../../tests/TeamService.Tests/TeamDbTests.cs#L1-L44)

~~~csharp
using Exe.TeamService.Data;
using Exe.TeamService.Domain;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Exe.TeamService.Tests;

public class TeamDbTests
{
    [Fact]
    public async Task Seed_EmptyDatabase_CreatesExpectedCoursesAndStudents()
    {
        await using var connection = new SqliteConnection("DataSource=:memory:");
        await connection.OpenAsync();
        await using var db = new TeamDbContext(new DbContextOptionsBuilder<TeamDbContext>().UseSqlite(connection).Options);
        await db.Database.EnsureCreatedAsync();
        await TeamDbSeeder.SeedAsync(db);
        await TeamDbSeeder.SeedAsync(db);
        Assert.Equal(12, await db.Students.CountAsync());
        Assert.Equal(24, await db.StudentInCourses.CountAsync());
        Assert.Equal(CourseStatus.Forming, (await db.Courses.SingleAsync(x => x.Code == "FA26-EXE101")).Status);
        Assert.Equal(CourseStatus.Forming, (await db.Courses.SingleAsync(x => x.Code == "FA26-EXE201")).Status);
        Assert.Equal(2, await db.Courses.CountAsync());
    }

    [Fact]
    public async Task StudentInRoom_DuplicateCourseAndStudent_IsRejected()
    {
        await using var connection = new SqliteConnection("DataSource=:memory:");
        await connection.OpenAsync();
        await using var db = new TeamDbContext(new DbContextOptionsBuilder<TeamDbContext>().UseSqlite(connection).Options);
        await db.Database.EnsureCreatedAsync();
        await TeamDbSeeder.SeedAsync(db);
        var course = await db.Courses.SingleAsync(x => x.Code == "FA26-EXE101");
        var student = await db.Students.FirstAsync();
        var room1 = new Room { CourseId = course.Id, Code = "R1", LeaderId = student.Id, CreatedAt = DateTime.UtcNow };
        var room2 = new Room { CourseId = course.Id, Code = "R2", LeaderId = student.Id, CreatedAt = DateTime.UtcNow };
        db.Rooms.AddRange(room1, room2);
        db.StudentInRooms.Add(new StudentInRoom { Room = room1, StudentId = student.Id, CourseId = course.Id });
        await db.SaveChangesAsync();
        db.StudentInRooms.Add(new StudentInRoom { Room = room2, StudentId = student.Id, CourseId = course.Id });
        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
    }
}
~~~

### GrpcMatchingClientTests.cs

Kiểm thử adapter gRPC.

[tests/TeamService.Tests/Infrastructure/GrpcMatchingClientTests.cs dòng 15–66](../../tests/TeamService.Tests/Infrastructure/GrpcMatchingClientTests.cs#L15-L66)

~~~csharp
    [InlineData(StatusCode.Unavailable)]
    [InlineData(StatusCode.DeadlineExceeded)]
    public async Task Analyze_WhenRpcUnavailable_ThrowsServiceUnavailable(StatusCode code)
    {
        var grpc = new Mock<Proto.Matching.MatchingClient>();
        grpc.Setup(x => x.AnalyzeCompositionAsync(It.IsAny<Proto.AnalyzeCompositionRequest>(), It.IsAny<Metadata>(),
            It.IsAny<DateTime?>(), It.IsAny<CancellationToken>()))
            .Throws(new RpcException(new Status(code, "failed")));
        var service = new GrpcMatchingClient(grpc.Object);
        var error = await Assert.ThrowsAsync<ServiceUnavailableException>(() => service.AnalyzeCompositionAsync(Rule, ["SE"]));
        Assert.Equal("MATCHING_UNAVAILABLE", error.Code);
    }

    [Fact]
    public async Task Recommend_WhenRpcUnavailable_ThrowsServiceUnavailable()
    {
        var grpc = new Mock<Proto.Matching.MatchingClient>();
        grpc.Setup(x => x.RecommendRoomsAsync(It.IsAny<Proto.RecommendRoomsRequest>(), It.IsAny<Metadata>(),
            It.IsAny<DateTime?>(), It.IsAny<CancellationToken>()))
            .Throws(new RpcException(new Status(StatusCode.Unavailable, "failed")));
        var service = new GrpcMatchingClient(grpc.Object);
        var error = await Assert.ThrowsAsync<ServiceUnavailableException>(() => service.RecommendRoomsAsync(Rule, "SE", [], 5));
        Assert.Equal("MATCHING_UNAVAILABLE", error.Code);
    }

    [Fact]
    public async Task Analyze_WhenSuccessful_SendsDeadlineRuleAndMembers()
    {
        var grpc = new Mock<Proto.Matching.MatchingClient>();
        Proto.AnalyzeCompositionRequest? captured = null;
        DateTime? deadline = null;
        var response = new Proto.AnalyzeCompositionReply { Satisfied = true, MemberCount = 2, DistinctMajorCount = 2 };
        grpc.Setup(x => x.AnalyzeCompositionAsync(It.IsAny<Proto.AnalyzeCompositionRequest>(), It.IsAny<Metadata>(),
            It.IsAny<DateTime?>(), It.IsAny<CancellationToken>()))
            .Callback<Proto.AnalyzeCompositionRequest, Metadata, DateTime?, CancellationToken>((request, _, value, _) =>
            {
                captured = request;
                deadline = value;
            })
            .Returns(new AsyncUnaryCall<Proto.AnalyzeCompositionReply>(Task.FromResult(response), Task.FromResult(new Metadata()),
                () => Status.DefaultSuccess, () => new Metadata(), () => { }));
        var service = new GrpcMatchingClient(grpc.Object);
        var before = DateTime.UtcNow;
        var result = await service.AnalyzeCompositionAsync(Rule, ["SE", "AI"]);
        var after = DateTime.UtcNow;
        Assert.True(result.Satisfied);
        Assert.Equal(2, result.MemberCount);
        Assert.Equal(new[] { "SE", "AI" }, captured!.MemberMajorCodes);
        Assert.Equal(3, captured.Rule.MajorRules[0].MaxQuantity);
        Assert.InRange(deadline!.Value, before.AddSeconds(5), after.AddSeconds(5));
    }

~~~

### KafkaEventPublisherTests.cs

Kiểm thử mặt phát sự kiện.

[tests/TeamService.Tests/Infrastructure/KafkaEventPublisherTests.cs dòng 1–37](../../tests/TeamService.Tests/Infrastructure/KafkaEventPublisherTests.cs#L1-L37)

~~~csharp
using Confluent.Kafka;
using Exe.Contracts.Events;
using Exe.TeamService.Infrastructure.Messaging;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace Exe.TeamService.Tests.Infrastructure;

public class KafkaEventPublisherTests
{
    [Fact]
    public async Task Publish_WhenSuccessful_SendsKeyPayloadAndTypeHeader()
    {
        var producer = new Mock<IProducer<string, string>>();
        Message<string, string>? sent = null;
        producer.Setup(x => x.ProduceAsync(KafkaTopics.Events, It.IsAny<Message<string, string>>(), It.IsAny<CancellationToken>()))
            .Callback<string, Message<string, string>, CancellationToken>((_, message, _) => sent = message)
            .ReturnsAsync(new DeliveryResult<string, string>());
        var publisher = new KafkaEventPublisher(producer.Object, new ConfigurationBuilder().Build(), NullLogger<KafkaEventPublisher>.Instance);
        var envelope = new EventEnvelope { Type = EventTypes.RoomCreated, Data = new Dictionary<string, string> { [EventDataKeys.RoomCode] = "ROOM-1" } };
        await publisher.PublishAsync(envelope);
        Assert.NotNull(sent);
        Assert.Equal("ROOM-1", sent.Key);
        Assert.Equal(envelope.EventId, EventEnvelope.FromJson(sent.Value)!.EventId);
        Assert.Equal(envelope.Type, System.Text.Encoding.UTF8.GetString(sent.Headers.GetLastBytes(KafkaTopics.TypeHeader)));
    }

    [Fact]
    public async Task Publish_WhenProducerThrows_DoesNotThrow()
    {
        var producer = new Mock<IProducer<string, string>>();
        producer.Setup(x => x.ProduceAsync(It.IsAny<string>(), It.IsAny<Message<string, string>>(), It.IsAny<CancellationToken>())).ThrowsAsync(new InvalidOperationException());
        var publisher = new KafkaEventPublisher(producer.Object, new ConfigurationBuilder().Build(), NullLogger<KafkaEventPublisher>.Instance);
        await publisher.PublishAsync(new EventEnvelope { Type = EventTypes.RoomCreated });
    }
}
~~~
