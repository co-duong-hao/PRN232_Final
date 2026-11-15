# Sự kiện và thông báo

Team Service là producer, Noti Service là consumer, qua **Apache Kafka**. (Redis không còn làm broker; Redis chỉ làm cache, xem `caching.md`.) Kiểu dữ liệu và hằng số nằm ở
`src/Shared/Contracts/Events/Events.cs`.

## Định dạng trên Kafka

- Broker: Kafka 3.9 một node, chế độ KRaft (`docker-compose.yml`, service `kafka`). Trong Docker dùng
  `kafka:9092`; từ máy cá nhân dùng `localhost:9094`. Cấu hình: `Kafka:BootstrapServers`.
- Topic sự kiện: `exe.events` (`KafkaTopics.Events`), 3 partition (broker tự tạo topic khi có message đầu tiên).
- Topic thư chết: `exe.events.dlq` (`KafkaTopics.EventsDeadLetter`).
- Mỗi message:
  - **key**: `EventEnvelope.EventKey` — mã phòng, hoặc mã Course với sự kiện của Course. Các sự kiện của cùng một
    phòng vào cùng partition nên giữ đúng thứ tự;
  - **value**: `EventEnvelope.ToJson()` (UTF-8);
  - **header** `event-type` (`KafkaTopics.TypeHeader`): loại sự kiện.

```json
{
  "eventId": "6f1c...",
  "type": "RoomApplyDecided",
  "occurredAt": "2026-11-15T03:20:00Z",
  "recipients": [{ "email": "student11@exe.local", "fullName": "Sinh viên 11" }],
  "data": { "courseCode": "FA26-EXE101", "roomCode": "FA26-EXE101-R001", "actorName": "Sinh viên 01", "decision": "Approved" }
}
```

Producer tự tìm người nhận và ghi email vào `recipients`, nên consumer không cần tra cứu gì.
Sự kiện không có người nhận (`recipients` rỗng) vẫn được phát.

## Danh sách sự kiện

| `type` | Phát khi | `recipients` | `data` |
|---|---|---|---|
| `RoomCreated` | Tạo phòng (QT01) | người tạo | `courseCode`, `roomCode` |
| `RoomMemberJoined` | Vào phòng trực tiếp (QT02) hoặc đơn được duyệt (QT03) | các thành viên đã ở trong phòng trước đó | `courseCode`, `roomCode`, `actorName` (người mới vào), `memberCount` |
| `RoomLocked` | Phòng chuyển Open → Locked (BR08) | mọi thành viên | `courseCode`, `roomCode`, `memberCount` |
| `RoomApplyCreated` | Gửi đơn (QT03) | trưởng phòng | `courseCode`, `roomCode`, `actorName` (người xin), `message` |
| `RoomApplyDecided` | Duyệt hoặc từ chối đơn (QT03) | người gửi đơn | `courseCode`, `roomCode`, `actorName` (trưởng phòng), `decision` (`Approved` \| `Rejected`) |
| `RoomLeaderChanged` | Đổi trưởng phòng (QT05) | mọi thành viên | `courseCode`, `roomCode`, `actorName` (trưởng phòng mới) |
| `RoomCompleted` | Hoàn tất phòng (QT06) | mọi thành viên | `courseCode`, `roomCode`, `groupCode` |
| `CourseDeadlineReminder` | Job nhắc hạn | sinh viên của Course chưa ở trong nhóm | `courseCode`, `deadline` |
| `CourseClosed` | Job đóng ghép nhóm hoặc đóng thủ công | thành viên các phòng `Open`/`Locked` của Course | `courseCode` |

## Producer (Team Service)

- Gọi `IEventPublisher.PublishAsync` **sau khi** `SaveChanges` thành công, không gọi bên trong transaction.
- Một `IProducer<string, string>` dùng chung (singleton) với `Acks = All`, `EnableIdempotence = true`,
  `MessageTimeoutMs = 5000`. Chờ broker xác nhận (`ProduceAsync`) rồi mới trả về.
- Publisher không được ném exception ra ngoài: lỗi Kafka (broker tắt, quá thời gian) chỉ ghi log mức Error kèm
  `EventId`, `Type`. Thao tác nghiệp vụ vẫn thành công (hạn chế đã biết: sự kiện có thể mất nếu Kafka hỏng đúng
  lúc đó).
- Khi tắt ứng dụng: `Flush` producer tối đa 5 giây.

## Consumer (Noti Service)

- Consumer group `noti-service` (`Kafka:GroupId`), `AutoOffsetReset = Earliest`, `EnableAutoCommit = false`.
- Vòng lặp: `Consume` với timeout 1 giây → xử lý → **commit offset sau khi xử lý xong**. Nhờ vậy service khởi
  động lại sẽ đọc tiếp từ message chưa xử lý (at-least-once).
- Xử lý một message: đọc value → `EventEnvelope.FromJson` → gửi một email cho mỗi người nhận.
  - Thành công → commit.
  - Lỗi tạm thời (SMTP hỏng): thử lại tối đa `Kafka:MaxAttempts` lần (mặc định 3), chờ 1 s, 2 s, 4 s giữa các lần.
  - Vẫn lỗi, hoặc JSON sai: gửi nguyên message (key, value, header) sang `exe.events.dlq`, thêm header
    `error` (mô tả ngắn) và `failed-at` (ISO 8601), log Error kèm `eventId` nếu đọc được, rồi commit.
- Loại sự kiện không có trong bảng email: log Warning và commit.
- Kafka không kết nối được: log Warning, chờ 5 giây rồi thử lại; không để process thoát.
- Khi tắt ứng dụng: `Close()` consumer để rời group gọn gàng.

## Email

Người gửi lấy từ `Smtp:From` và `Smtp:FromName`. Nội dung dạng văn bản thuần, mở đầu bằng
`Chào {fullName},`.

| `type` | Tiêu đề | Nội dung chính |
|---|---|---|
| `RoomCreated` | `[EXE] Bạn đã tạo phòng {roomCode}` | Bạn là trưởng phòng {roomCode} của {courseCode}. |
| `RoomMemberJoined` | `[EXE] {actorName} đã vào phòng {roomCode}` | Phòng hiện có {memberCount} thành viên. |
| `RoomLocked` | `[EXE] Phòng {roomCode} đã khóa` | Phòng đủ {memberCount} thành viên; người mới phải gửi đơn để trưởng phòng duyệt. |
| `RoomApplyCreated` | `[EXE] Đơn xin vào phòng {roomCode}` | {actorName} xin vào phòng. Lời nhắn: {message}. |
| `RoomApplyDecided` | `[EXE] Đơn vào phòng {roomCode}: {được chấp nhận \| bị từ chối}` | {actorName} đã {chấp nhận \| từ chối} đơn của bạn. |
| `RoomLeaderChanged` | `[EXE] Phòng {roomCode} có trưởng phòng mới` | Trưởng phòng mới là {actorName}. |
| `RoomCompleted` | `[EXE] Nhóm {groupCode} đã được thành lập` | Phòng {roomCode} đã hoàn tất và trở thành nhóm {groupCode}. |
| `CourseDeadlineReminder` | `[EXE] Sắp hết hạn ghép nhóm {courseCode}` | Hạn ghép nhóm là {deadline}. Bạn chưa có nhóm. |
| `CourseClosed` | `[EXE] {courseCode} đã đóng ghép nhóm` | Phòng của bạn chưa hoàn tất; giảng viên sẽ hỗ trợ xếp nhóm. |

Loại sự kiện không có trong bảng: log Warning và `XACK`.
