# T3 — Noti Service

Worker 1, đợt B (làm sau T1, trong cùng worktree). Không phụ thuộc T2 hay T4: chỉ cần hợp đồng sự kiện.

## Mục tiêu

Noti Service đọc sự kiện từ Redis Streams bằng consumer group và gửi email qua SMTP.

## Đọc trước

- `docs/design/conventions.md` (bắt buộc, gồm luật cho worker)
- `docs/design/events.md` (toàn bộ: định dạng, hành vi consumer, bảng email)
- `src/Shared/Contracts/Events/Events.cs`

## Được sửa

- `src/NotiService/**`
- `tests/NotiService.Tests/**`

## Việc cần làm

1. Options: `RedisOptions` (`ConnectionString`, `Stream`, `ConsumerGroup`, `ConsumerName`) và `SmtpOptions`
   (`Host`, `Port`, `From`, `FromName`), bind từ cấu hình.
2. `Email/EmailTemplateRenderer`: từ `EventEnvelope` và một `EventRecipient` trả về tiêu đề + nội dung
   theo bảng trong `events.md`. Lớp thuần, không I/O. Loại sự kiện lạ trả `null`.
3. `Email/IEmailSender` và `SmtpEmailSender` dùng MailKit (`SmtpClient`, không TLS, không đăng nhập khi
   chạy với Mailpit).
4. `Workers/EventConsumerWorker`: thay phần placeholder bằng vòng lặp trong `events.md`:
   tạo consumer group, đọc, gửi, ACK, nhận lại entry pending, chuyển entry quá 5 lần giao sang stream
   `.dead`, tự kết nối lại khi Redis lỗi. `IConnectionMultiplexer` đăng ký singleton với
   `AbortOnConnectFail = false`.
5. Tách phần xử lý một entry thành lớp riêng (ví dụ `EventProcessor`) nhận `IEmailSender`, để test được
   mà không cần Redis.

### Test (`tests/NotiService.Tests`)

- Mỗi loại sự kiện trong 9 loại ra đúng tiêu đề; `RoomApplyDecided` phân biệt chấp nhận và từ chối.
- Entry có hai người nhận thì gửi hai email.
- `IEmailSender` ném lỗi thì `EventProcessor` báo thất bại (để worker không ACK).
- Payload không phải JSON hợp lệ và loại sự kiện lạ không làm worker dừng.

## Xong khi

- `dotnet build ExeTeamMatching.sln` không lỗi; `dotnet test tests/NotiService.Tests` xanh.
- Chạy `dotnet run --project src/NotiService` khi không có Redis: process không thoát, log Warning và
  thử lại.
- Nếu máy có Redis và Mailpit (`docker compose up -d redis mailpit`): thêm tay một entry bằng
  `redis-cli XADD exe.events '*' type RoomCreated payload '<json>'` thì email xuất hiện ở
  `http://localhost:8025`. Không chạy được bước này thì ghi rõ trong báo cáo.

## Ngoài phạm vi

Thông báo trong ứng dụng, email HTML, lưu lịch sử thông báo vào database.
