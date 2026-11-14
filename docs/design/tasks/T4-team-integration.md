# T4 — Team Service: Redis, gRPC và tác vụ nền

Worker 2, đợt B (làm sau T2, trong cùng worktree). Phụ thuộc T2: dùng entity và DbContext của T2.

## Mục tiêu

Thay hai bản cài đặt rỗng bằng bản thật và thêm tác vụ nền đóng ghép nhóm.

## Đọc trước

- `docs/design/conventions.md` (bắt buộc, gồm luật cho worker)
- `docs/design/events.md`, mục "Định dạng trên Redis Streams" và "Producer"
- `docs/design/matching.md` và `src/Shared/Contracts/Protos/matching.proto`
- `src/TeamService/Abstractions/*.cs`

## Được sửa

- `src/TeamService/Infrastructure/**`
- `src/TeamService/Program.cs`: chỉ phần đăng ký DI cho các lớp của task này
- `tests/TeamService.Tests/Infrastructure/**`

Không sửa `src/TeamService/Abstractions/**` và các lớp Service, Controller của T2. Nếu job cần một truy
vấn mới, thêm vào repository tương ứng và ghi rõ trong báo cáo.

## Việc cần làm

1. `Infrastructure/Messaging/RedisStreamEventPublisher : IEventPublisher`
   - `XADD` vào `Redis:Stream` hai field `type` và `payload` (`EventStreams.TypeField`, `PayloadField`).
   - Bắt mọi exception, log Error kèm `EventId` và `Type`, không ném ra ngoài.
   - `IConnectionMultiplexer` singleton, `AbortOnConnectFail = false`.
2. `Infrastructure/Matching/GrpcMatchingClient : IMatchingClient`
   - Đăng ký bằng `AddGrpcClient<Matching.MatchingClient>` với địa chỉ `Matching:Address`.
   - Ánh xạ record trong `Abstractions` ↔ message proto ở một lớp mapper riêng.
   - Deadline 5 giây cho mỗi lời gọi. `RpcException` (Unavailable, DeadlineExceeded, lỗi kết nối) →
     `ServiceUnavailableException` với code `MATCHING_UNAVAILABLE`.
3. `Infrastructure/Jobs/CourseCloseProcessor` (scoped) với `Task<int> RunOnceAsync(DateTime utcNow, ct)`:
   tìm Course `Forming` có `Deadline <= utcNow`, chuyển sang `Closed`, lưu, rồi phát `CourseClosed` cho
   thành viên các phòng `Open`/`Locked` của từng Course. Trả về số Course đã đóng.
4. `Infrastructure/Jobs/CourseCloseJob : BackgroundService`: `PeriodicTimer` theo
   `Jobs:CourseCloseIntervalSeconds`; mỗi nhịp tạo scope mới và gọi `RunOnceAsync`. Lỗi trong một nhịp
   chỉ log Error, không làm job dừng. Không chạy khi môi trường là `Testing`.
5. `Infrastructure/DependencyInjection.cs`: `AddTeamInfrastructure(this IServiceCollection, IConfiguration)`
   đăng ký ba phần trên. Trong `Program.cs` thay hai dòng `AddSingleton<IEventPublisher, NullEventPublisher>`
   và `AddSingleton<IMatchingClient, UnavailableMatchingClient>` bằng một lời gọi `AddTeamInfrastructure`.
   Giữ lại hai lớp placeholder (test của T2 có thể đang dùng).

### Test (`tests/TeamService.Tests/Infrastructure`)

- `CourseCloseProcessor`: Course quá hạn bị đóng và phát `CourseClosed` đúng người nhận; Course chưa đến
  hạn, `Planned` hoặc đã `Closed` thì không đổi; chạy lần hai không phát lại.
- Mapper gRPC: `GroupTypeRule` và `CompositionAnalysis` ánh xạ đủ mọi trường theo cả hai chiều.
- `GrpcMatchingClient`: `RpcException(Unavailable)` thành `ServiceUnavailableException` với code đúng.

### Làm thêm nếu còn thời gian

`CourseDeadlineReminder`: job mỗi ngày một lần gửi cho sinh viên chưa có nhóm của Course còn
`Jobs:ReminderDaysBeforeDeadline` ngày đến hạn. Cần thêm cột `Courses.ReminderSentAt` và một migration
mới để không gửi lặp. Chưa làm thì ghi rõ trong báo cáo.

## Xong khi

- `dotnet build ExeTeamMatching.sln` không lỗi; toàn bộ `dotnet test tests/TeamService.Tests` xanh
  (gồm cả test của T2).
- Team Service khởi động được khi Redis và Matching Service đều tắt; gọi kiểm tra cơ cấu lúc đó trả 503
  `MATCHING_UNAVAILABLE`, các thao tác khác vẫn chạy.

## Ngoài phạm vi

Outbox, retry phát sự kiện, Noti Service (T3).
