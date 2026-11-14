using Exe.Contracts.Grpc;

namespace Exe.MatchingService.Services;

/// <summary>
/// gRPC endpoint for matching.proto. T1 overrides AnalyzeComposition and RecommendRooms here;
/// until then both answer UNIMPLEMENTED.
/// </summary>
public sealed class MatchingGrpcService : Matching.MatchingBase
{
}
