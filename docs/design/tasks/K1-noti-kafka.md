# K1 — Noti Service: chuyển consumer sang Kafka

Worker 1. Không phụ thuộc K2: hợp đồng message đã cố định trong `events.md` và `KafkaTopics`.

## Mục tiêu

Noti Service đọc sự kiện từ Kafka thay cho Redis Streams, giữ nguyên phần dựng và gửi email.

## Đọc trước

- `docs/design/conventions.md` (bắt buộc, gồm luật cho worker)
- `docs/design/events.md`, mục "Định dạng trên Kafka" và "Consumer (Noti Service)"
- `src/Shared/Contracts/Events/KafkaTopics.cs`, `Events.cs`
- Code hiện có: `src/NotiService/Workers/EventConsumerWorker.cs`, `EventProcessor.cs`, `Email/*`

## Được sửa

- `src/NotiService/**` (kể cả `Exe.NotiService.csproj` và `appsettings.json`)
- `tests/NotiService.Tests/**`

## Việc cần làm

1. `Options/KafkaOptions` bind từ mục `Kafka` (`BootstrapServers`, `Topic`, `DeadLetterTopic`, `GroupId`,
   `MaxAttempts`). Xóa `RedisOptions`, mục `Redis` trong `appsettings.json` và package `StackExchange.Redis`
   khỏi `.csproj`.
2. `EventProcessor`: giữ nguyên ý nghĩa, nhưng tách rõ kết quả: thành công / lỗi tạm thời (gửi email thất bại) /
   lỗi vĩnh viễn (JSON sai). Loại sự kiện lạ tính là thành công (log Warning).
3. `Workers/EventConsumerWorker`: viết lại theo mục "Consumer" trong `events.md`:
   consumer group, `EnableAutoCommit = false`, commit sau khi xử lý; thử lại với độ trễ 1/2/4 giây; hết lượt hoặc
   lỗi vĩnh viễn thì gửi sang topic thư chết kèm header `error`, `failed-at` rồi commit; Kafka lỗi thì chờ 5 giây
   và thử lại, không để process thoát; `Close()` khi dừng.
   Chạy vòng lặp `Consume` (hàm chặn) trên luồng riêng (`Task.Run` hoặc `LongRunning`) để không chặn host.
4. Tách phần gửi sang topic thư chết thành interface nhỏ (ví dụ `IDeadLetterPublisher`) để test không cần Kafka.

### Test (`tests/NotiService.Tests`)

- Giữ các test hiện có của `EmailTemplateRenderer` và `EventProcessor` (chỉnh cho kết quả mới).
- Lỗi tạm thời: thử lại đúng `MaxAttempts` lần rồi chuyển sang thư chết.
- JSON sai: chuyển sang thư chết ngay, không thử lại.
- Thành công ở lần thử thứ hai: không gửi thư chết.

## Xong khi

- `dotnet build ExeTeamMatching.sln` không lỗi; `dotnet test tests/NotiService.Tests` xanh.
- Không còn tham chiếu nào tới Redis trong `src/NotiService`.
- Nếu máy có Docker (`docker compose up -d kafka mailpit`): chạy `dotnet run --project src/NotiService`, gửi tay
  một message vào topic `exe.events` bằng
  `docker compose exec kafka /opt/kafka/bin/kafka-console-producer.sh --bootstrap-server localhost:9092 --topic exe.events`
  (dán một dòng JSON `EventEnvelope`), và thấy email ở http://localhost:8025. Không làm được thì ghi rõ trong báo cáo.
