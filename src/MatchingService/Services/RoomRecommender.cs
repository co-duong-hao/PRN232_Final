namespace Exe.MatchingService.Services;

public sealed record RoomModel(string Id, string Code, string Status, IReadOnlyList<string> Members);
public sealed record Recommendation(string Id, string Code, int Score, IReadOnlyList<string> Reasons);

/// <summary>Scores and ranks joinable rooms for a student's major.</summary>
public sealed class RoomRecommender
{
    public IReadOnlyList<Recommendation> Recommend(GroupRule rule, string major, IReadOnlyList<RoomModel> rooms, int limit)
    {
        var result = new List<Recommendation>();
        var majorRule = rule.Majors.FirstOrDefault(x => string.Equals(x.Code, major, StringComparison.OrdinalIgnoreCase));

        foreach (var room in rooms)
        {
            int count = room.Members.Count(x => string.Equals(x, major, StringComparison.OrdinalIgnoreCase));
            if (room.Members.Count >= rule.MaxMembers || (majorRule is not null && count >= majorRule.Max))
            {
                continue;
            }

            int score = 0;
            var reasons = new List<string>();

            if (majorRule is not null && count < majorRule.Min)
            {
                score += 50;
                reasons.Add($"Phòng đang thiếu ngành {majorRule.Code}.");
            }
            if (count == 0 && room.Members.Distinct(StringComparer.OrdinalIgnoreCase).Count() < rule.MinMajors)
            {
                score += 30;
                reasons.Add("Thêm bạn giúp phòng đủ số ngành.");
            }
            if (string.Equals(room.Status, "Open", StringComparison.OrdinalIgnoreCase))
            {
                score += 10;
                reasons.Add("Vào trực tiếp, không cần duyệt.");
            }

            score += Math.Min(room.Members.Count, rule.MinMembers) * 2;
            reasons.Add($"Phòng đã có {room.Members.Count} thành viên.");

            result.Add(new Recommendation(room.Id, room.Code, score, reasons));
        }

        return result
            .OrderByDescending(x => x.Score)
            .ThenBy(x => x.Code, StringComparer.Ordinal)
            .Take(limit <= 0 ? 5 : limit)
            .ToList();
    }
}
