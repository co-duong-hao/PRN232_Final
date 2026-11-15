using Exe.TeamService.Infrastructure.Caching;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace Exe.TeamService.Tests;

internal static class TestCache
{
    public static ITeamCache Create() => new TeamCache(new MemoryDistributedCache(Options.Create(new MemoryDistributedCacheOptions())), NullLogger<TeamCache>.Instance);
}

