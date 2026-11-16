using Exe.MatchingService.Services;
namespace Exe.MatchingService.Tests;
public class MatchingTests {
 [Fact] public async Task AnalyzeComposition_RecordsValidity() {
  using var capture = new MetricCapture("Exe.MatchingService");
  var service = new MatchingGrpcService(new MatchingMetrics(capture.Factory));
  var valid = new Exe.Contracts.Grpc.AnalyzeCompositionRequest { Rule = new() { MinMemberCount = 1, MaxMemberCount = 3, MinMajorCount = 1 } }; valid.MemberMajorCodes.Add("SE");
  var invalid = new Exe.Contracts.Grpc.AnalyzeCompositionRequest { Rule = new() { MinMemberCount = 1, MaxMemberCount = 3, MinMajorCount = 1 } };
  await service.AnalyzeComposition(valid, null!); await service.AnalyzeComposition(invalid, null!);
  Assert.Equal(1, capture.Count("exe.composition.checks", "valid"));
  Assert.Equal(1, capture.Count("exe.composition.checks", "invalid"));
 }

 [Fact] public async Task RecommendRooms_WhenCalled_RecordsRequestWithMethod() {
  using var capture = new MetricCapture("Exe.MatchingService");
  var service = new MatchingGrpcService(new MatchingMetrics(capture.Factory));
  await service.RecommendRooms(new Exe.Contracts.Grpc.RecommendRoomsRequest { Rule = new(), StudentMajorCode = "SE" }, null!);
  Assert.Equal(1, capture.Count("exe.matching.requests", "RecommendRooms"));
  Assert.Equal(1, capture.Count("exe.matching.requests"));
 }

 private static readonly GroupRule Rule=new(4,6,3,[new("SE",2,3)]);
 [Theory]
 [InlineData("SE,SE,GD,MKT",true,0)] [InlineData("SE,SE,GD",false,2)] [InlineData("SE,GD,MKT,AI",false,1)] [InlineData("SE,SE,SE,SE,GD,MKT",false,1)]
 public void Analyze_Examples_ReturnExpected(string input,bool satisfied,int count) { var result=new CompositionAnalyzer().Analyze(Rule,input.Split(',')); Assert.Equal(satisfied,result.Satisfied); Assert.Equal(count,result.Violations.Count); }
 [Fact] public void Analyze_AllViolations_AreOrdered() { var r=new CompositionAnalyzer().Analyze(new(8,3,3,[new("SE",2,3),new("GD",0,0)]),["se","GD","gd","gd"]); Assert.Equal(new[]{"BR14: thiếu 4 thành viên (4/8).","BR14: vượt số thành viên tối đa (4/3).","BR14: thiếu 1 ngành (2/3).","BR15: ngành SE thiếu 1 sinh viên (1/2).","BR15: ngành GD vượt tối đa (3/0)."},r.Violations); }
 [Fact] public void Recommend_FiltersScoresSortsAndLimits() { var rooms=new[] { new RoomModel("1","B","Open",["GD"]),new RoomModel("2","A","Open",["gd"]),new RoomModel("3","Full","Open",["SE","SE","SE"]),new RoomModel("4","Max","Open",["A","B","C","D","E","F"]) }; var result=new RoomRecommender().Recommend(Rule,"se",rooms,1); var item=Assert.Single(result); Assert.Equal("A",item.Code); Assert.Equal(92,item.Score); Assert.Equal(4,item.Reasons.Count); }
}
