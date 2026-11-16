using Exe.Contracts.Grpc;
using Grpc.Core;

namespace Exe.MatchingService.Services;

public sealed class MatchingGrpcService(MatchingMetrics metrics) : Matching.MatchingBase
{
    private static GroupRule Map(GroupTypeRule r) => new(
        r.MinMemberCount,
        r.MaxMemberCount,
        r.MinMajorCount,
        r.MajorRules.Select(x => new MajorRuleModel(x.MajorCode, x.MinQuantity, x.MaxQuantity)).ToList());

    public override Task<AnalyzeCompositionReply> AnalyzeComposition(AnalyzeCompositionRequest request, ServerCallContext context)
    {
        metrics.Request("AnalyzeComposition");
        if (request.Rule is null)
            throw new RpcException(new Status(StatusCode.InvalidArgument, "Thiếu quy tắc nhóm."));

        var r = new CompositionAnalyzer().Analyze(Map(request.Rule), request.MemberMajorCodes);
        metrics.Composition(r.Satisfied);
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
        metrics.Request("RecommendRooms");
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
