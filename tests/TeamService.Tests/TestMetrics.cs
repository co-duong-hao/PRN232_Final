using Exe.TeamService.Infrastructure;
using Microsoft.Extensions.DependencyInjection;

namespace Exe.TeamService.Tests;

internal static class TestMetrics
{
    private static readonly ServiceProvider Provider = new ServiceCollection().AddMetrics().BuildServiceProvider();
    public static TeamMetrics Create() => new(Provider.GetRequiredService<System.Diagnostics.Metrics.IMeterFactory>());
}
