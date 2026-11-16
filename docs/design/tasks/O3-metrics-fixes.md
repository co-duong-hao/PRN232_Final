# O3 — Sửa sau tích hợp O1, O2 (dashboard, lớp metrics, test)

Manager đã gộp O1, O2 vào `feat/observability` và chạy trên Docker: Prometheus thấy 5/5 service `UP`, demo 14 bước
chạy đạt, số liệu nghiệp vụ trên Prometheus khớp với demo (1 phòng, 3 lượt vào, 9 sự kiện gửi = 9 sự kiện đọc,
20 email, cache MISS rồi HIT). Còn các lỗi dưới đây. Hai phần làm song song, mỗi worker một phần.

## Đọc trước

- `docs/design/observability.md` — đã cập nhật mục "Dashboard" và "Lưu ý khi viết truy vấn"
- `docs/design/conventions.md` ("Luật cho worker")
- Code hiện có của bạn (đã có trong nhánh của bạn)

---

## Phần A — Worker 1

### Được sửa

- `deploy/grafana/dashboards/exe-overview.json`
- `src/MatchingService/MatchingMetrics.cs`, `src/NotiService/NotiMetrics.cs`, `src/NotiService/Workers/EventConsumerWorker.cs`
- `tests/AuthService.Tests/**`, `tests/MatchingService.Tests/**`, `tests/NotiService.Tests/**`

### Việc cần làm

1. **Dashboard trống (lỗi chính)**: mọi panel `type: "row"` thêm `"collapsed": false` và `"panels": []`. Hiện Grafana
   12 chỉ hiện tiêu đề hàng, không hiện panel nào.
2. **Ô số hiện 0 sau demo**: các panel dùng `increase(...[$__range])` (Phòng đã tạo, Lượt vào phòng, Đơn theo kết quả,
   Nhóm đã thành lập, Mười mã lỗi phổ biến, Số lần thử lại, Sự kiện vào hàng đợi lỗi, Số lần job chạy, Course đã đóng)
   đổi sang tổng, ví dụ `sum(exe_rooms_created_total)`, `sum by (mode) (exe_room_joins_total)`,
   `topk(10, sum by (code) (exe_api_errors_total))`. Thêm vào `description` của từng panel: "Tổng từ lúc service
   khởi động". Ô không có dữ liệu hiện `0` (không phải "No data"): dùng `or vector(0)` cho truy vấn không có `by`.
   Panel "Số lần thử lại" có thể giữ dạng biểu đồ nhưng dùng `rate()`.
3. **Panel "Bộ nhớ heap" không có dữ liệu**: đổi `process_runtime_dotnet_gc_heap_size_bytes` thành
   `process_runtime_dotnet_gc_objects_size_bytes` (metric có thật trên Prometheus).
4. **Lớp metrics**: `MatchingMetrics`, `NotiMetrics` tạo mỗi `Counter`/`Histogram` **một lần** trong constructor
   (field `readonly`), không gọi `CreateCounter` ở mỗi lần ghi. Giữ nguyên tên, nhãn, `unit`.
5. **Định dạng**: trong `EventConsumerWorker.ProcessMessageAsync`, tách dòng `try { ... EventEnvelope.FromJson ... }`
   đang dồn trên một dòng thành khối nhiều dòng như phần còn lại của file. Không đổi logic.
6. **Test còn thiếu so với O1**: Noti — một message lỗi tạm thời đủ số lần thử → `exe.kafka.event.retries` tăng đúng số
   lần thử lại và `exe.kafka.events.consumed{result=dead_lettered}` +1; message loại lạ → `skipped`. Matching —
   `exe.matching.requests{method=RecommendRooms}` +1. Bỏ qua nếu đã có test tương đương, ghi rõ tên test trong báo cáo.

### Xong khi

- `dotnet build ExeTeamMatching.sln` không lỗi; test Auth, Matching, Noti xanh.
- File dashboard đọc được bằng `json.load`; mọi `row` có `collapsed` và `panels`; không còn chuỗi `$__range` và
  `gc_heap_size_bytes` trong file.
- Nếu có Docker: `docker compose restart grafana`, mở http://localhost:3001 thấy đủ 6 hàng và các panel.

---

## Phần B — Worker 2

### Được sửa

- `src/TeamService/Infrastructure/TeamMetrics.cs`
- `tests/TeamService.Tests/**`

### Việc cần làm

1. **Lớp metrics**: `TeamMetrics` tạo 10 counter **một lần** trong constructor (field `readonly`), bỏ hàm
   `Counter(name)` gọi `CreateCounter` ở mỗi lần ghi. Giữ nguyên tên instrument, nhãn và các phương thức public.
2. **Test còn thiếu so với O2** (dùng `MetricCapture` đã có; bỏ qua mục đã có test tương đương, ghi rõ tên test):
   - tạo phòng vi phạm quy tắc (ví dụ BR05) → `exe.rooms.created` **không** tăng;
   - hoàn tất thành nhóm → `exe.groups.formed` +1 với đúng `course`;
   - đọc thống kê Course hai lần → `exe.cache.requests` có `miss` rồi `hit`;
   - job đóng một Course quá hạn → `exe.courses.closed` +1;
   - từ chối đơn → `exe.room.applications{result=rejected}`, không tăng `exe.room.joins`.

### Xong khi

- `dotnet build ExeTeamMatching.sln` không lỗi; `dotnet test tests/TeamService.Tests` xanh.

---

## Chung

Không sửa file ngoài mục "Được sửa" của phần mình, không thêm package, không push, không merge, không đổi nhánh.
Báo cáo: file đã sửa, dòng tổng kết build và test, tên các test mới, việc chưa làm được, giả định đã tự đặt.
