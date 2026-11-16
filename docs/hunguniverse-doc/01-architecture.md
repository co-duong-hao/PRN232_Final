# Kiến trúc hệ thống

Tài liệu tham chiếu cho PRN232 Final v0.4 tại commit 2e3789f.

## Cách hoạt động

Ứng dụng React, Gateway và các dịch vụ .NET có thể theo dõi theo từng chặng khi một thao tác trên web thất bại.

AuthService quản lý AuthDb. TeamService quản lý TeamDb. Hai database dùng cùng SQL Server ở môi trường Compose và tham chiếu người dùng qua `UserId`.

TeamService gọi MatchingService qua gRPC khi cần kết quả để quyết định ngay. Kafka vận chuyển sự kiện sau khi ghi dữ liệu để NotiService gửi email.

## Cách kiểm tra

1. Theo một yêu cầu đăng nhập từ Nginx đến Gateway và AuthService.
2. Theo một yêu cầu hoàn tất phòng qua TeamService, gRPC, SQL Server và Kafka.

## Sơ đồ luồng chính

~~~mermaid
flowchart LR
    Web["React và Nginx"] --> Gateway["Gateway YARP"]
    Gateway --> Auth["AuthService"]
    Gateway --> Team["TeamService"]
    Auth --> AuthDb[("AuthDb")]
    Team --> TeamDb[("TeamDb")]
    Team --> Redis[("Cache Redis")]
    Team -->|"gRPC"| Matching["MatchingService"]
    Team -->|"Sự kiện"| Kafka["Kafka"]
    Kafka --> Noti["NotiService"]
    Noti -->|"SMTP"| Mailpit["Mailpit"]
~~~

## Mục lục

| Chương | Nội dung |
|---:|---|
| 01 | [Kiến trúc hệ thống](01-architecture.md) |
| 02 | [Docker Compose](02-compose.md) |
| 03 | [Build và image Docker](03-build-images.md) |
| 04 | [Pipeline CI/CD](04-ci-cd.md) |
| 05 | [Vận hành bản chạy local](05-operations.md) |
| 06 | [Quy ước HTTP dùng chung](06-api-basics.md) |
| 07 | [Đăng nhập và JWT](07-auth-login.md) |
| 08 | [Quản trị tài khoản](08-auth-admin.md) |
| 09 | [Dữ liệu mẫu v0.4](09-seed-data.md) |
| 10 | [Schema quan hệ ban đầu](10-migrations-base.md) |
| 11 | [Migration dữ liệu tuyển thành viên](11-migrations-recruitment.md) |
| 12 | [Quản lý Course](12-courses.md) |
| 13 | [Danh mục và loại nhóm](13-reference-data.md) |
| 14 | [Tạo phòng và quản lý thành viên](14-rooms-write.md) |
| 15 | [Đơn xin vào phòng](15-room-applies.md) |
| 16 | [Tìm phòng và tra cứu nhóm](16-rooms-read.md) |
| 17 | [Hồ sơ và tiêu chí tuyển](17-recruitment.md) |
| 18 | [Hợp đồng và client gRPC](18-grpc-contract.md) |
| 19 | [Phân tích cơ cấu và gợi ý phòng](19-matching-server.md) |
| 20 | [Sự kiện Kafka và producer](20-kafka-producer.md) |
| 21 | [Consumer Kafka và email](21-kafka-consumer.md) |
| 22 | [Cache Redis và job nền](22-cache-and-jobs.md) |
| 23 | [Điều hướng và xác thực trên web](23-frontend-shell.md) |
| 24 | [Giao diện tìm nhóm](24-frontend-discovery.md) |
| 25 | [Giao diện chi tiết phòng](25-frontend-room.md) |
| 26 | [Học phần trên web](26-frontend-courses.md) |
| 27 | [Bảng quản lý staff và admin](27-frontend-staff.md) |
| 28 | [HTTP client và kiểu dữ liệu web](28-frontend-api.md) |
| 29 | [Kiểm thử .NET](29-test-reference.md) |
| 30 | [Diễn tập demo và E2E](30-demo-and-e2e.md) |

## Đối chiếu nhanh theo tình huống

| Tình huống | Chương đọc trước |
|---|---|
| Không đăng nhập được | [Đăng nhập và JWT](07-auth-login.md) |
| Mã lỗi BR05 hoặc BR19 | [Tạo phòng và quản lý thành viên](14-rooms-write.md) |
| Trạng thái đơn chưa cập nhật | [Đơn xin vào phòng](15-room-applies.md) |
| Phòng chưa đủ cơ cấu hoặc gRPC lỗi | [Hợp đồng gRPC](18-grpc-contract.md), [MatchingService](19-matching-server.md) |
| Nhóm đã tạo nhưng chưa có email | [Kafka producer](20-kafka-producer.md), [Kafka consumer](21-kafka-consumer.md) |
| Thống kê vẫn hiện số cũ | [Cache Redis và job nền](22-cache-and-jobs.md) |
| Cần chạy lại demo có dữ liệu mới | [Vận hành local](05-operations.md), [Diễn tập và E2E](30-demo-and-e2e.md) |

## Đối chiếu mã nguồn

Các trích đoạn dưới đây hỗ trợ tra cứu. Đường dẫn mở phần tương ứng trong repo.

### Program.cs

Gateway nạp định tuyến và cấu hình xác thực ở mức ứng dụng.

[src/Gateway/Program.cs dòng 1–19](../../src/Gateway/Program.cs#L1-L19)

~~~csharp
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
~~~

### appsettings.json

Các tuyến tách Auth Service khỏi Team Service. Trích phần cấu hình reverse proxy.

[src/Gateway/appsettings.json dòng 14–53](../../src/Gateway/appsettings.json#L14-L53)

~~~json
  "ReverseProxy": {
    "Routes": {
      "auth-public": {
        "ClusterId": "auth",
        "Order": 1,
        "Match": { "Path": "/api/auth/{**catch-all}" }
      },
      "auth-users": {
        "ClusterId": "auth",
        "Order": 1,
        "AuthorizationPolicy": "default",
        "Match": { "Path": "/api/users/{**catch-all}" }
      },
      "auth-roles": {
        "ClusterId": "auth",
        "Order": 1,
        "AuthorizationPolicy": "default",
        "Match": { "Path": "/api/roles/{**catch-all}" }
      },
      "team": {
        "ClusterId": "team",
        "Order": 100,
        "AuthorizationPolicy": "default",
        "Match": { "Path": "/api/{**catch-all}" }
      }
    },
    "Clusters": {
      "auth": {
        "Destinations": {
          "d1": { "Address": "http://localhost:5101/" }
        }
      },
      "team": {
        "Destinations": {
          "d1": { "Address": "http://localhost:5102/" }
        }
      }
    }
  }
}
~~~

### Program.cs

MatchingService đăng ký gRPC và endpoint health.

[src/MatchingService/Program.cs dòng 1–18](../../src/MatchingService/Program.cs#L1-L18)

~~~csharp
using Exe.MatchingService.Services;

// gRPC only, no database. Kestrel listens on two endpoints (see appsettings.json):
// "Grpc" speaks HTTP/2 without TLS, "Health" speaks HTTP/1.1 for /health.
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddGrpc();
builder.Services.AddHealthChecks();

var app = builder.Build();

app.MapGrpcService<MatchingGrpcService>();
app.MapHealthChecks("/health");

app.Run();

/// <summary>Exposed for WebApplicationFactory in tests.</summary>
public partial class Program;
~~~

### Program.cs

NotiService đăng ký worker Kafka, renderer và SMTP.

[src/NotiService/Program.cs dòng 1–14](../../src/NotiService/Program.cs#L1-L14)

~~~csharp
using Exe.NotiService.Email;
using Exe.NotiService.Options;
using Exe.NotiService.Workers;

var builder = Host.CreateApplicationBuilder(args);
builder.Services.Configure<KafkaOptions>(builder.Configuration.GetSection("Kafka"));
builder.Services.Configure<SmtpOptions>(builder.Configuration.GetSection("Smtp"));
builder.Services.AddSingleton<IDeadLetterPublisher, DeadLetterPublisher>();
builder.Services.AddSingleton<EmailTemplateRenderer>();
builder.Services.AddSingleton<IEmailSender, SmtpEmailSender>();
builder.Services.AddSingleton<EventProcessor>();
builder.Services.AddHostedService<EventConsumerWorker>();
var host = builder.Build();
host.Run();
~~~

### nginx.conf

Nginx phục vụ SPA và chuyển các URL `/api/` đến Gateway.

[frontend/nginx.conf dòng 1–26](../../frontend/nginx.conf#L1-L26)

~~~nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # Same-origin API: the browser calls /api, Nginx forwards to the gateway. No CORS needed.
    location /api/ {
        proxy_pass http://gateway:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Hashed build assets can be cached for a long time.
    location /assets/ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Client-side routing: unknown paths serve the SPA.
    location / {
        try_files $uri $uri/ /index.html;
    }
}
~~~
