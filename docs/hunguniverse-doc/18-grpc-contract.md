# Hợp đồng và client gRPC

Tài liệu tham chiếu cho PRN232 Final v0.4 tại commit 2e3789f.

[Mục lục bộ tài liệu](01-architecture.md)

## Cách hoạt động

TeamService và MatchingService sinh kiểu C# từ `matching.proto`. Service gọi truyền bản chụp cơ cấu phòng và quy tắc loại nhóm.

`AnalyzeComposition` trả trạng thái đạt và danh sách vi phạm. `RecommendRooms` trả thứ hạng, điểm và lý do gợi ý.

Adapter gRPC quy định thời hạn 5 giây và chuyển `Unavailable` hoặc `DeadlineExceeded` thành mã lỗi nghiệp vụ hạ tầng.

## Cách kiểm tra

1. Theo từ `RoomService.CompleteAsync()` vào client và đọc trường `MemberMajorCodes` trong request.
2. Đối chiếu lỗi gRPC gián đoạn với mã HTTP do adapter và middleware trả về.

## Đối chiếu mã nguồn

Các trích đoạn dưới đây hỗ trợ tra cứu. Đường dẫn mở phần tương ứng trong repo.

### Exe.Contracts.csproj

Cấu hình tạo client và server từ Protocol Buffers.

[src/Shared/Contracts/Exe.Contracts.csproj dòng 1–14](../../src/Shared/Contracts/Exe.Contracts.csproj#L1-L14)

~~~xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <RootNamespace>Exe.Contracts</RootNamespace>
    <AssemblyName>Exe.Contracts</AssemblyName>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Google.Protobuf" />
    <PackageReference Include="Grpc.Net.Client" />
    <PackageReference Include="Grpc.Tools" PrivateAssets="All" />
  </ItemGroup>
  <ItemGroup>
    <Protobuf Include="Protos\matching.proto" GrpcServices="Both" />
  </ItemGroup>
</Project>
~~~

### matching.proto

Hai RPC và các kiểu dữ liệu qua mạng.

[src/Shared/Contracts/Protos/matching.proto dòng 1–80](../../src/Shared/Contracts/Protos/matching.proto#L1-L80)

~~~protobuf
syntax = "proto3";

option csharp_namespace = "Exe.Contracts.Grpc";

package exe.matching.v1;

// Stateless service: every call carries all the data it needs.
// Semantics are specified in docs/design/matching.md.
service Matching {
  // Checks a room's composition against BR14 and BR15.
  rpc AnalyzeComposition (AnalyzeCompositionRequest) returns (AnalyzeCompositionReply);
  // Ranks the rooms a student could join.
  rpc RecommendRooms (RecommendRoomsRequest) returns (RecommendRoomsReply);
}

message MajorRule {
  string major_code = 1;
  int32 min_quantity = 2;
  int32 max_quantity = 3;
}

message GroupTypeRule {
  int32 min_member_count = 1;
  int32 max_member_count = 2;
  int32 min_major_count = 3;
  repeated MajorRule major_rules = 4;
}

message AnalyzeCompositionRequest {
  GroupTypeRule rule = 1;
  // One entry per member: the member's major code.
  repeated string member_major_codes = 2;
}

message MajorGap {
  string major_code = 1;
  int32 current = 2;
  // For a missing major: the minimum. For an exceeding major: the maximum.
  int32 required = 3;
}

message AnalyzeCompositionReply {
  bool satisfied = 1;
  int32 member_count = 2;
  int32 missing_member_count = 3;
  int32 distinct_major_count = 4;
  int32 missing_major_count = 5;
  repeated MajorGap missing_majors = 6;
  repeated MajorGap exceeding_majors = 7;
  // Human-readable reasons, each prefixed with the rule code, e.g. "BR14: ...".
  repeated string violations = 8;
}

message RoomSnapshot {
  string room_id = 1;
  string room_code = 2;
  // "Open" or "Locked".
  string status = 3;
  repeated string member_major_codes = 4;
}

message RecommendRoomsRequest {
  GroupTypeRule rule = 1;
  string student_major_code = 2;
  repeated RoomSnapshot rooms = 3;
  // Maximum number of results; values <= 0 mean 5.
  int32 limit = 4;
}

message RoomRecommendation {
  string room_id = 1;
  string room_code = 2;
  int32 score = 3;
  bool can_join = 4;
  repeated string reasons = 5;
}

message RecommendRoomsReply {
  repeated RoomRecommendation recommendations = 1;
}
~~~

### IMatchingClient.cs

Giao diện TeamService gọi và record miền nghiệp vụ.

[src/TeamService/Abstractions/IMatchingClient.cs dòng 1–42](../../src/TeamService/Abstractions/IMatchingClient.cs#L1-L42)

~~~csharp
namespace Exe.TeamService.Abstractions;

/// <summary>Limits for one major inside a GroupType (BR15).</summary>
public sealed record MajorRule(string MajorCode, int MinQuantity, int MaxQuantity);

/// <summary>A GroupType flattened for Matching Service (BR14 + BR15).</summary>
public sealed record GroupTypeRule(
    int MinMemberCount, int MaxMemberCount, int MinMajorCount, IReadOnlyList<MajorRule> MajorRules);

/// <summary><c>Required</c> is the minimum for a missing major and the maximum for an exceeding one.</summary>
public sealed record MajorGap(string MajorCode, int Current, int Required);

public sealed record CompositionAnalysis(
    bool Satisfied,
    int MemberCount,
    int MissingMemberCount,
    int DistinctMajorCount,
    int MissingMajorCount,
    IReadOnlyList<MajorGap> MissingMajors,
    IReadOnlyList<MajorGap> ExceedingMajors,
    IReadOnlyList<string> Violations);

/// <summary><c>Status</c> is "Open" or "Locked".</summary>
public sealed record RoomSnapshot(Guid RoomId, string RoomCode, string Status, IReadOnlyList<string> MemberMajorCodes);

public sealed record RoomRecommendation(Guid RoomId, string RoomCode, int Score, bool CanJoin, IReadOnlyList<string> Reasons);

/// <summary>
/// Team Service's view of Matching Service (gRPC). Kept free of generated gRPC types so the domain
/// and its tests do not depend on the transport. Semantics: docs/design/matching.md.
/// Implementations throw <c>ServiceUnavailableException</c> (code MATCHING_UNAVAILABLE) when the
/// service cannot be reached.
/// </summary>
public interface IMatchingClient
{
    Task<CompositionAnalysis> AnalyzeCompositionAsync(
        GroupTypeRule rule, IReadOnlyList<string> memberMajorCodes, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<RoomRecommendation>> RecommendRoomsAsync(
        GroupTypeRule rule, string studentMajorCode, IReadOnlyList<RoomSnapshot> rooms, int limit,
        CancellationToken cancellationToken = default);
}
~~~

### GrpcMatchingClient.cs

Ánh xạ request, đặt thời hạn và xử lý lỗi.

[src/TeamService/Infrastructure/Matching/GrpcMatchingClient.cs dòng 1–49](../../src/TeamService/Infrastructure/Matching/GrpcMatchingClient.cs#L1-L49)

~~~csharp
using Exe.Shared.Web.Errors;
using Exe.TeamService.Abstractions;
using Grpc.Core;
using Proto = Exe.Contracts.Grpc;

namespace Exe.TeamService.Infrastructure.Matching;

public sealed class GrpcMatchingClient(Proto.Matching.MatchingClient client) : IMatchingClient
{
    public async Task<CompositionAnalysis> AnalyzeCompositionAsync(
        GroupTypeRule rule, IReadOnlyList<string> memberMajorCodes, CancellationToken cancellationToken = default)
    {
        var request = new Proto.AnalyzeCompositionRequest { Rule = MatchingMapper.ToProto(rule) };
        request.MemberMajorCodes.AddRange(memberMajorCodes);
        try
        {
            var reply = await client.AnalyzeCompositionAsync(request, deadline: DateTime.UtcNow.AddSeconds(5),
                cancellationToken: cancellationToken).ResponseAsync;
            return MatchingMapper.FromProto(reply);
        }
        catch (RpcException ex) when (ex.StatusCode is StatusCode.Unavailable or StatusCode.DeadlineExceeded)
        {
            throw new ServiceUnavailableException("Dịch vụ ghép nhóm không phản hồi.", "MATCHING_UNAVAILABLE");
        }
    }

    public async Task<IReadOnlyList<RoomRecommendation>> RecommendRoomsAsync(
        GroupTypeRule rule, string studentMajorCode, IReadOnlyList<RoomSnapshot> rooms, int limit,
        CancellationToken cancellationToken = default)
    {
        var request = new Proto.RecommendRoomsRequest
        {
            Rule = MatchingMapper.ToProto(rule),
            StudentMajorCode = studentMajorCode,
            Limit = limit
        };
        request.Rooms.AddRange(rooms.Select(MatchingMapper.ToProto));
        try
        {
            var reply = await client.RecommendRoomsAsync(request, deadline: DateTime.UtcNow.AddSeconds(5),
                cancellationToken: cancellationToken).ResponseAsync;
            return reply.Recommendations.Select(MatchingMapper.FromProto).ToArray();
        }
        catch (RpcException ex) when (ex.StatusCode is StatusCode.Unavailable or StatusCode.DeadlineExceeded)
        {
            throw new ServiceUnavailableException("Dịch vụ ghép nhóm không phản hồi.", "MATCHING_UNAVAILABLE");
        }
    }
}
~~~

### MatchingMapper.cs

Chuyển giữa model C# và protobuf.

[src/TeamService/Infrastructure/Matching/MatchingMapper.cs dòng 1–82](../../src/TeamService/Infrastructure/Matching/MatchingMapper.cs#L1-L82)

~~~csharp
using Exe.TeamService.Abstractions;
using Proto = Exe.Contracts.Grpc;

namespace Exe.TeamService.Infrastructure.Matching;

public static class MatchingMapper
{
    public static Proto.GroupTypeRule ToProto(GroupTypeRule rule)
    {
        var result = new Proto.GroupTypeRule
        {
            MinMemberCount = rule.MinMemberCount,
            MaxMemberCount = rule.MaxMemberCount,
            MinMajorCount = rule.MinMajorCount
        };
        result.MajorRules.AddRange(rule.MajorRules.Select(x => new Proto.MajorRule
        {
            MajorCode = x.MajorCode,
            MinQuantity = x.MinQuantity,
            MaxQuantity = x.MaxQuantity
        }));
        return result;
    }

    public static GroupTypeRule FromProto(Proto.GroupTypeRule rule)
    {
        return new GroupTypeRule(rule.MinMemberCount, rule.MaxMemberCount, rule.MinMajorCount,
            rule.MajorRules.Select(x => new MajorRule(x.MajorCode, x.MinQuantity, x.MaxQuantity)).ToArray());
    }

    public static Proto.AnalyzeCompositionReply ToProto(CompositionAnalysis analysis)
    {
        var result = new Proto.AnalyzeCompositionReply
        {
            Satisfied = analysis.Satisfied,
            MemberCount = analysis.MemberCount,
            MissingMemberCount = analysis.MissingMemberCount,
            DistinctMajorCount = analysis.DistinctMajorCount,
            MissingMajorCount = analysis.MissingMajorCount
        };
        result.MissingMajors.AddRange(analysis.MissingMajors.Select(ToProto));
        result.ExceedingMajors.AddRange(analysis.ExceedingMajors.Select(ToProto));
        result.Violations.AddRange(analysis.Violations);
        return result;
    }

    public static CompositionAnalysis FromProto(Proto.AnalyzeCompositionReply reply)
    {
        return new CompositionAnalysis(reply.Satisfied, reply.MemberCount, reply.MissingMemberCount,
            reply.DistinctMajorCount, reply.MissingMajorCount,
            reply.MissingMajors.Select(FromProto).ToArray(), reply.ExceedingMajors.Select(FromProto).ToArray(),
            reply.Violations.ToArray());
    }

    private static Proto.MajorGap ToProto(MajorGap gap)
    {
        return new Proto.MajorGap { MajorCode = gap.MajorCode, Current = gap.Current, Required = gap.Required };
    }

    private static MajorGap FromProto(Proto.MajorGap gap)
    {
        return new MajorGap(gap.MajorCode, gap.Current, gap.Required);
    }

    public static Proto.RoomSnapshot ToProto(RoomSnapshot room)
    {
        var result = new Proto.RoomSnapshot
        {
            RoomId = room.RoomId.ToString(),
            RoomCode = room.RoomCode,
            Status = room.Status
        };
        result.MemberMajorCodes.AddRange(room.MemberMajorCodes);
        return result;
    }

    public static RoomRecommendation FromProto(Proto.RoomRecommendation recommendation)
    {
        return new RoomRecommendation(Guid.Parse(recommendation.RoomId), recommendation.RoomCode,
            recommendation.Score, recommendation.CanJoin, recommendation.Reasons.ToArray());
    }
}
~~~
