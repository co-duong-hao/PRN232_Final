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
