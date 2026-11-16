# Giám sát: OpenTelemetry → Prometheus → Grafana (v0.5)

## Mục tiêu

Nhìn hệ thống đang chạy trên một dashboard Grafana: mỗi service nhận bao nhiêu request, chậm hay lỗi ở đâu,
và các con số nghiệp vụ (phòng tạo, đơn, nhóm thành lập, sự kiện Kafka, cache, email, quy tắc BR bị vi phạm).

Chỉ làm **metric**. Không làm log tập trung (Loki) hay trace (Tempo).

## Luồng dữ liệu

```
5 service .NET ──(OpenTelemetry, GET /metrics)──▶ Prometheus (5 s/lần) ──▶ Grafana (dashboard dựng sẵn)
```

| Thành phần | Địa chỉ | Ghi chú |
|---|---|---|
| Grafana | http://localhost:3001 | Xem không cần đăng nhập; sửa dùng `admin` / `GRAFANA_ADMIN_PASSWORD` |
| Prometheus | http://localhost:9090 | *Status → Targets*: 5 target phải `UP` |
| `/metrics` từng service | trong mạng Docker | Gateway không định tuyến `/metrics`; web (Nginx) chỉ chuyển `/api` |

Cổng `/metrics` mà Prometheus gọi: gateway, auth, team, noti `:8080`; matching `:8081` (cổng health HTTP/1.1,
vì `:8080` chỉ nói gRPC HTTP/2).

## Phần Manager đã làm (worker không sửa)

- `Directory.Packages.props`: các package OpenTelemetry (Hosting, AspNetCore, Http, Runtime, Prometheus exporter).
- `src/Shared/Web/Observability/ExeObservability.cs`:
  - `services.AddExeMetrics("<tên-service>", "<tên Meter riêng>"...)`: metric HTTP server/client, runtime .NET,
    meter `Exe.Shared` và các meter của service.
  - `app.MapExeMetrics()`: map `GET /metrics`. Ở Gateway phải gọi **trước** `MapReverseProxy()`.
- `src/Shared/Web/Observability/SharedMetrics.cs`: `exe_api_errors_total{code,status}` — mọi lỗi đi qua
  `AppExceptionHandler` (BR05, BR11, BR19, NOT_FOUND...). Service **không** đếm lại các lỗi này.
- `docker-compose.yml`: `prometheus`, `grafana`; noti-service có `ASPNETCORE_HTTP_PORTS=8080`.
- `deploy/prometheus/prometheus.yml`: job `exe-services`, nhãn `service` = tên service trong compose.
- `deploy/grafana/provisioning/**`: datasource `Prometheus` (uid `prometheus`) và provider đọc
  `deploy/grafana/dashboards/*.json` (thư mục "EXE Team Matching").

## Quy ước metric nghiệp vụ

- Mỗi service một lớp metrics đăng ký **singleton**, tạo `Meter` qua `IMeterFactory` (inject), tên Meter là
  `Exe.<Tên>Service`. Truyền tên Meter vào `AddExeMetrics`.
- Tên instrument dạng `exe.xxx.yyy`; **không đặt `unit`** cho counter (để tên Prometheus đúng như bảng dưới).
  Histogram thời gian dùng `unit: "s"`, giá trị tính bằng giây.
- Nhãn chỉ lấy từ tập giá trị nhỏ, cố định (loại sự kiện, kết quả, mã Course). **Không** dùng Id, email, mã phòng.
- Ghi metric **sau khi** thao tác thành công (sau `SaveChanges` / sau khi Kafka xác nhận), trừ khi bảng ghi
  rõ là đếm thất bại.
- Prometheus đổi `.` thành `_` và thêm `_total` cho counter. Tên trong bảng là tên **trên Prometheus**.

### Team Service — Meter `Exe.TeamService`

| Metric (Prometheus) | Loại | Nhãn | Khi nào tăng |
|---|---|---|---|
| `exe_rooms_created_total` | counter | `course` (mã Course, ví dụ `FA26-EXE101`) | Tạo phòng thành công (QT01) |
| `exe_room_joins_total` | counter | `mode` = `direct` \| `approved` | Vào thẳng (QT02) / đơn được duyệt (QT04) |
| `exe_room_applications_total` | counter | `result` = `submitted` \| `approved` \| `rejected` \| `cancelled` | Gửi, duyệt, từ chối, hủy đơn |
| `exe_room_leaves_total` | counter | — | Rời phòng (QT05) |
| `exe_groups_formed_total` | counter | `course` | Hoàn tất thành nhóm (QT06) |
| `exe_rooms_cancelled_total` | counter | — | Phòng bị hủy |
| `exe_kafka_events_published_total` | counter | `type` (EventTypes), `result` = `ok` \| `failed` | Mỗi lần `KafkaEventPublisher` gửi xong / lỗi |
| `exe_cache_requests_total` | counter | `cache` = `grouptype` \| `course-stats`, `result` = `hit` \| `miss` | Mỗi lần đọc cache Redis có header `X-Cache` |
| `exe_course_close_job_runs_total` | counter | `result` = `ok` \| `failed` | Mỗi vòng chạy của `CourseCloseJob` |
| `exe_courses_closed_total` | counter | — | Mỗi Course được job chuyển sang Closed |

### Noti Service — Meter `Exe.NotiService`

| Metric | Loại | Nhãn | Khi nào |
|---|---|---|---|
| `exe_kafka_events_consumed_total` | counter | `type`, `result` = `processed` \| `skipped` \| `dead_lettered` | Mỗi message đã xử lý xong (sau commit offset) |
| `exe_kafka_event_retries_total` | counter | `type` | Mỗi lần thử lại (1 / 2 / 4 s) |
| `exe_emails_sent_total` | counter | `result` = `ok` \| `failed` | Mỗi email gửi qua SMTP (mỗi người nhận một lần) |
| `exe_event_processing_duration_seconds` | histogram (`unit: "s"`) | `type` | Thời gian xử lý một message, kể cả retry |

`type` không thuộc `EventTypes` (message lạ) thì ghi là `unknown`.

### Matching Service — Meter `Exe.MatchingService`

| Metric | Loại | Nhãn | Khi nào |
|---|---|---|---|
| `exe_matching_requests_total` | counter | `method` = `AnalyzeComposition` \| `RecommendRooms` | Mỗi lời gọi gRPC |
| `exe_composition_checks_total` | counter | `result` = `valid` \| `invalid` | Mỗi kết quả `AnalyzeComposition` |

### Auth Service — Meter `Exe.AuthService`

| Metric | Loại | Nhãn | Khi nào |
|---|---|---|---|
| `exe_logins_total` | counter | `result` = `success` \| `failed` | Mỗi lần gọi đăng nhập |

### Gateway

Chỉ metric HTTP và runtime (không có Meter riêng).

## Metric có sẵn từ thư viện (dùng trong dashboard)

| Metric | Ý nghĩa |
|---|---|
| `http_server_request_duration_seconds_count` / `_bucket` | Số request, độ trễ; nhãn `http_route`, `http_request_method`, `http_response_status_code` |
| `http_client_request_duration_seconds_*` | Gateway gọi Auth/Team |
| `process_runtime_dotnet_gc_heap_size_bytes`, `process_runtime_dotnet_gc_collections_count_total`, `process_runtime_dotnet_thread_pool_threads_count` | Runtime .NET |
| `up` | Prometheus gọi được target hay không |

Tên chính xác của metric runtime phụ thuộc phiên bản package: **kiểm tra trên http://localhost:9090** trước khi
viết truy vấn, không đoán.

## Dashboard `deploy/grafana/dashboards/exe-overview.json`

Tiêu đề "EXE Team Matching", `uid` `exe-overview`, datasource uid `prometheus`, refresh 10 s, mặc định 30 phút
gần nhất, biến `service` (multi, All) lấy từ `label_values(up, service)`. Các hàng:

1. **Tổng quan**: 5 ô `up` theo service (xanh/đỏ); request/giây theo service; tỉ lệ 5xx; p95 độ trễ theo service.
2. **Nghiệp vụ**: phòng tạo, lượt vào phòng theo `mode`, đơn theo `result`, nhóm thành lập (ô số, cộng dồn
   trong khoảng thời gian chọn); bảng/thanh `exe_api_errors_total` theo `code` (top 10).
3. **Kafka**: sự kiện gửi theo `type` (Team) đặt cạnh sự kiện đọc theo `type` (Noti); retry; `dead_lettered`
   (ô số, đỏ khi > 0); p95 thời gian xử lý.
4. **Cache và job**: tỉ lệ HIT theo `cache`; số lần job chạy và Course đã đóng.
5. **Email**: email gửi theo `result`.
6. **Runtime .NET**: bộ nhớ heap, số lần GC, thread pool theo service.

Mọi panel có tiêu đề tiếng Việt và mô tả ngắn (`description`).

## Kiểm tra (Manager làm khi tích hợp)

1. `docker compose up -d`; Prometheus *Targets* 5/5 `UP`.
2. Chạy `python docs/demo/demo.py .env`; trên Grafana thấy phòng tạo, lượt vào, đơn, nhóm thành lập, sự kiện Kafka
   gửi = đọc, email tăng, `exe_api_errors_total` có mã BR mà demo cố ý vi phạm.
3. Gọi `GET /api/courses/{id}/stats` hai lần: `exe_cache_requests_total` có `miss` rồi `hit`.
4. Tắt mailpit, tạo sự kiện: thấy retry và `dead_lettered` tăng.
