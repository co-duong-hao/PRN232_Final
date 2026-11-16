using Exe.MatchingService.Services;
using Grpc.Core;

namespace Exe.MatchingService.Tests;

public class MatchingTests
{
    private static readonly GroupRule Rule = new(4, 6, 3, [new("SE", 2, 3)]);

    [Fact]
    public async Task AnalyzeComposition_RecordsValidity()
    {
        using var capture = new MetricCapture(MatchingMetrics.MeterName);
        var service = new MatchingGrpcService(new MatchingMetrics(capture.Factory));
        var valid = new Exe.Contracts.Grpc.AnalyzeCompositionRequest
        {
            Rule = new() { MinMemberCount = 1, MaxMemberCount = 3, MinMajorCount = 1 }
        };
        valid.MemberMajorCodes.Add("SE");
        var invalid = new Exe.Contracts.Grpc.AnalyzeCompositionRequest
        {
            Rule = new() { MinMemberCount = 1, MaxMemberCount = 3, MinMajorCount = 1 }
        };

        await service.AnalyzeComposition(valid, null!);
        await service.AnalyzeComposition(invalid, null!);

        Assert.Equal(2, capture.Count("exe.matching.requests", ("method", "AnalyzeComposition")));
        Assert.Equal(1, capture.Count("exe.composition.checks", "valid"));
        Assert.Equal(1, capture.Count("exe.composition.checks", "invalid"));
    }

    [Fact]
    public async Task RecommendRooms_WhenCalled_RecordsRequestWithMethod()
    {
        using var capture = new MetricCapture(MatchingMetrics.MeterName);
        var service = new MatchingGrpcService(new MatchingMetrics(capture.Factory));
        await service.RecommendRooms(new Exe.Contracts.Grpc.RecommendRoomsRequest { Rule = new(), StudentMajorCode = "SE" }, null!);
        Assert.Equal(1, capture.Count("exe.matching.requests", "RecommendRooms"));
        Assert.Equal(1, capture.Count("exe.matching.requests"));
    }

    [Fact]
    public async Task AnalyzeComposition_WhenCalled_MapsAllReplyFieldsAndGaps()
    {
        using var capture = new MetricCapture(MatchingMetrics.MeterName);
        var service = new MatchingGrpcService(new MatchingMetrics(capture.Factory));
        var request = new Exe.Contracts.Grpc.AnalyzeCompositionRequest
        {
            Rule = new()
            {
                MinMemberCount = 5,
                MaxMemberCount = 6,
                MinMajorCount = 3,
                MajorRules =
                {
                    new Exe.Contracts.Grpc.MajorRule { MajorCode = "SE", MinQuantity = 2, MaxQuantity = 3 },
                    new Exe.Contracts.Grpc.MajorRule { MajorCode = "GD", MinQuantity = 0, MaxQuantity = 1 }
                }
            },
            MemberMajorCodes = { "SE", "GD", "gd" }
        };

        var reply = await service.AnalyzeComposition(request, null!);

        Assert.False(reply.Satisfied);
        Assert.Equal(3, reply.MemberCount);
        Assert.Equal(2, reply.MissingMemberCount);
        Assert.Equal(2, reply.DistinctMajorCount);
        Assert.Equal(1, reply.MissingMajorCount);
        var missing = Assert.Single(reply.MissingMajors);
        Assert.Equal("SE", missing.MajorCode);
        Assert.Equal(1, missing.Current);
        Assert.Equal(2, missing.Required);
        var exceeding = Assert.Single(reply.ExceedingMajors);
        Assert.Equal("GD", exceeding.MajorCode);
        Assert.Equal(2, exceeding.Current);
        Assert.Equal(1, exceeding.Required);
        Assert.Equal(4, reply.Violations.Count);
    }

    [Fact]
    public async Task AnalyzeComposition_WhenRuleMissing_ThrowsInvalidArgumentWithoutCompositionMetric()
    {
        using var capture = new MetricCapture(MatchingMetrics.MeterName);
        var service = new MatchingGrpcService(new MatchingMetrics(capture.Factory));

        var ex = await Assert.ThrowsAsync<RpcException>(() =>
            service.AnalyzeComposition(new Exe.Contracts.Grpc.AnalyzeCompositionRequest(), null!));

        Assert.Equal(StatusCode.InvalidArgument, ex.StatusCode);
        Assert.Equal(1, capture.Count("exe.matching.requests", ("method", "AnalyzeComposition")));
        Assert.Equal(0, capture.Count("exe.composition.checks"));
    }

    [Fact]
    public async Task RecommendRooms_WhenCalled_MapsRecommendationsWithCanJoinTrue()
    {
        using var capture = new MetricCapture(MatchingMetrics.MeterName);
        var service = new MatchingGrpcService(new MatchingMetrics(capture.Factory));
        var request = new Exe.Contracts.Grpc.RecommendRoomsRequest
        {
            Rule = new()
            {
                MinMemberCount = 4,
                MaxMemberCount = 6,
                MinMajorCount = 3,
                MajorRules = { new Exe.Contracts.Grpc.MajorRule { MajorCode = "SE", MinQuantity = 2, MaxQuantity = 3 } }
            },
            StudentMajorCode = "SE",
            Limit = 5
        };
        request.Rooms.Add(new Exe.Contracts.Grpc.RoomSnapshot
        {
            RoomId = "r-1",
            RoomCode = "FA26-EXE101-R001",
            Status = "Open",
            MemberMajorCodes = { "GD" }
        });

        var reply = await service.RecommendRooms(request, null!);

        var item = Assert.Single(reply.Recommendations);
        Assert.Equal("r-1", item.RoomId);
        Assert.Equal("FA26-EXE101-R001", item.RoomCode);
        Assert.Equal(92, item.Score);
        Assert.True(item.CanJoin);
        Assert.Equal(4, item.Reasons.Count);
    }

    [Theory]
    [InlineData(true, "SE")]
    [InlineData(false, "")]
    [InlineData(false, "   ")]
    public async Task RecommendRooms_WhenRuleOrMajorMissing_ThrowsInvalidArgumentAndCountsRequest(bool nullRule, string major)
    {
        using var capture = new MetricCapture(MatchingMetrics.MeterName);
        var service = new MatchingGrpcService(new MatchingMetrics(capture.Factory));
        var request = new Exe.Contracts.Grpc.RecommendRoomsRequest
        {
            Rule = nullRule ? null : new(),
            StudentMajorCode = major
        };

        var ex = await Assert.ThrowsAsync<RpcException>(() => service.RecommendRooms(request, null!));

        Assert.Equal(StatusCode.InvalidArgument, ex.StatusCode);
        Assert.Equal(1, capture.Count("exe.matching.requests", ("method", "RecommendRooms")));
    }

    [Theory]
    [InlineData("SE,SE,GD,MKT", true, 0)]
    [InlineData("SE,SE,GD", false, 2)]
    [InlineData("SE,GD,MKT,AI", false, 1)]
    [InlineData("SE,SE,SE,SE,GD,MKT", false, 1)]
    public void Analyze_Examples_ReturnExpected(string input, bool satisfied, int count)
    {
        var result = new CompositionAnalyzer().Analyze(Rule, input.Split(','));
        Assert.Equal(satisfied, result.Satisfied);
        Assert.Equal(count, result.Violations.Count);
    }

    [Fact]
    public void Analyze_AllViolations_AreOrdered()
    {
        var r = new CompositionAnalyzer().Analyze(new(8, 3, 3, [new("SE", 2, 3), new("GD", 0, 0)]), ["se", "GD", "gd", "gd"]);
        Assert.Equal(new[]
        {
            "BR14: thiếu 4 thành viên (4/8).",
            "BR14: vượt số thành viên tối đa (4/3).",
            "BR14: thiếu 1 ngành (2/3).",
            "BR15: ngành SE thiếu 1 sinh viên (1/2).",
            "BR15: ngành GD vượt tối đa (3/0)."
        }, r.Violations);
    }

    [Fact]
    public void Analyze_WhenEmptyMembers_ReportsAllMissingCountsAndViolations()
    {
        var result = new CompositionAnalyzer().Analyze(Rule, []);

        Assert.False(result.Satisfied);
        Assert.Equal(0, result.MemberCount);
        Assert.Equal(4, result.MissingMembers);
        Assert.Equal(0, result.DistinctMajors);
        Assert.Equal(3, result.MissingMajors);
        Assert.Equal(new MajorGapModel("SE", 0, 2), Assert.Single(result.Missing));
        Assert.Empty(result.Exceeding);
        Assert.Equal(new[]
        {
            "BR14: thiếu 4 thành viên (0/4).",
            "BR14: thiếu 3 ngành (0/3).",
            "BR15: ngành SE thiếu 2 sinh viên (0/2)."
        }, result.Violations);
    }

    [Fact]
    public void Analyze_WhenAtExactMinAndMaxBoundaries_ReturnsSatisfiedWithNoGaps()
    {
        var analyzer = new CompositionAnalyzer();
        var atMin = analyzer.Analyze(Rule, ["se", "SE", "gd", "mkt"]);
        var atMax = analyzer.Analyze(Rule, ["SE", "se", "SE", "GD", "MKT", "AI"]);

        Assert.True(atMin.Satisfied);
        Assert.Equal(0, atMin.MissingMembers);
        Assert.Equal(0, atMin.MissingMajors);
        Assert.Empty(atMin.Missing);
        Assert.Empty(atMin.Exceeding);

        Assert.True(atMax.Satisfied);
        Assert.Equal(6, atMax.MemberCount);
        Assert.Equal(4, atMax.DistinctMajors);
        Assert.Empty(atMax.Violations);
    }

    [Fact]
    public void Analyze_WhenOptionalMajorHasZeroMembers_DoesNotReportMissing()
    {
        var rule = new GroupRule(3, 5, 2, [new("SE", 1, 3), new("AI", 0, 2)]);
        var result = new CompositionAnalyzer().Analyze(rule, ["SE", "SE", "GD"]);

        Assert.True(result.Satisfied);
        Assert.Empty(result.Missing);
        Assert.Empty(result.Exceeding);
    }

    [Fact]
    public void Analyze_WhenMultipleMajorsMissingAndExceeding_PopulatesGapsAndViolationsInOrder()
    {
        var rule = new GroupRule(4, 6, 3, [new("SE", 2, 3), new("GD", 1, 2), new("AI", 1, 1)]);
        var result = new CompositionAnalyzer().Analyze(rule, ["SE", "AI", "ai", "MKT"]);

        Assert.False(result.Satisfied);
        Assert.Equal([new MajorGapModel("SE", 1, 2), new MajorGapModel("GD", 0, 1)], result.Missing);
        Assert.Equal([new MajorGapModel("AI", 2, 1)], result.Exceeding);
        Assert.Equal(new[]
        {
            "BR15: ngành SE thiếu 1 sinh viên (1/2).",
            "BR15: ngành GD thiếu 1 sinh viên (0/1).",
            "BR15: ngành AI vượt tối đa (2/1)."
        }, result.Violations);
    }

    [Fact]
    public void Recommend_FiltersScoresSortsAndLimits()
    {
        var rooms = new[]
        {
            new RoomModel("1", "B", "Open", ["GD"]),
            new RoomModel("2", "A", "Open", ["gd"]),
            new RoomModel("3", "Full", "Open", ["SE", "SE", "SE"]),
            new RoomModel("4", "Max", "Open", ["A", "B", "C", "D", "E", "F"])
        };
        var result = new RoomRecommender().Recommend(Rule, "se", rooms, 1);
        var item = Assert.Single(result);
        Assert.Equal("A", item.Code);
        Assert.Equal(92, item.Score);
        Assert.Equal(4, item.Reasons.Count);
        Assert.Contains("Phòng đang thiếu ngành SE.", item.Reasons);
    }

    [Fact]
    public void Recommend_WhenRoomAtMaxMembersOrMajorAtMax_ExcludesRoom()
    {
        var rooms = new[]
        {
            new RoomModel("1", "R-FullMembers", "Open", ["GD", "MKT", "AI", "BA", "SE", "SE"]),
            new RoomModel("2", "R-FullMajor", "Open", ["se", "SE", "se", "GD"]),
            new RoomModel("3", "R-Eligible", "Open", ["SE", "GD"])
        };

        var result = new RoomRecommender().Recommend(Rule, "SE", rooms, 10);

        var item = Assert.Single(result);
        Assert.Equal("R-Eligible", item.Code);
    }

    [Fact]
    public void Recommend_WhenStudentMajorHasNoRule_ScoresDiversityOpenAndSizeWithoutMajorBonus()
    {
        var rooms = new[]
        {
            new RoomModel("1", "R-NeedsDiversity", "Open", ["SE", "GD"]),
            new RoomModel("2", "R-AlreadyHasMajor", "Open", ["SE", "AI"]),
            new RoomModel("3", "R-AlreadyMinMajors", "Open", ["SE", "GD", "MKT"])
        };

        var result = new RoomRecommender().Recommend(Rule, "AI", rooms, 10);

        Assert.Equal(["R-NeedsDiversity", "R-AlreadyMinMajors", "R-AlreadyHasMajor"], result.Select(x => x.Code).ToArray());
        Assert.Equal(44, result[0].Score); // 30 (new major & <3) + 10 (Open) + 4 (2*2)
        Assert.Equal(["Thêm bạn giúp phòng đủ số ngành.", "Vào trực tiếp, không cần duyệt.", "Phòng đã có 2 thành viên."], result[0].Reasons);
        Assert.Equal(16, result[1].Score); // 10 (Open) + 6 (3*2) — already has 3 distinct majors
        Assert.Equal(14, result[2].Score); // 10 (Open) + 4 (2*2) — already has AI
    }

    [Fact]
    public void Recommend_WhenRoomIsLocked_OmitsOpenBonusAndStillRecommends()
    {
        var rooms = new[] { new RoomModel("1", "R-Locked", "Locked", ["SE", "GD", "MKT"]) };

        var result = new RoomRecommender().Recommend(Rule, "SE", rooms, 5);

        var item = Assert.Single(result);
        Assert.Equal(56, item.Score); // 50 (SE < 2) + 6 (3*2); no +30 (already has SE & 3 majors); no +10 (Locked)
        Assert.Equal(["Phòng đang thiếu ngành SE.", "Phòng đã có 3 thành viên."], item.Reasons);
    }

    [Fact]
    public void Recommend_WhenMemberCountExceedsMinMembers_CapsSizeBonusAtMinMembersTimesTwo()
    {
        var rooms = new[] { new RoomModel("1", "R-FiveMembers", "Locked", ["SE", "GD", "MKT", "AI", "BA"]) };

        var result = new RoomRecommender().Recommend(Rule, "SE", rooms, 5);

        var item = Assert.Single(result);
        Assert.Equal(58, item.Score); // 50 (SE < 2) + min(5, 4)*2 = 8
        Assert.Contains("Phòng đã có 5 thành viên.", item.Reasons);
    }

    [Fact]
    public void Recommend_WhenScoresTie_SortsByRoomCodeAscending()
    {
        var rooms = new[]
        {
            new RoomModel("3", "R-003", "Open", ["GD"]),
            new RoomModel("1", "R-001", "Open", ["MKT"]),
            new RoomModel("2", "R-002", "Open", ["AI"])
        };

        var result = new RoomRecommender().Recommend(Rule, "SE", rooms, 5);

        Assert.Equal(["R-001", "R-002", "R-003"], result.Select(x => x.Code).ToArray());
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-3)]
    public void Recommend_WhenLimitZeroOrNegative_DefaultsToFive(int limit)
    {
        var rooms = Enumerable.Range(1, 7)
            .Select(i => new RoomModel(i.ToString(), $"R-{i:000}", "Open", ["GD"]))
            .ToArray();

        var result = new RoomRecommender().Recommend(Rule, "SE", rooms, limit);

        Assert.Equal(5, result.Count);
        Assert.Equal(["R-001", "R-002", "R-003", "R-004", "R-005"], result.Select(x => x.Code).ToArray());
    }
}
