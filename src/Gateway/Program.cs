using Exe.Shared.Web.Auth;

// Single entry point. Validates the JWT, then forwards the request (Authorization header included)
// to Auth Service or Team Service. Routes live in appsettings.json under "ReverseProxy".
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddExeJwtAuth(builder.Configuration);
builder.Services.AddReverseProxy().LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"));
builder.Services.AddHealthChecks();

var app = builder.Build();

app.UseAuthentication();
app.UseAuthorization();

app.MapHealthChecks("/health");
app.MapReverseProxy();

app.Run();
