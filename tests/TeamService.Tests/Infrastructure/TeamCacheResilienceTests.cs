using System.Text;
using Exe.TeamService.Infrastructure.Caching;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace Exe.TeamService.Tests.Infrastructure;

public sealed class TeamCacheResilienceTests
{
    private static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(2);
    private readonly Mock<IDistributedCache> distributed = new(MockBehavior.Strict);

    private TeamCache Cache() => new(distributed.Object, NullLogger<TeamCache>.Instance);

    [Theory]
    [InlineData("not JSON")]
    [InlineData("null")]
    [InlineData("{\"Count\":\"wrong-type\"}")]
    public async Task UnusableEntryIsRebuiltAndOverwritten(string corrupt)
    {
        const string key = "course:example:stats";
        distributed.Setup(d => d.GetAsync(key, CancellationToken.None))
            .ReturnsAsync(Encoding.UTF8.GetBytes(corrupt));
        byte[]? replacement = null;
        distributed.Setup(d => d.SetAsync(key, It.IsAny<byte[]>(), It.IsAny<DistributedCacheEntryOptions>(), CancellationToken.None))
            .Callback<string, byte[], DistributedCacheEntryOptions, CancellationToken>((_, bytes, _, _) => replacement = bytes)
            .Returns(Task.CompletedTask);
        var expected = new StatsSnapshot(4, "Locked");

        var (value, hit) = await Cache().GetOrCreateAsync(key, Lifetime, _ => Task.FromResult(expected), CancellationToken.None);

        Assert.Same(expected, value);
        Assert.False(hit);
        Assert.NotNull(replacement);
        Assert.Equal(expected, System.Text.Json.JsonSerializer.Deserialize<StatsSnapshot>(replacement!));
        distributed.Verify(d => d.SetAsync(key, It.IsAny<byte[]>(),
            It.Is<DistributedCacheEntryOptions>(entry => entry.AbsoluteExpirationRelativeToNow == Lifetime),
            CancellationToken.None), Times.Once);
    }

    [Fact]
    public async Task ValidEntrySkipsFactoryAndLeavesExpiryAlone()
    {
        const string key = "course:example:stats";
        var cached = new StatsSnapshot(4, "Locked");
        distributed.Setup(d => d.GetAsync(key, CancellationToken.None))
            .ReturnsAsync(System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(cached));

        var (value, hit) = await Cache().GetOrCreateAsync<StatsSnapshot>(
            key, Lifetime, _ => throw new InvalidOperationException("Factory should not run"), CancellationToken.None);

        Assert.True(hit);
        Assert.Equal(cached, value);
        distributed.Verify(d => d.GetAsync(key, CancellationToken.None), Times.Once);
        distributed.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task FactoryFailureDoesNotCreateAnEntry()
    {
        const string key = "course:example:stats";
        distributed.Setup(d => d.GetAsync(key, CancellationToken.None)).ReturnsAsync((byte[]?)null);
        var failure = new InvalidOperationException("SQL is unavailable");

        var observed = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            Cache().GetOrCreateAsync<StatsSnapshot>(key, Lifetime, _ => Task.FromException<StatsSnapshot>(failure),
                CancellationToken.None));

        Assert.Same(failure, observed);
        distributed.Verify(d => d.GetAsync(key, CancellationToken.None), Times.Once);
        distributed.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task CacheMissPassesCallerTokenToFactoryAndWrite()
    {
        const string key = "course:example:stats";
        using var cancellation = new CancellationTokenSource();
        distributed.Setup(d => d.GetAsync(key, cancellation.Token)).ReturnsAsync((byte[]?)null);
        distributed.Setup(d => d.SetAsync(key, It.IsAny<byte[]>(), It.IsAny<DistributedCacheEntryOptions>(), cancellation.Token))
            .Returns(Task.CompletedTask);

        var result = await Cache().GetOrCreateAsync(key, Lifetime, token =>
        {
            Assert.Equal(cancellation.Token, token);
            return Task.FromResult(new StatsSnapshot(3, "Open"));
        }, cancellation.Token);

        Assert.False(result.Hit);
        Assert.Equal(new StatsSnapshot(3, "Open"), result.Value);
        distributed.VerifyAll();
    }

    [Fact]
    public async Task CancellationDuringReadDoesNotRunFactory()
    {
        const string key = "course:example:stats";
        using var cancellation = new CancellationTokenSource();
        await cancellation.CancelAsync();
        distributed.Setup(d => d.GetAsync(key, cancellation.Token)).Returns(Task.FromCanceled<byte[]?>(cancellation.Token));
        var invoked = false;

        var error = await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            Cache().GetOrCreateAsync(key, Lifetime, _ =>
            {
                invoked = true;
                return Task.FromResult(4);
            }, cancellation.Token));

        Assert.Equal(cancellation.Token, error.CancellationToken);
        Assert.False(invoked);
        distributed.Verify(d => d.GetAsync(key, cancellation.Token), Times.Once);
        distributed.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task CancellationDuringWriteIsNotReportedAsSuccessfulMiss()
    {
        const string key = "course:example:stats";
        using var cancellation = new CancellationTokenSource();
        distributed.Setup(d => d.GetAsync(key, cancellation.Token)).ReturnsAsync((byte[]?)null);
        distributed.Setup(d => d.SetAsync(key, It.IsAny<byte[]>(), It.IsAny<DistributedCacheEntryOptions>(), cancellation.Token))
            .Returns(() =>
            {
                cancellation.Cancel();
                return Task.FromCanceled(cancellation.Token);
            });

        var error = await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            Cache().GetOrCreateAsync(key, Lifetime, _ => Task.FromResult(4), cancellation.Token));

        Assert.Equal(cancellation.Token, error.CancellationToken);
        distributed.VerifyAll();
    }

    [Fact]
    public async Task RedisFailureDoesNotPreventBestEffortRemoval()
    {
        const string key = "course:example:stats";
        distributed.Setup(d => d.RemoveAsync(key, CancellationToken.None)).ThrowsAsync(new IOException("Redis unavailable"));

        await Cache().RemoveAsync(key, CancellationToken.None);

        distributed.Verify(d => d.RemoveAsync(key, CancellationToken.None), Times.Once);
        distributed.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task CancelledRemovalPropagatesCancellation()
    {
        const string key = "course:example:stats";
        using var cancellation = new CancellationTokenSource();
        await cancellation.CancelAsync();
        distributed.Setup(d => d.RemoveAsync(key, cancellation.Token)).Returns(Task.FromCanceled(cancellation.Token));

        var error = await Assert.ThrowsAnyAsync<OperationCanceledException>(() => Cache().RemoveAsync(key, cancellation.Token));

        Assert.Equal(cancellation.Token, error.CancellationToken);
        distributed.Verify(d => d.RemoveAsync(key, cancellation.Token), Times.Once);
    }

    private sealed record StatsSnapshot(int Count, string Status);
}
