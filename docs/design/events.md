# Sự kiện và thông báo

Team Service là producer, Noti Service là consumer. Kiểu dữ liệu và hằng số nằm ở
`src/Shared/Contracts/Events/Events.cs`.

## Định dạng trên Redis Streams

- Stream: `Redis:Stream` (mặc định `exe.events`, hằng số `EventStreams.Default`).
- Mỗi entry có hai field:
  - `type`: loại sự kiện (`EventTypes.*`);
  - `payload`: `EventEnvelope.ToJson()`.

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
- Publisher không được ném exception ra ngoài: lỗi Redis chỉ ghi log mức Error. Thao tác nghiệp vụ vẫn
  thành công (hạn chế đã biết: sự kiện có thể mất nếu Redis hỏng đúng lúc đó).

## Consumer (Noti Service)

- Khi khởi động: tạo consumer group `Redis:ConsumerGroup` (mặc định `noti-service`) trên stream với
  `MKSTREAM`, bắt đầu từ `0`; bỏ qua lỗi `BUSYGROUP`.
- Vòng lặp: `XREADGROUP` với id `>` lấy tối đa 10 entry; không có entry thì chờ 1 giây.
  (StackExchange.Redis không hỗ trợ đọc chặn, nên dùng polling.)
- Với mỗi entry: đọc `payload` → `EventEnvelope.FromJson` → gửi một email cho mỗi người nhận → `XACK`.
  Chỉ `XACK` khi mọi email của entry đã gửi xong.
- Entry lỗi (SMTP hỏng, JSON sai) không được ACK và nằm lại trong danh sách pending. Mỗi 30 giây,
  consumer nhận lại các entry pending đã chờ quá 60 giây (`XAUTOCLAIM`) và xử lý lại.
- Entry đã được giao quá 5 lần: ghi log Error kèm `eventId`, chép sang stream `{stream}.dead`, rồi `XACK`.
- Redis mất kết nối: log Warning, chờ 5 giây rồi thử lại; không để process thoát.

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
