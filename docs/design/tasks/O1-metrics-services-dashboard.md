# O1 — Metric cho Auth, Gateway, Matching, Noti và dashboard Grafana

Worker 1. Chạy song song với O2 (Team Service). Thiết kế đã chốt trong `docs/design/observability.md`.

## Đọc trước

- `docs/design/observability.md` (bắt buộc: tên metric, nhãn, thời điểm ghi, nội dung dashboard)
- `docs/design/conventions.md` (quy ước và "Luật cho worker")
- `src/Shared/Web/Observability/*` (helper `AddExeMetrics`, `MapExeMetrics`, `SharedMetrics` — chỉ đọc)
- Code hiện có của `src/AuthService`, `src/Gateway`, `src/MatchingService`, `src/NotiService` và test tương ứng
- `deploy/prometheus/prometheus.yml`, `deploy/grafana/provisioning/**`, `docker-compose.yml` (chỉ đọc)

## Được sửa

- `src/AuthService/**`, `src/Gateway/**`, `src/MatchingService/**`, `src/NotiService/**`
- `tests/AuthService.Tests/**`, `tests/MatchingService.Tests/**`, `tests/NotiService.Tests/**`
- `deploy/grafana/dashboards/exe-overview.json` (tạo mới)

Không sửa `src/Shared/**`, `src/TeamService/**`, `Directory.*.props`, `docker-compose.yml`, `deploy/prometheus/**`,
`deploy/grafana/provisioning/**`, tài liệu thiết kế, frontend. Không thêm package mới (các package OpenTelemetry đã
có trong `Directory.Packages.props` và được `Exe.Shared.Web` tham chiếu sẵn).

## Việc cần làm

1. **Gateway**: `AddExeMetrics("gateway")`; `app.MapExeMetrics()` **trước** `MapReverseProxy()`.
   `GET http://localhost:8080/metrics` trả text Prometheus, không bị chuyển sang Team.
2. **Auth**: `AddExeMetrics("auth-service", "Exe.AuthService")`, `MapExeMetrics()`; lớp `AuthMetrics`
   (singleton, tạo `Meter` qua `IMeterFactory`) với `exe.logins` theo `observability.md`; ghi `success` / `failed`
   trong luồng đăng nhập.
3. **Matching**: `AddExeMetrics("matching-service", "Exe.MatchingService")`, `MapExeMetrics()`; `/metrics` phải trả
   được trên endpoint `Health` (HTTP/1.1, compose dùng `:8081`). Lớp `MatchingMetrics` với `exe.matching.requests`,
   `exe.composition.checks`.
4. **Noti**:
   - Chuyển từ Worker host sang web host tối thiểu: csproj `Microsoft.NET.Sdk.Web`, `WebApplication.CreateBuilder`,
     giữ nguyên mọi đăng ký và `EventConsumerWorker`; thêm `AddHealthChecks` + `MapHealthChecks("/health")` và
     `MapExeMetrics()`. Compose đã đặt `ASPNETCORE_HTTP_PORTS=8080`.
   - Manager đã đổi image chạy trong `src/NotiService/Dockerfile` sang `aspnet:8.0`; không sửa Dockerfile.
   - `AddExeMetrics("noti-service", "Exe.NotiService")`; lớp `NotiMetrics` với 4 metric trong `observability.md`.
     Ghi đúng chỗ: retry trong vòng thử lại, `dead_lettered` khi đẩy sang DLQ, `processed`/`skipped` sau khi xử lý,
     email theo từng lần gửi SMTP, histogram bao cả thời gian retry.
5. **Dashboard** `deploy/grafana/dashboards/exe-overview.json`: đúng bố cục mục "Dashboard" trong `observability.md`
   (6 hàng, uid `exe-overview`, datasource uid `prometheus`, biến `service`). JSON Grafana chuẩn cho Grafana 12,
   không có `id` cố định, không dùng plugin ngoài. Metric của Team Service dùng đúng tên trong `observability.md`
   dù O2 làm song song.

### Test

Giữ toàn bộ test cũ xanh. Thêm ít nhất (dùng `MeterListener` của `System.Diagnostics.Metrics`, không thêm package):

- Auth: đăng nhập đúng → `exe.logins{result=success}` +1; sai mật khẩu → `failed` +1.
- Matching: `AnalyzeComposition` hợp lệ / không hợp lệ ghi đúng `exe.composition.checks`.
- Noti: message xử lý được → `processed`; lỗi hết số lần retry → các `retries` và `dead_lettered`; gửi email lỗi →
  `exe.emails.sent{result=failed}`.
- Nếu project test đã dùng WebApplicationFactory: gọi `GET /metrics` ở Auth, nhận 200 và có chuỗi
  `http_server_request_duration_seconds`.

## Xong khi

- `dotnet build ExeTeamMatching.sln` không lỗi; `dotnet test` của Auth, Matching, Noti xanh.
- File dashboard là JSON hợp lệ (đọc được bằng `json.load` của Python).
- Nếu máy có Docker: build lần lượt `auth-service`, `matching-service`, `noti-service`, `gateway`, rồi
  `docker compose up -d`; http://localhost:9090/targets thấy 4 target của bạn `UP`; Grafana http://localhost:3001
  mở dashboard không có panel lỗi truy vấn (panel của Team trống là chấp nhận được).
  Không chạy được thì ghi rõ trong báo cáo.
