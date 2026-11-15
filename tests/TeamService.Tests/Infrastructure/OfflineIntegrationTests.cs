using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
using Exe.Contracts;
using Exe.Shared.Web.Auth;
using Exe.Shared.Web.Errors;
using Exe.TeamService.Controllers;
using Exe.TeamService.Data;
using Exe.TeamService.Infrastructure;
using Exe.TeamService.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Exe.TeamService.Tests.Infrastructure;

public sealed class OfflineIntegrationTests
{
    [Fact]
    public async Task Api_WhenRedisAndMatchingAreOffline_CreatesRoomAndReturns503ForComposition()
    {
        await using var connection = new SqliteConnection("DataSource=:memory:");
        await connection.OpenAsync();
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Testing" });
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Redis:ConnectionString"] = "127.0.0.1:1,connectTimeout=1000,syncTimeout=1000,asyncTimeout=1000,connectRetry=0",
            ["Matching:Address"] = "http://127.0.0.1:1"
        });
        builder.Services.AddControllers().AddApplicationPart(typeof(RoomsController).Assembly);
        builder.Services.AddExeErrorHandling();
        builder.Services.AddAuthentication("Test").AddScheme<AuthenticationSchemeOptions, TestAuthHandler>("Test", _ => { });
        builder.Services.AddAuthorization();
        builder.Services.AddExeCurrentUser();
        builder.Services.AddDbContext<TeamDbContext>(options => options.UseSqlite(connection));
        builder.Services.Configure<RoomOptions>(_ => { });
        builder.Services.AddScoped<IReferenceService, ReferenceService>();
        builder.Services.AddScoped<RoomService>();
        builder.Services.AddScoped<IRoomService>(sp => sp.GetRequiredService<RoomService>());
        builder.Services.AddScoped<IRoomApplyService, RoomApplyService>();
        builder.Services.AddTeamInfrastructure(builder.Configuration);
        await using var app = builder.Build();
        app.UseExeErrorHandling();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapControllers();
        app.MapGet("/test-health", () => Results.Ok());
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TeamDbContext>();
            await db.Database.EnsureCreatedAsync();
            await TeamDbSeeder.SeedAsync(db);
        }
        await app.StartAsync();
        try
        {
            var address = app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.Single();
            using var client = new HttpClient { BaseAddress = new Uri(address) };
            Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/test-health")).StatusCode);
            var courseId = Guid.Parse("30000000-0000-0000-0000-000000000001");
            var create = await client.PostAsync($"/api/courses/{courseId}/rooms", null);
            Assert.Equal(HttpStatusCode.Created, create.StatusCode);
            var room = await create.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
            var roomId = room.GetProperty("id").GetGuid();
            var response = await client.GetAsync($"/api/rooms/{roomId}/composition");
            Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
            var problem = await response.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
            Assert.Equal("MATCHING_UNAVAILABLE", problem.GetProperty("code").GetString());
        }
        finally
        {
            await app.StopAsync();
        }
    }

    private sealed class TestAuthHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            var claims = new[]
            {
                new Claim(ExeClaims.Sub, "10000000-0000-0000-0000-000000000001"),
                new Claim(ExeClaims.Role, Roles.Student)
            };
            var identity = new ClaimsIdentity(claims, Scheme.Name, ClaimTypes.Name, ExeClaims.Role);
            var ticket = new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme.Name);
            return Task.FromResult(AuthenticateResult.Success(ticket));
        }
    }
}

