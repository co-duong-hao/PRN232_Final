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
