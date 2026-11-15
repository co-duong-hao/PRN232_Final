using System.Text.Json;
using Microsoft.Extensions.Caching.Distributed;

namespace Exe.TeamService.Infrastructure.Caching;

public interface ITeamCache
{
    Task<(T Value, bool Hit)> GetOrCreateAsync<T>(string key, TimeSpan lifetime, Func<CancellationToken, Task<T>> factory, CancellationToken ct);
    Task RemoveAsync(string key, CancellationToken ct);
}

public sealed class TeamCache(IDistributedCache cache, ILogger<TeamCache> logger) : ITeamCache
{
    public async Task<(T Value, bool Hit)> GetOrCreateAsync<T>(string key, TimeSpan lifetime, Func<CancellationToken, Task<T>> factory, CancellationToken ct)
    {
        try
        {
            var json = await cache.GetStringAsync(key, ct);
            if (json is not null)
            {
                var value = JsonSerializer.Deserialize<T>(json);
                if (value is not null)
                {
                    logger.LogDebug("Cache hit {Key}", key);
                    return (value, true);
                }
            }
        }
        catch (Exception ex) when (!ct.IsCancellationRequested) { logger.LogWarning(ex, "Cache read failed {Key}", key); }
        logger.LogDebug("Cache miss {Key}", key);
        var result = await factory(ct);
        try { await cache.SetStringAsync(key, JsonSerializer.Serialize(result), new DistributedCacheEntryOptions { AbsoluteExpirationRelativeToNow = lifetime }, ct); }
        catch (Exception ex) when (!ct.IsCancellationRequested) { logger.LogWarning(ex, "Cache write failed {Key}", key); }
        return (result, false);
    }

    public async Task RemoveAsync(string key, CancellationToken ct)
    {
        try { await cache.RemoveAsync(key, ct); }
        catch (Exception ex) when (!ct.IsCancellationRequested) { logger.LogWarning(ex, "Cache removal failed {Key}", key); }
    }
}

public static class TeamCacheKeys
{
    public static string GroupType(Guid id) => $"grouptype:{id}";
    public static string CourseStats(Guid id) => $"course:{id}:stats";
}
