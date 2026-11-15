# K2 — Team Service: producer Kafka và cache Redis

Worker 2. Không phụ thuộc K1.

## Mục tiêu

1. Team Service phát sự kiện vào Kafka thay cho Redis Streams.
2. Redis chuyển sang làm cache theo `caching.md`.

## Đọc trước

- `docs/design/conventions.md` (bắt buộc, gồm luật cho worker)
- `docs/design/events.md`, mục "Định dạng trên Kafka" và "Producer (Team Service)"
- `docs/design/caching.md`
- `src/Shared/Contracts/Events/KafkaTopics.cs`, `Events.cs` (`EventEnvelope.EventKey`)
- Code hiện có: `src/TeamService/Infrastructure/**`, các Service dùng `GroupTypeRule` và thống kê Course

## Được sửa

- `src/TeamService/**` trừ `src/TeamService/Abstractions/IEventPublisher.cs` và `IMatchingClient.cs`
- `tests/TeamService.Tests/**`

## Việc cần làm

### 1. Producer Kafka

- `Infrastructure/Messaging/KafkaEventPublisher : IEventPublisher` theo mục "Producer" trong `events.md`
  (key, value, header, `Acks = All`, idempotence, timeout 5 giây, không ném lỗi ra ngoài, `Flush` khi dừng).
- Đăng ký trong `Infrastructure/DependencyInjection.cs` thay cho `RedisStreamEventPublisher`; xóa lớp Redis Streams
  cũ và phần đăng ký `IConnectionMultiplexer` nếu không còn dùng.
- `Kafka:Topic` mặc định `KafkaTopics.Events`.

### 2. Cache Redis

- `AddStackExchangeRedisCache` với `Redis:ConnectionString`, `Redis:InstanceName`.
- `ITeamCache` (một lớp duy nhất bọc `IDistributedCache`): get-or-create có thời hạn, xóa key, và cho biết
  lần đọc là hit hay miss. Mọi lỗi Redis: log Warning, đọc database, không ném lỗi ra ngoài.
- Áp dụng đúng hai key trong `caching.md`:
  - `grouptype:{id}`: `GET /api/group-types/{id}` và nơi dựng `GroupTypeRule` (kiểm tra cơ cấu, QT06, gợi ý
    phòng). Xóa khi sửa/xóa GroupType.
  - `course:{id}:stats`: `GET /api/courses/{id}/stats`. Xóa sau mọi thao tác ghi làm đổi thống kê của Course:
    tạo phòng, vào phòng, duyệt đơn, rời phòng, hoàn tất phòng, thêm/gỡ sinh viên, mở/đóng Course (kể cả job đóng
    Course).
- Hai endpoint trên trả header `X-Cache: HIT` hoặc `X-Cache: MISS`.

### 3. Test (`tests/TeamService.Tests`)

- Giữ toàn bộ test hiện có xanh (cập nhật nếu chữ ký thay đổi).
- `ITeamCache` dùng `MemoryDistributedCache` trong test: lần đầu miss, lần sau hit; xóa key thì miss lại.
- `IDistributedCache` ném lỗi: vẫn trả dữ liệu từ database.
- Thống kê Course: gọi stats, một sinh viên vào phòng, gọi lại → số liệu mới (key đã bị xóa).
- `KafkaEventPublisher`: lỗi từ producer không ném ra ngoài (mock `IProducer<string,string>`).

## Xong khi

- `dotnet build ExeTeamMatching.sln` không lỗi; `dotnet test tests/TeamService.Tests` xanh.
- Không còn `StreamAdd` hay Redis Streams trong `src/TeamService`.
- Team Service vẫn khởi động và chạy nghiệp vụ được khi Kafka hoặc Redis tắt.
- Nếu máy có Docker: `docker compose up -d sqlserver redis kafka`, chạy Team Service, gọi stats hai lần thấy
  `MISS` rồi `HIT`. Không làm được thì ghi rõ trong báo cáo.
