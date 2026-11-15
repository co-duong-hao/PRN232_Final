using Exe.TeamService.Infrastructure.Caching;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace Exe.TeamService.Tests.Infrastructure;

public class TeamCacheTests
{
    [Fact]
    public async Task GetOrCreate_AfterRemoval_MissesAgain()
    {
        var cache = TestCache.Create();
        var calls = 0;
        Task<int> Factory(CancellationToken _) => Task.FromResult(++calls);
        Assert.Equal((1, false), await cache.GetOrCreateAsync("key", TimeSpan.FromMinutes(1), Factory, default));
        Assert.Equal((1, true), await cache.GetOrCreateAsync("key", TimeSpan.FromMinutes(1), Factory, default));
        await cache.RemoveAsync("key", default);
        Assert.Equal((2, false), await cache.GetOrCreateAsync("key", TimeSpan.FromMinutes(1), Factory, default));
    }

    [Fact]
    public async Task GetOrCreate_WhenCacheFails_ReturnsFactoryValue()
    {
        var distributed = new Mock<IDistributedCache>();
        distributed.Setup(x => x.GetAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).ThrowsAsync(new InvalidOperationException());
        distributed.Setup(x => x.SetAsync(It.IsAny<string>(), It.IsAny<byte[]>(), It.IsAny<DistributedCacheEntryOptions>(), It.IsAny<CancellationToken>())).ThrowsAsync(new InvalidOperationException());
        var cache = new TeamCache(distributed.Object, NullLogger<TeamCache>.Instance);
        Assert.Equal((42, false), await cache.GetOrCreateAsync("key", TimeSpan.FromMinutes(1), _ => Task.FromResult(42), default));
    }
}
