using Exe.Shared.Web.Auth;
using Exe.Shared.Web.Errors;
using Exe.Shared.Web.Swagger;
using Exe.TeamService.Abstractions;
using Exe.TeamService.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddExeSwagger("EXE Team & Member Service");
builder.Services.AddExeErrorHandling();
builder.Services.AddExeJwtAuth(builder.Configuration);
builder.Services.AddExeCurrentUser();
builder.Services.AddHealthChecks();

// Integration points. T4 replaces these two registrations with the Redis and gRPC implementations.
builder.Services.AddSingleton<IEventPublisher, NullEventPublisher>();
builder.Services.AddSingleton<IMatchingClient, UnavailableMatchingClient>();

// T2: register TeamDbContext, repositories and services here.

var app = builder.Build();

app.UseExeErrorHandling();
app.UseSwagger();
app.UseSwaggerUI();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapHealthChecks("/health");

// T2: apply migrations and seed here, before Run.

app.Run();

/// <summary>Exposed for WebApplicationFactory in tests.</summary>
public partial class Program;
