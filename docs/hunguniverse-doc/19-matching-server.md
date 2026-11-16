# Phân tích cơ cấu và gợi ý phòng

Tài liệu tham chiếu cho PRN232 Final v0.4 tại commit 2e3789f.

[Mục lục bộ tài liệu](01-architecture.md)

## Cách hoạt động

MatchingService chạy không lưu trạng thái. Quy tắc phân tích cơ cấu và danh sách mã ngành được gửi cùng mỗi yêu cầu.

Cơ cấu không đạt có thể do thiếu người, thiếu số ngành hoặc vượt giới hạn từng ngành. Response chứa lý do để giao diện hiển thị.

Gợi ý phòng xếp hạng các ứng viên và trả lý do. Hoàn tất nhóm là thao tác ghi dữ liệu phía TeamService sau khi có kết quả phân tích đạt.

## Cách kiểm tra

1. So sánh `[SE, SE, AI]` với `[SE, SE, AI, GD]` theo quy định mẫu.
2. Gọi API `/composition` trước và sau khi thêm người thứ tư để quan sát khác biệt.

## Đối chiếu mã nguồn

Các trích đoạn dưới đây hỗ trợ tra cứu. Đường dẫn mở phần tương ứng trong repo.

### MatchingGrpcService.cs

Chuyển request gRPC sang thao tác phân tích hoặc gợi ý.

[src/MatchingService/Services/MatchingGrpcService.cs dòng 1–65](../../src/MatchingService/Services/MatchingGrpcService.cs#L1-L65)

~~~csharp
using Exe.Contracts.Grpc;
using Grpc.Core;

namespace Exe.MatchingService.Services;

public sealed class MatchingGrpcService : Matching.MatchingBase
{
    private static GroupRule Map(GroupTypeRule r) => new(
        r.MinMemberCount,
        r.MaxMemberCount,
        r.MinMajorCount,
        r.MajorRules.Select(x => new MajorRuleModel(x.MajorCode, x.MinQuantity, x.MaxQuantity)).ToList());

    public override Task<AnalyzeCompositionReply> AnalyzeComposition(AnalyzeCompositionRequest request, ServerCallContext context)
    {
        if (request.Rule is null)
            throw new RpcException(new Status(StatusCode.InvalidArgument, "Thiếu quy tắc nhóm."));

        var r = new CompositionAnalyzer().Analyze(Map(request.Rule), request.MemberMajorCodes);
        var reply = new AnalyzeCompositionReply
        {
            Satisfied = r.Satisfied,
            MemberCount = r.MemberCount,
            MissingMemberCount = r.MissingMembers,
            DistinctMajorCount = r.DistinctMajors,
            MissingMajorCount = r.MissingMajors
        };
        reply.MissingMajors.AddRange(r.Missing.Select(x => new MajorGap
        {
            MajorCode = x.Code,
            Current = x.Current,
            Required = x.Required
        }));
        reply.ExceedingMajors.AddRange(r.Exceeding.Select(x => new MajorGap
        {
            MajorCode = x.Code,
            Current = x.Current,
            Required = x.Required
        }));
        reply.Violations.AddRange(r.Violations);
        return Task.FromResult(reply);
    }

    public override Task<RecommendRoomsReply> RecommendRooms(RecommendRoomsRequest request, ServerCallContext context)
    {
        if (request.Rule is null || string.IsNullOrWhiteSpace(request.StudentMajorCode))
            throw new RpcException(new Status(StatusCode.InvalidArgument, "Thiếu quy tắc nhóm hoặc ngành sinh viên."));

        var rooms = request.Rooms.Select(x => new RoomModel(x.RoomId, x.RoomCode, x.Status, x.MemberMajorCodes)).ToList();
        var reply = new RecommendRoomsReply();
        foreach (var r in new RoomRecommender().Recommend(Map(request.Rule), request.StudentMajorCode, rooms, request.Limit))
        {
            var item = new RoomRecommendation
            {
                RoomId = r.Id,
                RoomCode = r.Code,
                Score = r.Score,
                CanJoin = true
            };
            item.Reasons.AddRange(r.Reasons);
            reply.Recommendations.Add(item);
        }
        return Task.FromResult(reply);
    }
}
~~~

### CompositionAnalyzer.cs

Áp dụng BR14 và BR15.

[src/MatchingService/Services/CompositionAnalyzer.cs dòng 1–22](../../src/MatchingService/Services/CompositionAnalyzer.cs#L1-L22)

~~~csharp
namespace Exe.MatchingService.Services;

public sealed record MajorRuleModel(string Code, int Min, int Max);
public sealed record GroupRule(int MinMembers, int MaxMembers, int MinMajors, IReadOnlyList<MajorRuleModel> Majors);
public sealed record MajorGapModel(string Code, int Current, int Required);
public sealed record CompositionResult(int MemberCount, int MissingMembers, int DistinctMajors, int MissingMajors, IReadOnlyList<MajorGapModel> Missing, IReadOnlyList<MajorGapModel> Exceeding, IReadOnlyList<string> Violations)
{ public bool Satisfied => Violations.Count == 0; }
public sealed class CompositionAnalyzer
{
    public CompositionResult Analyze(GroupRule rule, IReadOnlyList<string> members)
    {
        var counts = members.GroupBy(x => x, StringComparer.OrdinalIgnoreCase).ToDictionary(g => g.Key, g => g.Count(), StringComparer.OrdinalIgnoreCase);
        int missingMembers = Math.Max(0, rule.MinMembers - members.Count), missingMajors = Math.Max(0, rule.MinMajors - counts.Count);
        var missing = new List<MajorGapModel>(); var exceeding = new List<MajorGapModel>(); var violations = new List<string>();
        if (missingMembers > 0) violations.Add($"BR14: thiếu {missingMembers} thành viên ({members.Count}/{rule.MinMembers}).");
        if (members.Count > rule.MaxMembers) violations.Add($"BR14: vượt số thành viên tối đa ({members.Count}/{rule.MaxMembers}).");
        if (missingMajors > 0) violations.Add($"BR14: thiếu {missingMajors} ngành ({counts.Count}/{rule.MinMajors}).");
        foreach (var m in rule.Majors) { int n = counts.GetValueOrDefault(m.Code); if (n < m.Min) { missing.Add(new(m.Code,n,m.Min)); violations.Add($"BR15: ngành {m.Code} thiếu {m.Min-n} sinh viên ({n}/{m.Min})."); } }
        foreach (var m in rule.Majors) { int n = counts.GetValueOrDefault(m.Code); if (n > m.Max) { exceeding.Add(new(m.Code,n,m.Max)); violations.Add($"BR15: ngành {m.Code} vượt tối đa ({n}/{m.Max})."); } }
        return new(members.Count,missingMembers,counts.Count,missingMajors,missing,exceeding,violations);
    }
}
~~~

### RoomRecommender.cs

Tính điểm và xếp hạng phòng.

[src/MatchingService/Services/RoomRecommender.cs dòng 1–22](../../src/MatchingService/Services/RoomRecommender.cs#L1-L22)

~~~csharp
namespace Exe.MatchingService.Services;
public sealed record RoomModel(string Id, string Code, string Status, IReadOnlyList<string> Members);
public sealed record Recommendation(string Id, string Code, int Score, IReadOnlyList<string> Reasons);
public sealed class RoomRecommender
{
    public IReadOnlyList<Recommendation> Recommend(GroupRule rule, string major, IReadOnlyList<RoomModel> rooms, int limit)
    {
        var result = new List<Recommendation>();
        var majorRule = rule.Majors.FirstOrDefault(x => string.Equals(x.Code,major,StringComparison.OrdinalIgnoreCase));
        foreach (var room in rooms) {
            int count = room.Members.Count(x => string.Equals(x,major,StringComparison.OrdinalIgnoreCase));
            if (room.Members.Count >= rule.MaxMembers || (majorRule is not null && count >= majorRule.Max)) continue;
            int score = 0; var reasons = new List<string>();
            if (majorRule is not null && count < majorRule.Min) { score += 50; reasons.Add($"Phòng đang thiếu ngành {major}."); }
            if (count == 0 && room.Members.Distinct(StringComparer.OrdinalIgnoreCase).Count() < rule.MinMajors) { score += 30; reasons.Add("Thêm bạn giúp phòng đủ số ngành."); }
            if (string.Equals(room.Status,"Open",StringComparison.OrdinalIgnoreCase)) { score += 10; reasons.Add("Vào trực tiếp, không cần duyệt."); }
            score += Math.Min(room.Members.Count, rule.MinMembers)*2; reasons.Add($"Phòng đã có {room.Members.Count} thành viên.");
            result.Add(new(room.Id,room.Code,score,reasons));
        }
        return result.OrderByDescending(x => x.Score).ThenBy(x => x.Code, StringComparer.Ordinal).Take(limit <= 0 ? 5 : limit).ToList();
    }
}
~~~

### RoomService.cs

Đọc cơ cấu, hoàn tất nhóm và xin gợi ý phòng.

[src/TeamService/Services/RoomService.cs dòng 310–385](../../src/TeamService/Services/RoomService.cs#L310-L385)

~~~csharp
    private async Task CheckViewAsync(Room room, CancellationToken ct)
    {
        if (user.IsInRole(Roles.Student) && !user.IsInRole(Roles.Admin) && !user.IsInRole(Roles.HeadOfDepartment) && !user.IsInRole(Roles.Lecturer))
        {
            var student = await CurrentStudentAsync(ct);
            await CheckEnrollmentAsync(room.CourseId, student.Id, ct);
        }
    }

    public async Task<RoomDto> GetAsync(Guid roomId, CancellationToken ct)
    {
        var room = await LoadRoomAsync(roomId, ct);
        if (room.Status == RoomStatus.Cancelled && !user.IsInRole(Roles.Admin)) throw new NotFoundException("Không tìm thấy phòng.");
        await CheckViewAsync(room, ct);
        return Map(room);
    }

    public async Task<CompositionAnalysis> CompositionAsync(Guid roomId, CancellationToken ct)
    {
        var room = await LoadRoomAsync(roomId, ct);
        await CheckViewAsync(room, ct);
        return await matching.AnalyzeCompositionAsync(await CachedRuleAsync(room.Course.GroupTypeId, ct), room.Members.Select(x => x.Student.Major.Code).ToArray(), ct);
    }

    public async Task<GroupDto> CompleteAsync(Guid roomId, CancellationToken ct)
    {
        var room = await LoadRoomAsync(roomId, ct);
        CheckForming(room.Course);
        var student = await CurrentStudentAsync(ct);
        await CheckEnrollmentAsync(room.CourseId, student.Id, ct);
        CheckLeader(room, student);
        CheckActive(room);
        var analysis = await matching.AnalyzeCompositionAsync(await CachedRuleAsync(room.Course.GroupTypeId, ct), room.Members.Select(x => x.Student.Major.Code).ToArray(), ct);
        if (!analysis.Satisfied)
        {
            throw new BusinessRuleException("BR16", "Phòng chưa thỏa cơ cấu nhóm: " + string.Join(" ", analysis.Violations));
        }
        var groupCode = room.Code[..room.Code.LastIndexOf("-R", StringComparison.Ordinal)] + "-G" + room.Code[(room.Code.LastIndexOf("-R", StringComparison.Ordinal) + 2)..];
        var group = new Group { CourseId = room.CourseId, RoomId = room.Id, GroupTypeId = room.Course.GroupTypeId, Code = groupCode, Name = room.Name ?? groupCode, CreatedAt = DateTime.UtcNow };
        foreach (var member in room.Members)
        {
            group.Members.Add(new StudentInGroup { StudentId = member.StudentId, IsLeader = member.StudentId == room.LeaderId });
        }
        db.Groups.Add(group);
        room.Status = RoomStatus.Completed;
        room.Version++;
        var applies = await db.RoomApplies.Where(x => x.RoomId == roomId && x.Status == ApplyStatus.Pending).ToListAsync(ct);
        foreach (var apply in applies)
        {
            apply.Status = ApplyStatus.Cancelled;
        }
        await db.SaveChangesAsync(ct);
        await InvalidateStatsAsync(room.CourseId, ct);
        await publisher.PublishAsync(RoomEventFactory.Create(EventTypes.RoomCompleted, room, room.Members.Select(x => x.Student),
            (EventDataKeys.GroupCode, groupCode)), ct);
        return new GroupDto(group.Id, group.Code, group.Name, room.CourseId, room.Course.Code, room.Id, group.GroupTypeId,
            room.Course.GroupType.Name, group.CreatedAt, room.Members.Select(x => new GroupMemberDto(x.StudentId, x.Student.StudentCode,
                x.Student.FullName, x.Student.Major.Code, x.StudentId == room.LeaderId)).ToArray());
    }

    public async Task<IReadOnlyList<RoomRecommendation>> RecommendAsync(Guid courseId, int limit, CancellationToken ct)
    {
        var student = await CurrentStudentAsync(ct);
        var course = await db.Courses.Include(x => x.GroupType).ThenInclude(x => x.Majors).ThenInclude(x => x.Major)
            .SingleOrDefaultAsync(x => x.Id == courseId, ct) ?? throw new NotFoundException("Không tìm thấy Course.");
        await CheckEnrollmentAsync(courseId, student.Id, ct);
        if (await db.StudentInRooms.AnyAsync(x => x.CourseId == courseId && x.StudentId == student.Id, ct))
        {
            return [];
        }
        var rooms = await db.Rooms.Where(x => x.CourseId == courseId && (x.Status == RoomStatus.Open || x.Status == RoomStatus.Locked))
            .Include(x => x.Members).ThenInclude(x => x.Student).ThenInclude(x => x.Major).ToListAsync(ct);
        var snapshots = rooms.Select(x => new RoomSnapshot(x.Id, x.Code, x.Status.ToString(), x.Members.Select(m => m.Student.Major.Code).ToArray())).ToArray();
        return await matching.RecommendRoomsAsync(await CachedRuleAsync(course.GroupTypeId, ct), student.Major.Code, snapshots, limit, ct);
    }
}
~~~
