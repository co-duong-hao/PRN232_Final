# Vận hành bản chạy local

Tài liệu tham chiếu cho PRN232 Final v0.4 tại commit 2e3789f.

[Mục lục bộ tài liệu](01-architecture.md)

## Cách hoạt động

Khi web mở được nhưng API trả lỗi, kiểm tra Gateway và log TeamService trước khi kết luận từ trạng thái Nginx.

Dữ liệu SQL được khởi tạo khi AuthService và TeamService chạy migration. Các bước thử nghiệm cần dữ liệu mới nên dùng môi trường riêng.

Cấu hình trong Compose và `appsettings.Development.json` có địa chỉ khác nhau. Redis, SQL Server và Kafka có healthcheck trước khi dịch vụ phụ thuộc khởi động.

## Cách kiểm tra

1. `docker compose ps` cho thấy container và cổng đã mở. `docker compose logs --tail 100 team-service` giúp xem lỗi khởi động.
2. Dùng `docker compose config --services` để xem cấu hình mà không cần in ra giá trị trong `.env`.

## Bảng chẩn đoán

| Triệu chứng | Kiểm tra | Đọc kết quả |
|---|---|---|
| Web mở nhưng đăng nhập trả 502 | Log Gateway và AuthService | Phân biệt dịch vụ chưa sẵn sàng với lỗi xác thực |
| API trả MATCHING_UNAVAILABLE | Container và log MatchingService | Kiểm tra đích gRPC trong mạng Compose |
| Hoàn tất thành công nhưng thiếu email | Log producer, consumer và Mailpit | Đối chiếu mã phòng, mã nhóm và thời điểm |
| Thống kê chậm hoặc đổi muộn | Header X-Cache và log TeamService | Xác nhận TTL, thao tác xóa cache và đường đọc SQL Server |
| Dữ liệu v0.3 còn xuất hiện | Image đang chạy, migration và seed | Phân biệt build source mới với việc khởi động lại image cũ |

## Đối chiếu mã nguồn

Các trích đoạn dưới đây hỗ trợ tra cứu. Đường dẫn mở phần tương ứng trong repo.

### Program.cs

Khởi động AuthService và áp dụng migration/seed.

[src/AuthService/Program.cs dòng 1–58](../../src/AuthService/Program.cs#L1-L58)

~~~csharp
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
~~~

### Program.cs

Khởi động TeamService, đăng ký hạ tầng và chạy migration/seed.

[src/TeamService/Program.cs dòng 1–78](../../src/TeamService/Program.cs#L1-L78)

~~~csharp
using Exe.Shared.Web.Json;
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
builder.Services.AddExeJson();
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





~~~

### DependencyInjection.cs

Các client được đăng ký lúc TeamService khởi động.

[src/TeamService/Infrastructure/DependencyInjection.cs dòng 1–38](../../src/TeamService/Infrastructure/DependencyInjection.cs#L1-L38)

~~~csharp
using Exe.TeamService.Abstractions;
using Exe.TeamService.Infrastructure.Jobs;
using Exe.TeamService.Infrastructure.Matching;
using Exe.TeamService.Infrastructure.Messaging;
using Confluent.Kafka;
using Exe.TeamService.Infrastructure.Caching;
using Proto = Exe.Contracts.Grpc;

namespace Exe.TeamService.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddTeamInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddStackExchangeRedisCache(options =>
        {
            options.Configuration = configuration["Redis:ConnectionString"] ?? "localhost:6379";
            options.InstanceName = configuration["Redis:InstanceName"] ?? "exe-team:";
        });
        services.AddSingleton<ITeamCache, TeamCache>();
        services.AddSingleton<IProducer<string, string>>(_ => new ProducerBuilder<string, string>(new ProducerConfig
        {
            BootstrapServers = configuration["Kafka:BootstrapServers"] ?? "localhost:9094",
            Acks = Acks.All, EnableIdempotence = true, MessageTimeoutMs = 5000
        }).Build());
        services.AddSingleton<IEventPublisher, KafkaEventPublisher>();
        services.AddGrpcClient<Proto.Matching.MatchingClient>(options =>
        {
            options.Address = new Uri(configuration["Matching:Address"] ?? "http://localhost:5103");
        });
        services.AddScoped<IMatchingClient, GrpcMatchingClient>();
        services.AddScoped<ICourseCloseRepository, CourseCloseRepository>();
        services.AddScoped<CourseCloseProcessor>(sp => new CourseCloseProcessor(
            sp.GetRequiredService<ICourseCloseRepository>(), sp.GetRequiredService<IEventPublisher>(), sp.GetRequiredService<ITeamCache>()));
        services.AddHostedService<CourseCloseJob>();
        return services;
    }
}
~~~
