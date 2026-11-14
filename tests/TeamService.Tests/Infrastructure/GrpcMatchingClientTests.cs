using Exe.Shared.Web.Errors;
using Exe.TeamService.Abstractions;
using Exe.TeamService.Infrastructure.Matching;
using Grpc.Core;
using Moq;
using Proto = Exe.Contracts.Grpc;

namespace Exe.TeamService.Tests.Infrastructure;

public sealed class GrpcMatchingClientTests
{
    private static readonly GroupTypeRule Rule = new(4, 6, 3, [new MajorRule("SE", 2, 3)]);

    [Theory]
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

    [Fact]
    public async Task Recommend_WhenSuccessful_MapsSnapshotsAndRecommendations()
    {
        var grpc = new Mock<Proto.Matching.MatchingClient>();
        var id = Guid.NewGuid();
        Proto.RecommendRoomsRequest? captured = null;
        var response = new Proto.RecommendRoomsReply();
        response.Recommendations.Add(new Proto.RoomRecommendation { RoomId = id.ToString(), RoomCode = "R1", Score = 42, CanJoin = true, Reasons = { "reason" } });
        grpc.Setup(x => x.RecommendRoomsAsync(It.IsAny<Proto.RecommendRoomsRequest>(), It.IsAny<Metadata>(),
            It.IsAny<DateTime?>(), It.IsAny<CancellationToken>()))
            .Callback<Proto.RecommendRoomsRequest, Metadata, DateTime?, CancellationToken>((request, _, _, _) => captured = request)
            .Returns(new AsyncUnaryCall<Proto.RecommendRoomsReply>(Task.FromResult(response), Task.FromResult(new Metadata()),
                () => Status.DefaultSuccess, () => new Metadata(), () => { }));
        var service = new GrpcMatchingClient(grpc.Object);
        var result = await service.RecommendRoomsAsync(Rule, "AI", [new RoomSnapshot(id, "R1", "Locked", ["SE"])], 7);
        var item = Assert.Single(result);
        Assert.Equal(id, item.RoomId);
        Assert.Equal("R1", item.RoomCode);
        Assert.Equal(42, item.Score);
        Assert.True(item.CanJoin);
        Assert.Equal("reason", Assert.Single(item.Reasons));
        Assert.Equal("AI", captured!.StudentMajorCode);
        Assert.Equal(7, captured.Limit);
        Assert.Equal("Locked", Assert.Single(captured.Rooms).Status);
        Assert.Equal("SE", Assert.Single(captured.Rooms[0].MemberMajorCodes));
    }
    [Fact]
    public async Task Analyze_WhenInvalidArgument_PropagatesOriginalRpcException()
    {
        var grpc = new Mock<Proto.Matching.MatchingClient>();
        grpc.Setup(x => x.AnalyzeCompositionAsync(It.IsAny<Proto.AnalyzeCompositionRequest>(), It.IsAny<Metadata>(),
            It.IsAny<DateTime?>(), It.IsAny<CancellationToken>()))
            .Throws(new RpcException(new Status(StatusCode.InvalidArgument, "invalid")));
        var service = new GrpcMatchingClient(grpc.Object);
        var error = await Assert.ThrowsAsync<RpcException>(() => service.AnalyzeCompositionAsync(Rule, []));
        Assert.Equal(StatusCode.InvalidArgument, error.StatusCode);
    }

}
