using System.Diagnostics.Metrics;
namespace Exe.AuthService;
public sealed class AuthMetrics(IMeterFactory factory)
{
    private readonly Counter<long> logins = factory.Create("Exe.AuthService").CreateCounter<long>("exe.logins");
    public void Record(string result) => logins.Add(1, new KeyValuePair<string, object?>("result", result));
}
