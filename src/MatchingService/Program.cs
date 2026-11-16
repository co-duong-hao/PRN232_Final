using Exe.MatchingService;
using Exe.Shared.Web.Observability;
using Exe.MatchingService.Services;

// gRPC only, no database. Kestrel listens on two endpoints (see appsettings.json):
// "Grpc" speaks HTTP/2 without TLS, "Health" speaks HTTP/1.1 for /health.
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddGrpc();
builder.Services.AddHealthChecks();

builder.Services.AddExeMetrics("matching-service", "Exe.MatchingService");
builder.Services.AddSingleton<MatchingMetrics>();

var app = builder.Build();

app.MapGrpcService<MatchingGrpcService>();
app.MapHealthChecks("/health");
app.MapExeMetrics();

app.Run();

/// <summary>Exposed for WebApplicationFactory in tests.</summary>
public partial class Program;
