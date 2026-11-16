namespace Exe.MatchingService.Services;

public sealed record MajorRuleModel(string Code, int Min, int Max);
public sealed record GroupRule(int MinMembers, int MaxMembers, int MinMajors, IReadOnlyList<MajorRuleModel> Majors);
public sealed record MajorGapModel(string Code, int Current, int Required);

public sealed record CompositionResult(
    int MemberCount,
    int MissingMembers,
    int DistinctMajors,
    int MissingMajors,
    IReadOnlyList<MajorGapModel> Missing,
    IReadOnlyList<MajorGapModel> Exceeding,
    IReadOnlyList<string> Violations)
{
    public bool Satisfied => Violations.Count == 0;
}

/// <summary>Validates room member composition against BR14 and BR15 rules.</summary>
public sealed class CompositionAnalyzer
{
    public CompositionResult Analyze(GroupRule rule, IReadOnlyList<string> members)
    {
        var counts = members
            .GroupBy(x => x, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.Count(), StringComparer.OrdinalIgnoreCase);

        int missingMembers = Math.Max(0, rule.MinMembers - members.Count);
        int missingMajors = Math.Max(0, rule.MinMajors - counts.Count);

        var missing = new List<MajorGapModel>();
        var exceeding = new List<MajorGapModel>();
        var violations = new List<string>();

        if (missingMembers > 0)
        {
            violations.Add($"BR14: thiếu {missingMembers} thành viên ({members.Count}/{rule.MinMembers}).");
        }
        if (members.Count > rule.MaxMembers)
        {
            violations.Add($"BR14: vượt số thành viên tối đa ({members.Count}/{rule.MaxMembers}).");
        }
        if (missingMajors > 0)
        {
            violations.Add($"BR14: thiếu {missingMajors} ngành ({counts.Count}/{rule.MinMajors}).");
        }

        foreach (var major in rule.Majors)
        {
            int count = counts.GetValueOrDefault(major.Code);
            if (count < major.Min)
            {
                missing.Add(new MajorGapModel(major.Code, count, major.Min));
                violations.Add($"BR15: ngành {major.Code} thiếu {major.Min - count} sinh viên ({count}/{major.Min}).");
            }
        }

        foreach (var major in rule.Majors)
        {
            int count = counts.GetValueOrDefault(major.Code);
            if (count > major.Max)
            {
                exceeding.Add(new MajorGapModel(major.Code, count, major.Max));
                violations.Add($"BR15: ngành {major.Code} vượt tối đa ({count}/{major.Max}).");
            }
        }

        return new CompositionResult(
            members.Count,
            missingMembers,
            counts.Count,
            missingMajors,
            missing,
            exceeding,
            violations);
    }
}
