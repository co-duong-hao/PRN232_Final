# T1 — Auth Service và Matching Service

Worker 1, đợt A. Không phụ thuộc task nào khác.

## Mục tiêu

Hai service chạy độc lập:

1. **Auth Service** (REST): đăng nhập trả JWT, quản lý tài khoản và role.
2. **Matching Service** (gRPC): `AnalyzeComposition` và `RecommendRooms`.

## Đọc trước

- `docs/design/conventions.md` (bắt buộc, gồm luật cho worker)
- `docs/design/api-contract.md`, mục "Auth Service"
- `docs/design/data-model.md`, mục "AuthDb" và "Dữ liệu mẫu → AuthDb"
- `docs/design/matching.md`
- `src/Shared/Contracts/Protos/matching.proto`

## Được sửa

- `src/AuthService/**`
- `src/MatchingService/**`
- `tests/AuthService.Tests/**`
- `tests/MatchingService.Tests/**`

Không sửa bất kỳ file nào khác (đặc biệt `src/Shared/**`, `*.sln`, `Directory.*.props`,
`docker-compose.yml`, các `Dockerfile`).

## Việc cần làm

### Auth Service

1. `Domain/`: `User`, `Role`, `UserRole`, enum `UserStatus`.
2. `Data/AuthDbContext` + cấu hình entity theo `data-model.md`; `IDesignTimeDbContextFactory`;
   migration `Initial` trong `Data/Migrations`.
3. `Data/AuthDbSeeder`: bốn role và 15 tài khoản mẫu với đúng GUID, email, họ tên trong `data-model.md`.
   Mật khẩu lấy từ `Seed:DefaultPassword`; thiếu cấu hình thì log Warning và không seed tài khoản.
4. Repositories và Services theo phân lớp trong `conventions.md`:
   - `ITokenService`: tạo access token HS256 từ `JwtOptions` (`src/Shared/Web/Auth/JwtAuth.cs`), claim
     theo `ExeClaims`;
   - `IAuthService`: đăng nhập, lấy thông tin người gọi;
   - `IUserService`: danh sách có lọc, sắp xếp, phân trang; tạo; sửa; đặt lại mật khẩu; xóa mềm.
5. Controllers: `AuthController`, `UsersController`, `RolesController` đúng bảng endpoint.
6. `Program.cs`: đăng ký DbContext (SQL Server, `EnableRetryOnFailure`), repositories, services; migrate
   có thử lại rồi seed khi khởi động (bỏ qua khi môi trường là `Testing`).

### Matching Service

1. `Services/CompositionAnalyzer` và `Services/RoomRecommender`: lớp thuần C#, không phụ thuộc gRPC,
   cài đặt đúng từng dòng trong `matching.md`.
2. `Services/MatchingGrpcService`: override hai phương thức, ánh xạ message ↔ lớp thuần; đầu vào thiếu
   thì ném `RpcException` với `StatusCode.InvalidArgument`.
3. Giữ nguyên cấu hình Kestrel hai endpoint trong `appsettings.json`.

### Test

- `tests/MatchingService.Tests`: bốn ví dụ trong bảng của `matching.md`; từng loại violation; thứ tự
  violation; `RecommendRooms` loại phòng `can_join = false`, tính điểm đúng, sắp xếp đúng, tôn trọng `limit`.
- `tests/AuthService.Tests` (SQLite in-memory): đăng nhập đúng trả token chứa đủ claim; sai mật khẩu và
  tài khoản `Inactive` đều ra `INVALID_CREDENTIALS`; email trùng ra `EMAIL_EXISTS`; lọc và phân trang
  danh sách người dùng.

## Xong khi

- `dotnet build ExeTeamMatching.sln` không lỗi; `dotnet test` hai project test của task đều xanh.
- `dotnet ef migrations add` đã chạy và thư mục `src/AuthService/Data/Migrations` có migration `Initial`.
- Mọi endpoint Auth hiển thị trong Swagger với đúng quyền; không endpoint nào trả `passwordHash`.
- Token do Auth Service phát ra được `AddExeJwtAuth` chấp nhận (cùng issuer, audience, key, tên claim).

## Ngoài phạm vi

Refresh token, đăng ký tự do, quên mật khẩu, Gateway (Manager đã làm).
