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
