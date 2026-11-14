using Exe.Shared.Web.Auth;
using Exe.Shared.Web.Errors;
using Exe.Shared.Web.Swagger;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddExeSwagger("EXE Auth Service");
builder.Services.AddExeErrorHandling();
builder.Services.AddExeJwtAuth(builder.Configuration);
builder.Services.AddExeCurrentUser();
builder.Services.AddHealthChecks();

// T1: register AuthDbContext, repositories and services here.

var app = builder.Build();

app.UseExeErrorHandling();
app.UseSwagger();
app.UseSwaggerUI();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapHealthChecks("/health");

// T1: apply migrations and seed here, before Run.

app.Run();

/// <summary>Exposed for WebApplicationFactory in tests.</summary>
public partial class Program;
