using Exe.Shared.Web.Auth;
using Exe.Shared.Web.Errors;
using Exe.Shared.Web.Swagger;
using Exe.TeamService.Abstractions;
using Exe.TeamService.Infrastructure;
using Exe.TeamService.Data;
using Microsoft.EntityFrameworkCore;
using Exe.TeamService.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddExeSwagger("EXE Team & Member Service");
builder.Services.AddExeErrorHandling();
builder.Services.AddExeJwtAuth(builder.Configuration);
builder.Services.AddExeCurrentUser();
builder.Services.AddHealthChecks();

builder.Services.AddTeamInfrastructure(builder.Configuration);

builder.Services.AddDbContext<TeamDbContext>(options => options.UseSqlServer(builder.Configuration.GetConnectionString("Default"), sql => sql.EnableRetryOnFailure()));

builder.Services.Configure<RoomOptions>(builder.Configuration.GetSection("Room"));
builder.Services.AddScoped<RoomService>();
builder.Services.AddScoped<IRoomService>(sp => sp.GetRequiredService<RoomService>());
builder.Services.AddScoped<IRoomApplyService, RoomApplyService>();
builder.Services.AddScoped<TeamReadService>();
builder.Services.AddScoped<ITeamReadService>(sp => sp.GetRequiredService<TeamReadService>());
builder.Services.AddScoped<IGroupService>(sp => sp.GetRequiredService<TeamReadService>());
builder.Services.AddScoped<ICourseService, CourseService>();
builder.Services.AddScoped<IReferenceService, ReferenceService>();

var app = builder.Build();

app.UseExeErrorHandling();
app.UseSwagger();
app.UseSwaggerUI();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapHealthChecks("/health");

if (!app.Environment.IsEnvironment("Testing"))
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<TeamDbContext>();
    for (var attempt = 1; ; attempt++)
    {
        try
        {
            await db.Database.MigrateAsync();
            break;
        }
        catch (Exception ex) when (attempt < 5)
        {
            app.Logger.LogWarning(ex, "Database migration attempt {Attempt} failed", attempt);
            await Task.Delay(TimeSpan.FromSeconds(2 * attempt));
        }
    }
    if (builder.Configuration.GetValue<bool>("Seed:Enabled"))
    {
        await TeamDbSeeder.SeedAsync(db);
    }
}

app.Run();

/// <summary>Exposed for WebApplicationFactory in tests.</summary>
public partial class Program;





