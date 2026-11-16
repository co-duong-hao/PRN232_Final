# O2 — Metric nghiệp vụ cho Team Service

Worker 2. Chạy song song với O1. Thiết kế đã chốt trong `docs/design/observability.md`.

## Đọc trước

- `docs/design/observability.md` (bắt buộc: bảng "Team Service", quy ước metric)
- `docs/design/conventions.md` (quy ước và "Luật cho worker")
- `src/Shared/Web/Observability/*` (helper `AddExeMetrics`, `MapExeMetrics`; `SharedMetrics` đã đếm mọi lỗi BR —
  **không** đếm lại)
- Code hiện có: `src/TeamService/Program.cs`, `Services/*`, `Infrastructure/**` (Kafka, cache, job) và
  `tests/TeamService.Tests`

## Được sửa

- `src/TeamService/**`
- `tests/TeamService.Tests/**`

Không sửa `src/Shared/**`, các service khác, `Directory.*.props`, `docker-compose.yml`, `deploy/**`, tài liệu thiết kế,
frontend. Không thêm package.

## Việc cần làm

1. `Program.cs`: `AddExeMetrics("team-service", "Exe.TeamService")`, `app.MapExeMetrics()`.
2. Lớp `TeamMetrics` (singleton, tạo `Meter` qua `IMeterFactory`), mỗi metric một phương thức rõ nghĩa
   (ví dụ `RoomCreated(string courseCode)`), đủ 10 metric trong bảng "Team Service" của `observability.md`.
3. Ghi metric **sau khi** thao tác thành công (sau `SaveChanges`/commit transaction), đúng nhãn:
   - QT01 tạo phòng; QT02 vào thẳng (`direct`); QT04 duyệt đơn (`approved` cho cả join và applications);
     gửi / từ chối / hủy đơn; QT05 rời phòng; QT06 hoàn tất (`exe.groups.formed`); hủy phòng.
   - `KafkaEventPublisher`: `ok` khi Kafka xác nhận, `failed` khi lỗi (giữ nguyên hành vi lỗi hiện tại).
     `NullEventPublisher` không ghi.
   - Cache: hai chỗ đang đặt `X-Cache` (group type, course stats) → `exe.cache.requests` với `hit`/`miss`; mỗi lần
     đọc ghi đúng một lần.
   - `CourseCloseJob` / `CourseCloseProcessor`: mỗi vòng `ok`/`failed`; mỗi Course đóng +1 `exe.courses.closed`.
4. Không đổi API, DTO, hành vi nghiệp vụ hay thứ tự phát sự kiện.

### Test (`tests/TeamService.Tests`)

Giữ toàn bộ test cũ xanh (nếu phải truyền `TeamMetrics` vào chỗ khởi tạo service trong test, tạo một helper dùng
chung). Thêm ít nhất, dùng `MeterListener` (không thêm package):

- Tạo phòng thành công → `exe.rooms.created` +1 với đúng `course`; tạo phòng vi phạm BR → **không** tăng.
- Vào thẳng → `exe.room.joins{mode=direct}`; duyệt đơn → `mode=approved` và `exe.room.applications{result=approved}`.
- Hoàn tất thành nhóm → `exe.groups.formed` +1.
- Cache: lần đầu `miss`, lần hai `hit`.
- Job đóng 1 Course quá hạn → `exe.courses.closed` +1 và vòng chạy `result=ok`.
- Nếu project test đã dùng WebApplicationFactory: `GET /metrics` trả 200.

## Xong khi

- `dotnet build ExeTeamMatching.sln` không lỗi; `dotnet test tests/TeamService.Tests` xanh.
- Nếu máy có Docker: `docker compose build team-service`, `docker compose up -d`, chạy
  `python tests/e2e/e2e_smoke.py .env` (sau `docker compose down -v` nếu dữ liệu đã dùng) vẫn `29/29`; trên
  http://localhost:9090 truy vấn `exe_rooms_created_total` và `exe_kafka_events_published_total` có dữ liệu.
  Không chạy được thì ghi rõ trong báo cáo.
