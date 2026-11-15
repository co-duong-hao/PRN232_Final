using Exe.Shared.Web.Json;
using System.Text.Json.Serialization;
using Exe.AuthService.Data;
using Exe.AuthService.Domain;
using Exe.AuthService.Repositories;
using Exe.AuthService.Services;
using Exe.Shared.Web.Auth;
using Exe.Shared.Web.Errors;
using Exe.Shared.Web.Swagger;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddControllers().AddJsonOptions(o => o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddExeSwagger("EXE Auth Service");
builder.Services.AddExeErrorHandling();
builder.Services.AddExeJson();
builder.Services.AddExeJwtAuth(builder.Configuration);
builder.Services.AddExeCurrentUser();
builder.Services.AddHealthChecks();
builder.Services.AddDbContext<AuthDbContext>(o => o.UseSqlServer(builder.Configuration.GetConnectionString("Default"), sql => sql.EnableRetryOnFailure()));
builder.Services.AddScoped<IUserRepository, UserRepository>();
builder.Services.AddScoped<ITokenService, TokenService>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IUserService, UserService>();
builder.Services.AddScoped<IPasswordHasher<User>, PasswordHasher<User>>();
builder.Services.AddScoped<AuthDbSeeder>();
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
    var db = scope.ServiceProvider.GetRequiredService<AuthDbContext>();
    for (var attempt = 1; ; attempt++)
    {
        try
        {
            await db.Database.MigrateAsync();
            break;
        }
        catch (Exception ex) when (attempt < 5)
        {
            app.Logger.LogWarning(ex, "Không thể migrate AuthDb, thử lại lần {Attempt}.", attempt);
            await Task.Delay(TimeSpan.FromSeconds(3));
        }
    }

    if (builder.Configuration.GetValue<bool>("Seed:Enabled"))
        await scope.ServiceProvider.GetRequiredService<AuthDbSeeder>().SeedAsync(CancellationToken.None);
}

app.Run();
