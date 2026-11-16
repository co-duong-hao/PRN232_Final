# Hướng dẫn chạy dự án và kiểm thử từng công nghệ

Tài liệu này dùng khi cần **chạy hệ thống** và **tự tay chứng minh từng công nghệ hoạt động** (REST, JWT, gRPC,
Kafka, Redis, background job, Docker, CI/CD, Grafana). Mỗi mục ghi: lệnh chạy, kết quả đúng phải thấy, và test tự
động tương ứng.

- Mọi lệnh chạy trong **PowerShell** tại thư mục gốc dự án (có file `docker-compose.yml`).
- Cài đặt lần đầu, lỗi thường gặp và chạy ngoài Docker: xem thêm [HUONG_DAN_CHAY.md](HUONG_DAN_CHAY.md).

---

## Phần A — Chạy dự án

### A1. Cần có

| Phần mềm | Dùng để |
|---|---|
| Docker Desktop (cấp **6–8 GB RAM** trong *Settings → Resources*) | Chạy toàn bộ hệ thống |
| Git | Lấy mã nguồn |
| Python 3 | Kịch bản demo, kiểm thử end-to-end |
| .NET SDK 8 | Unit test |
| Node.js 20+ (tùy chọn) | Build, kiểm tra frontend |

### A2. Lần đầu trên một máy

```powershell
git clone https://github.com/co-duong-hao/PRN232_Final.git
cd PRN232_Final
Copy-Item .env.example .env
notepad .env          # sửa MSSQL_ACCEPT_EULA=Y rồi lưu
```

Build image **từng cái một** (build song song dễ làm Docker sập), lần đầu khoảng 5–10 phút:

```powershell
docker compose build auth-service
docker compose build team-service
docker compose build matching-service
docker compose build noti-service
docker compose build gateway
docker compose build web
```

Hoặc tải image CI/CD đã build sẵn (cần token GitHub quyền `read:packages`, dán token khi hỏi mật khẩu):

```powershell
docker login ghcr.io -u <tên-GitHub>
docker compose pull
```

### A3. Khởi động

```powershell
docker compose up -d                 # dùng image đã pull: docker compose up -d --no-build
```

Chờ 30–60 giây rồi kiểm tra:

```powershell
docker compose ps                       # đủ 13 container "Up"; sqlserver, redis, kafka, mailpit có "(healthy)"
curl.exe http://localhost:8080/health   # Healthy
```

| Địa chỉ | Nội dung |
|---|---|
| http://localhost:3000 | Web app |
| http://localhost:8025 | Mailpit — mọi email hệ thống và email cảnh báo |
| http://localhost:3001 | Grafana — dashboard "EXE Team Matching" |
| http://localhost:9090 | Prometheus |
| http://localhost:5101/swagger · http://localhost:5102/swagger | Swagger Auth · Team |
| http://localhost:8080 | API Gateway |

Tài khoản (mật khẩu là `SEED_DEFAULT_PASSWORD` trong `.env`): `admin@exe.local`, `hod@exe.local`,
`lecturer@exe.local`, `student01@exe.local` … `student12@exe.local`.

### A4. Đưa dữ liệu về ban đầu

Các bài kiểm thử ở phần B làm thay đổi dữ liệu. Trước mỗi lượt kiểm thử hoặc trước buổi demo:

```powershell
docker compose down -v
docker compose up -d
```

Chờ 60 giây. (`down` không có `-v` thì dừng hệ thống nhưng giữ dữ liệu.)

### A5. Chuẩn bị cho các lệnh kiểm thử

Dán đoạn này **một lần** vào cửa sổ PowerShell; các mục ở phần B dùng lại biến và hàm này.

```powershell
$GW  = "http://localhost:8080"
$PW  = (Get-Content .env | Where-Object { $_ -match '^SEED_DEFAULT_PASSWORD=' }) -replace '^SEED_DEFAULT_PASSWORD=', ''
$EXE101 = "30000000-0000-0000-0000-000000000001"
$EXE201 = "30000000-0000-0000-0000-000000000002"
function Login($email) {
  $body = @{ email = $email; password = $PW } | ConvertTo-Json
  (Invoke-RestMethod -Method Post -Uri "$GW/api/auth/login" -ContentType "application/json" -Body $body).accessToken
}
function Auth($email) { @{ Authorization = "Bearer $(Login $email)" } }
```

---

## Phần B — Kiểm thử từng công nghệ

Làm theo thứ tự B1 → B11, ngay sau khi reset dữ liệu (A4). Bảng tóm tắt ở cuối.

### B1. REST API và kiến trúc phân lớp

**Chứng minh:** API theo REST, có tìm kiếm, lọc, sắp xếp, phân trang; tài liệu Swagger.

```powershell
$A = Auth "admin@exe.local"
Invoke-RestMethod "$GW/api/users?q=student&sortBy=fullName&page=1&pageSize=5" -Headers $A |
  Select-Object page, pageSize, totalItems, @{ n = "items"; e = { $_.items.email } }
```

Đúng khi: `pageSize` = 5, `totalItems` = 12, `items` là 5 email sinh viên xếp theo họ tên.

```powershell
$L = Auth "lecturer@exe.local"
(Invoke-RestMethod "$GW/api/courses?sortBy=deadline&sortDir=desc" -Headers $L).items | Format-Table code, status, deadline
```

Đúng khi: thấy `FA26-EXE101` và `FA26-EXE201`, trạng thái `Forming`.

Mở http://localhost:5102/swagger: các nhóm endpoint Courses, Rooms, RoomApplies, Groups… Bấm **Authorize**, dán
token (kết quả của `Login "lecturer@exe.local"`) để gọi thử.

Test tự động: `tests/TeamService.Tests/CatalogTests.cs`, `RoomServiceTests.cs`.

### B2. JWT, phân quyền và xử lý lỗi (ProblemDetails)

```powershell
curl.exe -s -o NUL -w "Không token: %{http_code}`n" "$GW/api/courses"
$S = Auth "student01@exe.local"
try { Invoke-RestMethod "$GW/api/users" -Headers $S } catch { "Sinh viên gọi API của Admin: $($_.Exception.Response.StatusCode.value__)" }
curl.exe -s -X POST "$GW/api/auth/login" -H "Content-Type: application/json" -d '{\"email\":\"admin@exe.local\",\"password\":\"sai\"}'
```

Đúng khi:

- không token → `401` (Gateway chặn);
- sinh viên gọi `/api/users` → `403` (sai vai trò);
- sai mật khẩu → JSON dạng ProblemDetails có `"status":401` và `"code":"INVALID_CREDENTIALS"`.

Xem nội dung token: dán kết quả `Login "student01@exe.local"` vào https://jwt.io — có vai trò `Student` và thời hạn
60 phút (`exp`). Token chỉ dùng cho máy thử, không dán token của hệ thống thật lên trang ngoài.

Test tự động: `tests/AuthService.Tests/AuthTests.cs`.

### B3. Database, EF Core và ràng buộc

```powershell
docker compose logs auth-service team-service | Select-String "Applying migration" | Select-Object -First 5
```

Đúng khi: sau `down -v` có dòng áp dụng migration — database được tạo tự động khi service khởi động.

Ràng buộc BR05 (mỗi sinh viên một phòng trong một Course) do unique index chặn — chạy
`python tests/e2e/e2e_smoke.py .env` (mục B9) và tìm dòng `BR05 ... 409`.

Test tự động: `tests/TeamService.Tests/TeamDbTests.cs`, `RoomServiceTests.cs` (BR05, BR11, thao tác đồng thời).

### B4. gRPC — Matching Service

Matching không mở cổng ra ngoài; Team Service gọi nó qua gRPC. Kiểm tra qua hai API dùng gRPC:

```powershell
$S1 = Auth "student01@exe.local"
$room = Invoke-RestMethod -Method Post "$GW/api/courses/$EXE101/rooms" -Headers $S1 -ContentType "application/json" -Body "{}"
$room.code
Invoke-RestMethod "$GW/api/rooms/$($room.id)/composition" -Headers $S1 | ConvertTo-Json -Depth 5
$S9 = Auth "student09@exe.local"
Invoke-RestMethod "$GW/api/courses/$EXE101/rooms/recommendations?limit=3" -Headers $S9 | Format-Table roomCode, score, canJoin, reasons
```

Đúng khi:

- tạo được phòng `FA26-EXE101-R001`;
- `composition` báo `"satisfied": false` kèm `violations` như "BR14: thiếu 3 thành viên (1/4)", "BR15: ngành SE thiếu
  1 sinh viên" — kết quả của `AnalyzeComposition`;
- `recommendations` trả phòng `FA26-EXE101-R001` với `score`, `canJoin` và lý do — kết quả của `RecommendRooms`.

gRPC lỗi có kiểm soát: `docker compose stop matching-service`, gọi lại dòng `composition` → `503`
(`SERVICE_UNAVAILABLE`); sau đó `docker compose start matching-service`.

Test tự động: `tests/MatchingService.Tests`, `tests/TeamService.Tests/Infrastructure/GrpcMatchingClientTests.cs`.

### B5. Message broker — Apache Kafka

Bước B4 đã sinh sự kiện `RoomCreated`. Xem sự kiện trong topic (key là mã phòng):

```powershell
docker compose exec -T kafka /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic exe.events --from-beginning --max-messages 3 --timeout-ms 10000 --property print.key=true
```

Consumer đã đọc hết chưa (cột `LAG` bằng 0):

```powershell
docker compose exec -T kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group noti-service
```

Email do consumer gửi: mở http://localhost:8025, có thư về phòng `FA26-EXE101-R001`.

**Thử lại và thư chết (DLQ)** khi gửi email lỗi:

```powershell
docker compose stop mailpit
$S2 = Auth "student02@exe.local"
Invoke-RestMethod -Method Post "$GW/api/rooms/$($room.id)/join" -Headers $S2 | Out-Null   # sinh sự kiện RoomMemberJoined
Start-Sleep 15
docker compose logs noti-service --since 1m | Select-String "fail:"
docker compose exec -T kafka /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic exe.events.dlq --from-beginning --max-messages 1 --timeout-ms 10000
docker compose start mailpit
```

Đúng khi: lệnh vào phòng vẫn thành công (lỗi email không làm hỏng nghiệp vụ); log Noti có dòng `fail:` báo không
xử lý được sự kiện sau 3 lần thử (cách 1, 2, 4 giây); topic `exe.events.dlq` có đúng sự kiện `RoomMemberJoined` đó. Trong lúc Mailpit tắt, Grafana cũng
chuyển ô `mailpit` sang DOWN.

Test tự động: `tests/NotiService.Tests/EventConsumerWorkerTests.cs` (retry, DLQ, commit offset),
`tests/TeamService.Tests/Infrastructure/KafkaEventPublisherTests.cs`.

### B6. Cache — Redis

```powershell
$L = Auth "lecturer@exe.local"
1..2 | ForEach-Object { (Invoke-WebRequest "$GW/api/courses/$EXE101/stats" -Headers $L -UseBasicParsing).Headers["X-Cache"] }
docker compose exec -T redis redis-cli --scan --pattern "exe-team:*"
```

Đúng khi: lần 1 `MISS`, lần 2 `HIT`; Redis có khóa `exe-team:course:...:stats`. Sau 30 giây (hết hạn) hoặc khi có
người vào/rời phòng, lần gọi kế tiếp lại là `MISS`.

Redis tắt, hệ thống vẫn chạy:

```powershell
docker compose stop redis
(Invoke-WebRequest "$GW/api/courses/$EXE101/stats" -Headers $L -UseBasicParsing).StatusCode   # 200, đọc thẳng database
docker compose start redis
```

Test tự động: `tests/TeamService.Tests/Infrastructure/TeamCacheTests.cs`.

### B7. Background job — tự đóng Course quá hạn

Đặt hạn ghép nhóm của EXE201 về quá khứ (cần EXE201 đang `Forming`; nếu đã chạy `--workflows` ở B9 thì reset A4):

```powershell
$H = Auth "hod@exe.local"
$c = Invoke-RestMethod "$GW/api/courses/$EXE201" -Headers $H
$body = @{ groupTypeId = $c.groupTypeId
           startTime   = (Get-Date).ToUniversalTime().AddDays(-1).ToString("o")
           deadline    = (Get-Date).ToUniversalTime().AddMinutes(-1).ToString("o") } | ConvertTo-Json
Invoke-RestMethod -Method Put "$GW/api/courses/$EXE201" -Headers $H -ContentType "application/json" -Body $body | Select-Object code, status
Start-Sleep 65
(Invoke-RestMethod "$GW/api/courses/$EXE201" -Headers $H).status
```

Đúng khi: ngay sau khi sửa vẫn `Forming`; sau tối đa 60 giây thành `Closed` (job chạy mỗi 60 giây). Grafana ô
"Course đã đóng" tăng 1; nếu EXE201 có phòng chưa hoàn tất thì thành viên nhận email báo Course đã đóng.

Test tự động: `tests/TeamService.Tests/Infrastructure/CourseCloseJobTests.cs`, `CourseCloseProcessorTests.cs`.

### B8. Docker và Docker Compose

```powershell
docker compose ps --format "table {{.Service}}\t{{.Status}}"
docker compose config --services
docker compose restart team-service      # service khởi động lại, tự kết nối lại database, Kafka, Redis
```

Đúng khi: 13 container; hạ tầng `(healthy)`; service .NET chỉ khởi động sau khi SQL Server, Kafka, Redis healthy
(`depends_on: condition: service_healthy` trong `docker-compose.yml`). Mỗi service .NET có Dockerfile riêng trong
`src/<Service>/Dockerfile`, chạy bằng user không phải root.

### B9. Kiểm thử tự động

Unit test (không cần Docker):

```powershell
dotnet test ExeTeamMatching.sln
```

Đúng khi: 4 dòng `Passed!` (Auth, Matching, Noti, Team), không có `Failed`.

End-to-end trên hệ thống thật, ngay sau khi reset (A4):

```powershell
python tests/e2e/e2e_smoke.py .env               # 29/29 checks passed — EXE101: QT01–QT06, BR05/09/16/18, gRPC, email
python tests/e2e/e2e_smoke.py .env --workflows   # 55/55 workflow checks passed — EXE201: rời phòng, tìm theo GPA/vai trò, đơn, đóng Course
```

Demo 14 bước có lời dẫn (reset trước): `python docs/demo/demo.py .env`.

Mã thoát của các script: `0` đạt · `1` lỗi (đọc dòng thông báo) · `2` dữ liệu đã dùng, cần reset.

Kiểm thử giao diện trên Chromium (cài một lần `pip install playwright` và `python -m playwright install chromium`):

```powershell
python tests/e2e/browser_smoke.py .env
```

Frontend (cần Node.js):

```powershell
cd frontend; npm ci; npm run format:check; npm run build; cd ..
```

### B10. CI/CD — GitHub Actions và GHCR

- Mở tab **Actions** của repo trên GitHub: mỗi lần push có một lần chạy **CI/CD** gồm `backend` (build + unit test),
  `frontend` (Prettier + build) và 6 job `Docker image`. Push lên `main` thì image được đẩy lên GHCR.
- Thấy CI bắt lỗi: tạo nhánh thử, cố ý làm hỏng một test, push nhánh đó — job `backend` đỏ. Xóa nhánh sau khi xem.
- Chạy đúng các bước của job `backend` trên máy:

```powershell
dotnet build ExeTeamMatching.sln -c Release
dotnet test ExeTeamMatching.sln -c Release --no-build
```

- Chạy bằng image do CI build: `docker compose pull`, rồi `docker compose up -d --no-build`. Muốn chạy một bản cũ:
  đặt `IMAGE_TAG=sha-<7 ký tự commit>` trong `.env`.

### B11. Giám sát — Prometheus, Grafana, cảnh báo

```powershell
Start-Process http://localhost:9090/targets     # mọi target UP
Start-Process http://localhost:3001             # dashboard EXE Team Matching
```

- Reset (A4), chạy `python docs/demo/demo.py .env`, rồi xem Grafana: "Phòng đã tạo", "Lượt vào phòng", "Nhóm đã thành
  lập", "Sự kiện gửi/đọc theo loại", "Mười mã lỗi phổ biến" đều có số khớp với demo.
- Truy vấn trực tiếp trên Prometheus (ô *Query*): `exe_rooms_created_total`, `sum(exe_kafka_events_published_total)`,
  `exe:service_up`.

Cảnh báo container down:

```powershell
docker compose stop redis      # ô redis DOWN sau ~5 giây; Mailpit nhận "[FIRING:1] Container không phản hồi redis" sau ~40 giây
docker compose start redis     # khoảng 40 giây sau có email "[RESOLVED] ..."
```

---

## Bảng tóm tắt

| Công nghệ | Kiểm tra nhanh | Kết quả đúng | Test tự động |
|---|---|---|---|
| REST API | B1: `/api/users?page=1&pageSize=5` | 5 kết quả, `totalItems` 12 | CatalogTests, RoomServiceTests |
| JWT, phân quyền | B2: gọi không token / sai vai trò | 401 / 403, ProblemDetails có `code` | AuthTests |
| EF Core, SQL Server | B3: log migration | Database tự tạo | TeamDbTests |
| gRPC | B4: `/composition`, `/recommendations` | Thiếu ngành; có gợi ý; 503 khi Matching tắt | MatchingTests, GrpcMatchingClientTests |
| Kafka | B5: đọc topic, LAG, DLQ | Có sự kiện; LAG 0; DLQ khi SMTP chết | EventConsumerWorkerTests, KafkaEventPublisherTests |
| Redis | B6: header `X-Cache` | MISS rồi HIT; Redis tắt vẫn 200 | TeamCacheTests |
| Background job | B7: hạn về quá khứ | `Closed` trong 60 giây | CourseCloseJobTests, CourseCloseProcessorTests |
| Docker Compose | B8: `docker compose ps` | 13 container Up | — |
| End-to-end | B9: `e2e_smoke.py` (+ `--workflows`) | 29/29 và 55/55 | — |
| CI/CD | B10: tab Actions | Mọi job xanh, image trên GHCR | — |
| Giám sát | B11: dừng Redis | Ô đỏ, email FIRING rồi RESOLVED | — |
