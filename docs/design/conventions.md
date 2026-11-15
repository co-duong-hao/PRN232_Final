# Quy ước chung

Áp dụng cho mọi service. Task spec trong `docs/design/tasks/` chỉ nêu phần riêng của từng task;
mọi thứ không nêu ở đó thì theo tài liệu này.

## Nền tảng

- .NET 8 (`global.json` ghim SDK 8.0.x), C# 12, nullable bật.
- Version package nằm ở `Directory.Packages.props`; trong `.csproj` chỉ ghi `<PackageReference Include="..." />`
  không kèm version. **Không sửa** `Directory.Packages.props`. Cần package chưa có thì dùng
  `VersionOverride="x.y.z"` trong `.csproj` của mình và ghi rõ trong báo cáo.
- Mọi package đang khai báo đã được restore sẵn vào cache NuGet của máy, nên build không cần mạng.

## Lệnh

```bash
dotnet build ExeTeamMatching.sln
dotnet test ExeTeamMatching.sln
dotnet tool restore
dotnet ef migrations add Initial --project src/AuthService --output-dir Data/Migrations
```

## Phân lớp trong mỗi REST service

```
Controllers/     nhận HTTP, kiểm tra quyền bằng [Authorize], gọi Service, trả DTO
Services/        interface + cài đặt; toàn bộ quy tắc nghiệp vụ nằm ở đây
Repositories/    interface + cài đặt; truy vấn EF Core
Domain/          entity và enum
Dtos/            request và response
Data/            DbContext, cấu hình entity, Migrations/, seed
```

- Controller không dùng `DbContext` và không chứa quy tắc nghiệp vụ.
- Service không trả entity ra ngoài; luôn ánh xạ sang DTO.
- Đăng ký DI theo interface (`AddScoped<IRoomService, RoomService>()`).
- Mọi phương thức I/O là `async` và nhận `CancellationToken`.

## Thư viện dùng chung đã có sẵn (dùng lại, không viết lại)

| Cần | Dùng | Ở đâu |
|---|---|---|
| Xác thực JWT | `services.AddExeJwtAuth(configuration)` | `src/Shared/Web/Auth/JwtAuth.cs` |
| Người gọi hiện tại | `ICurrentUser` (`UserId`, `Roles`, `IsInRole`) | `src/Shared/Web/Auth/CurrentUser.cs` |
| Báo lỗi | ném `NotFoundException`, `BusinessRuleException`, `ForbiddenException`, `BadRequestException`, `ServiceUnavailableException` | `src/Shared/Web/Errors/AppExceptions.cs` |
| Phân trang | `PageQuery`, `PagedResult<T>`, `query.ToPagedResultAsync(page, ct)` | `src/Shared/Web/Paging/Paging.cs` |
| Swagger có nút Authorize | `services.AddExeSwagger("...")` | `src/Shared/Web/Swagger/SwaggerExtensions.cs` |
| Tên role, tên claim | `Roles.*`, `ExeClaims.*` | `src/Shared/Contracts/Roles.cs` |
| Sự kiện | `EventEnvelope`, `EventTypes`, `EventDataKeys`, `KafkaTopics` | `src/Shared/Contracts/Events/Events.cs` |
| gRPC | `Exe.Contracts.Grpc.Matching` (server base và client) | `src/Shared/Contracts/Protos/matching.proto` |

`src/Shared/**` chỉ Manager sửa. Thiếu gì ở đó thì nêu trong báo cáo, đừng tự thêm.

## Phân quyền

- Role: `Admin`, `HeadOfDepartment`, `Lecturer`, `Student` (hằng số trong `Roles`).
- Dùng `[Authorize(Roles = Roles.Admin)]`, `Roles.AdminOrHead`, `Roles.Staff`. Mặc định mọi endpoint cần
  đăng nhập; chỉ `POST /api/auth/login` là `[AllowAnonymous]`.
- "Trưởng phòng" không phải role hệ thống: kiểm tra trong Service bằng `Room.LeaderId`.

## Lỗi

Service ném exception; `AppExceptionHandler` trả `application/problem+json`:

```json
{ "status": 409, "title": "Sinh viên đã ở một phòng khác trong Course.", "code": "BR05", "traceId": "..." }
```

- 400 `BAD_REQUEST`: dữ liệu vào sai. Lỗi validate model (`[ApiController]`) giữ mặc định của ASP.NET.
- 401: token thiếu hoặc sai. 403 `FORBIDDEN` hoặc mã cụ thể: đã đăng nhập nhưng không được phép.
- 404 `NOT_FOUND`: không có tài nguyên.
- 409: vi phạm quy tắc nghiệp vụ; `code` là mã BR (`BR05`, `BR11`...) hoặc mã trạng thái nêu trong
  `api-contract.md`.
- 409 `CONCURRENCY_CONFLICT`: tự động khi EF ném `DbUpdateConcurrencyException`.
- 503 `MATCHING_UNAVAILABLE`: Matching Service không phản hồi.
- `title` viết bằng tiếng Việt, một câu, nói rõ điều gì sai.

## Danh sách

Mọi endpoint danh sách nhận `page`, `pageSize` (mặc định 20, tối đa 100), `sortBy`, `sortDir`
(`asc` | `desc`), `q` và trả `PagedResult<T>`:

```json
{ "items": [], "page": 1, "pageSize": 20, "totalItems": 0, "totalPages": 0 }
```

`sortBy` không hợp lệ thì dùng thứ tự mặc định của endpoint, không báo lỗi.

## EF Core

- Khóa chính kiểu `Guid`, sinh ở ứng dụng (`Guid.NewGuid()`).
- Enum lưu dạng chuỗi (`HasConversion<string>()`, `HasMaxLength(20)`).
- Thời gian lưu UTC (`DateTime.UtcNow`).
- Provider chạy thật là SQL Server; migration nằm ở `Data/Migrations`. Thêm
  `IDesignTimeDbContextFactory` để `dotnet ef` chạy được mà không cần khởi động ứng dụng.
- Khi khởi động: `Database.MigrateAsync()` có thử lại (SQL Server trong Docker lên chậm), sau đó seed
  nếu `Seed:Enabled` và bảng còn trống. Bỏ qua bước này khi môi trường là `Testing`.
- Kiểm soát ghi đồng thời bằng concurrency token kiểu `int` tự tăng trong code (không dùng `rowversion`,
  không dùng SQL thô), để test chạy được trên SQLite.

## Cấu hình

| Khóa | Dùng ở | Ghi chú |
|---|---|---|
| `ConnectionStrings:Default` | Auth, Team | |
| `Jwt:Issuer`, `Jwt:Audience`, `Jwt:Key`, `Jwt:AccessTokenMinutes` | Gateway, Auth, Team | `Key` tối thiểu 32 byte |
| `Seed:Enabled`, `Seed:DefaultPassword` | Auth, Team | mật khẩu seed chỉ Auth dùng |
| `Redis:ConnectionString`, `Redis:InstanceName` | Team | chỉ dùng làm cache (`caching.md`) |
| `Cache:GroupTypeMinutes`, `Cache:CourseStatsSeconds` | Team | |
| `Kafka:BootstrapServers`, `Kafka:Topic` | Team, Noti | |
| `Kafka:DeadLetterTopic`, `Kafka:GroupId`, `Kafka:MaxAttempts` | Noti | |
| `Matching:Address` | Team | địa chỉ gRPC |
| `Room:LockThreshold` | Team | mặc định 3 (BR08) |
| `Jobs:CourseCloseIntervalSeconds`, `Jobs:ReminderDaysBeforeDeadline` | Team | |
| `Smtp:Host`, `Smtp:Port`, `Smtp:From`, `Smtp:FromName` | Noti | |

Không ghi secret vào code. Giá trị trong `appsettings.Development.json` và `.env.example` chỉ dùng cho
máy cá nhân.

## Logging

Dùng `ILogger<T>` với message template có tham số (`logger.LogInformation("Room {RoomCode} locked", code)`),
không nối chuỗi. Không log mật khẩu, token, chuỗi kết nối.

## Test

- xUnit; với EF dùng SQLite in-memory (`DataSource=:memory:`, giữ connection mở, `EnsureCreated()`).
- Test quy tắc nghiệp vụ ở tầng Service, mock `IMatchingClient` và `IEventPublisher` bằng Moq.
- Tên test: `Phương_thức_Điều_kiện_Kết_quả`, ví dụ `Join_WhenStudentAlreadyInRoom_ThrowsBR05`.

## Luật cho worker

- Chỉ sửa file trong danh sách "Được sửa" của task. Cần sửa ngoài phạm vi thì dừng và nêu trong báo cáo.
- Không `git push`, không merge, không đổi nhánh, không sửa cấu hình sandbox hay rules.
- Không cần commit: để thay đổi trong working tree, Manager sẽ review rồi commit.
- Trước khi báo xong: `dotnet build ExeTeamMatching.sln` không lỗi và `dotnet test` cho phần mình xanh.
- Báo cáo cuối gồm: file đã tạo/sửa, kết quả build và test (dán dòng tổng kết), chỗ chưa làm được,
  giả định đã tự đặt.
