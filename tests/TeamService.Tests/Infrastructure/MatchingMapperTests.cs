using Exe.TeamService.Abstractions;
using Exe.TeamService.Infrastructure.Matching;
using Proto = Exe.Contracts.Grpc;

namespace Exe.TeamService.Tests.Infrastructure;

public sealed class MatchingMapperTests
{
    [Fact]
    public void GroupTypeRule_WhenMappedBothWays_PreservesAllFields()
    {
        var original = new GroupTypeRule(4, 6, 3, [new MajorRule("SE", 2, 3), new MajorRule("AI", 0, 2)]);
        var proto = MatchingMapper.ToProto(original);
        Assert.Equal(4, proto.MinMemberCount);
        Assert.Equal(6, proto.MaxMemberCount);
        Assert.Equal(3, proto.MinMajorCount);
        Assert.Equal("SE", proto.MajorRules[0].MajorCode);
        Assert.Equal(2, proto.MajorRules[0].MinQuantity);
        Assert.Equal(3, proto.MajorRules[0].MaxQuantity);
        Assert.Equal("AI", proto.MajorRules[1].MajorCode);
        var roundTrip = MatchingMapper.FromProto(proto);
        Assert.Equal(original.MinMemberCount, roundTrip.MinMemberCount);
        Assert.Equal(original.MaxMemberCount, roundTrip.MaxMemberCount);
        Assert.Equal(original.MinMajorCount, roundTrip.MinMajorCount);
        Assert.Equal(original.MajorRules, roundTrip.MajorRules);
    }

    [Fact]
    public void CompositionAnalysis_WhenMappedBothWays_PreservesAllFields()
    {
        var original = new CompositionAnalysis(false, 7, 1, 2, 1,
            [new MajorGap("SE", 1, 2)], [new MajorGap("AI", 4, 3)], ["thiếu", "vượt"]);
        var proto = MatchingMapper.ToProto(original);
        Assert.False(proto.Satisfied);
        Assert.Equal(7, proto.MemberCount);
        Assert.Equal(1, proto.MissingMemberCount);
        Assert.Equal(2, proto.DistinctMajorCount);
        Assert.Equal(1, proto.MissingMajorCount);
        Assert.Equal(new Proto.MajorGap { MajorCode = "SE", Current = 1, Required = 2 }, Assert.Single(proto.MissingMajors));
        Assert.Equal(new Proto.MajorGap { MajorCode = "AI", Current = 4, Required = 3 }, Assert.Single(proto.ExceedingMajors));
        Assert.Equal(original.Violations, proto.Violations);
        var roundTrip = MatchingMapper.FromProto(proto);
        Assert.Equal(original.Satisfied, roundTrip.Satisfied);
        Assert.Equal(original.MemberCount, roundTrip.MemberCount);
        Assert.Equal(original.MissingMemberCount, roundTrip.MissingMemberCount);
        Assert.Equal(original.DistinctMajorCount, roundTrip.DistinctMajorCount);
        Assert.Equal(original.MissingMajorCount, roundTrip.MissingMajorCount);
        Assert.Equal(original.MissingMajors, roundTrip.MissingMajors);
        Assert.Equal(original.ExceedingMajors, roundTrip.ExceedingMajors);
        Assert.Equal(original.Violations, roundTrip.Violations);
    }
}
