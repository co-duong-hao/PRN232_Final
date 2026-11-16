# Kịch bản thuyết trình — phần công nghệ

Dùng cho phần **Design** và **Proof** của buổi báo cáo PRN232 (Nhóm 6). Mỗi mục gồm:

- **Slide**: slide đang chiếu (theo bộ 29 slide `EXE_Team_Matching_Nhom6.pptx`, bản v0.5).
- **Nói**: lời thoại gợi ý, nói tự nhiên, không cần thuộc từng chữ.
- **Làm**: thao tác minh họa trên máy (nếu có).
- **Nếu bị hỏi**: câu hỏi hội đồng hay hỏi và ý trả lời.

Tổng thời lượng phần công nghệ: khoảng **14–16 phút**. Trước giờ báo cáo làm theo phần 9 của
`docs/HUONG_DAN_CHAY.md` (reset dữ liệu, 13 container `Up`), mở sẵn các tab: web `:3000`, Mailpit `:8025`,
Grafana `:3001`, Swagger Team `:5102/swagger`, GitHub Actions của repo.

---

## 0. Tổng quan kiến trúc (1,5 phút)

**Slide**: 09 — System Architecture.

**Nói**:

> Hệ thống của nhóm em gồm **5 microservice viết bằng ASP.NET Core 8**, đứng sau một **API Gateway**.
> Người dùng chỉ làm việc với web React; mọi lời gọi API đi qua Gateway.
>
> - **Auth Service**: đăng nhập, cấp JWT, quản lý tài khoản. Có database riêng là AuthDb.
> - **Team Service**: toàn bộ nghiệp vụ ghép nhóm — Course, Phòng, đơn xin vào, nhóm. Database riêng TeamDb.
> - **Matching Service**: service độc lập giao tiếp bằng **gRPC**, kiểm tra cơ cấu ngành và gợi ý phòng.
> - **Noti Service**: đọc sự kiện từ **Kafka** và gửi email.
> - **Gateway**: dùng **YARP**, kiểm tra JWT rồi chuyển request tới đúng service.
>
> Ba kiểu giao tiếp trên sơ đồ: **REST** đồng bộ giữa web, Gateway và service; **gRPC** giữa Team và Matching;
> **bất đồng bộ qua Kafka** giữa Team và Noti. Ngoài ra Team dùng **Redis** làm cache.
> Mỗi service một database — Auth và Team không đọc database của nhau, chỉ tham chiếu qua `UserId`.

**Nếu bị hỏi** "Vì sao tách 5 service mà không làm một API?":
> Mỗi service một trách nhiệm và đúng một công nghệ đề yêu cầu: Matching để minh họa gRPC độc lập, Noti để minh
> họa consumer chạy nền. Noti hỏng thì người dùng vẫn ghép nhóm được, email gửi bù khi Noti chạy lại vì Kafka giữ
> sự kiện.

---

## 1. REST API, kiến trúc phân lớp, JWT (2 phút) — tiêu chí 20%

**Slide**: 13 — Class Design (và 10 — Technology Stack).

**Nói**:

> Auth và Team là hai **REST API** theo kiến trúc **Controller – Service – Repository**:
>
> - **Controller** chỉ nhận request và trả kết quả, không chứa quy tắc nghiệp vụ.
> - **Service** chứa toàn bộ quy tắc BR01–BR22, ví dụ `RoomService.JoinAsync` kiểm tra BR02, BR05, BR19, BR11.
> - **Repository / DbContext** của EF Core truy cập dữ liệu.
> - Hạ tầng như Kafka, gRPC client, cache đều nằm sau **interface** (`IEventPublisher`, `IMatchingClient`,
>   `ITeamCache`), đăng ký bằng **Dependency Injection**, nên khi test em thay bằng Moq.
>
> API đặt tên theo REST: danh từ số nhiều, động từ HTTP — `GET /api/courses/{id}/rooms`,
> `POST /api/rooms/{id}/join`, `POST /api/rooms/{id}/complete`.
> Các danh sách hỗ trợ **tìm kiếm, lọc, sắp xếp, phân trang** cùng một bộ tham số `q`, `page`, `pageSize`, `sortBy`,
> `sortDir`; danh sách phòng còn lọc theo trạng thái, GPA và vai trò cần tuyển.
>
> **Xác thực bằng JWT HS256**: Auth Service băm mật khẩu bằng `PasswordHasher` của ASP.NET, đăng nhập đúng thì trả
> token 60 phút chứa vai trò. Gateway kiểm tra token trước khi chuyển tiếp; Team Service kiểm tra lại và phân quyền
> theo 4 vai trò.
>
> **Lỗi** trả về theo chuẩn **ProblemDetails (RFC 7807)** kèm mã lỗi ổn định, ví dụ vào phòng thứ hai trong cùng
> Course trả `409` với `code: "BR05"`. Web đọc mã này để hiện thông báo tiếng Việt.

**Làm**: mở Swagger Team (`:5102/swagger`), chỉ nhanh nhóm endpoint Rooms và các tham số phân trang.

**Nếu bị hỏi** "Token hết hạn thì sao?":
> Hiện token 60 phút, hết hạn thì đăng nhập lại — đây là hạn chế đã ghi ở slide 26, hướng làm tiếp là refresh token
> có thu hồi.

---

## 2. Dữ liệu: EF Core, SQL Server, ràng buộc (1,5 phút)

**Slide**: 14, 15 — Database Design.

**Nói**:

> Hai database **SQL Server 2022**, quản lý bằng **EF Core 8 code-first**. Migration nằm trong mã nguồn và tự chạy
> khi service khởi động, kèm dữ liệu mẫu — nên `docker compose up` là có hệ thống dùng được ngay.
>
> Quy tắc quan trọng được chặn **ngay ở database**, không chỉ ở code:
>
> - BR05 "mỗi sinh viên tối đa một phòng trong một Course" là **unique index** `(CourseId, StudentId)` trên bảng
>   thành viên phòng. Hai request cùng lúc thì một cái bị database từ chối.
> - Bảng Phòng có cột **concurrency token**: hai người cùng vào chỗ cuối cùng thì một người nhận lỗi
>   `CONCURRENCY_CONFLICT`, phòng không bao giờ vượt số người (BR11).

---

## 3. gRPC — Matching Service (1,5 phút) — tiêu chí 15%

**Slide**: 12 — Sequence QT06.

**Nói**:

> Matching là service **độc lập, không có database**, chỉ nói **gRPC** trên HTTP/2. Hợp đồng viết trong
> `matching.proto`, có hai phương thức:
>
> - `AnalyzeComposition`: nhận quy tắc loại nhóm và danh sách ngành của thành viên, trả về đạt hay không và thiếu,
>   thừa ngành nào — dùng cho BR14, BR15.
> - `RecommendRooms`: nhận ngành của sinh viên và các phòng đang mở, trả danh sách phòng xếp theo mức phù hợp.
>
> Khi trưởng phòng bấm **Hoàn tất**, Team Service gọi `AnalyzeComposition` qua gRPC client. Không đạt thì trả `409
> BR16` kèm ngành còn thiếu; đạt thì tạo nhóm chính thức. Matching chết thì Team trả `503` rõ ràng thay vì treo.

**Làm**: trên web, ở trang chi tiết phòng bấm **Kiểm tra cơ cấu**, chỉ kết quả "thiếu ngành …"; ở trang phòng
trong Course chỉ khối **Gợi ý cho bạn**.

**Nếu bị hỏi** "Vì sao dùng gRPC mà không dùng REST?":
> gRPC có hợp đồng kiểu mạnh sinh code từ `.proto` cho cả hai phía, payload nhị phân nhỏ, hợp với gọi nội bộ giữa
> service. Ra ngoài trình duyệt thì vẫn dùng REST qua Gateway.

---

## 4. Message broker — Apache Kafka (2 phút) — tiêu chí 15%

**Slide**: 09, phụ lục A2 (danh sách sự kiện).

**Nói**:

> Nhóm em chọn **Apache Kafka 3.9** chạy chế độ **KRaft** (không cần ZooKeeper), topic `exe.events` 3 partition.
>
> **Producer** là Team Service. Mỗi thao tác quan trọng — tạo phòng, vào phòng, khóa phòng, gửi đơn, duyệt đơn, đổi
> trưởng phòng, hoàn tất, nhắc hạn, đóng Course — phát một sự kiện, tổng cộng **9 loại**.
>
> - **Key là mã phòng**, nên mọi sự kiện của một phòng vào cùng partition và **giữ đúng thứ tự**.
> - Cấu hình `acks=all` và **idempotent producer**: Kafka xác nhận khi đã ghi chắc, gửi lại không bị trùng.
>
> **Consumer** là Noti Service, chạy dưới dạng `BackgroundService`, nằm trong **consumer group** `noti-service`.
>
> - Tắt auto-commit: **chỉ commit offset sau khi gửi email xong**, nên Noti tắt giữa chừng thì khởi động lại đọc
>   tiếp, không mất sự kiện.
> - Lỗi tạm thời (SMTP chập chờn) thì **thử lại sau 1, 2, 4 giây**; vẫn lỗi thì đẩy sang topic **thư chết**
>   `exe.events.dlq` để xử lý sau, không chặn các sự kiện khác.

**Làm**: sau khi demo duyệt đơn, mở Mailpit `:8025` chỉ email vừa tới. Nếu còn thời gian, chạy lệnh xem consumer
group (phần 8 của hướng dẫn chạy) để chỉ cột `LAG = 0`.

**Nếu bị hỏi** "Kafka lỗi đúng lúc lưu xong thì sao?":
> Đó là hạn chế em đã ghi (slide 26): sự kiện phát sau khi lưu nên có thể mất email của thao tác đó. Hướng làm là
> **outbox pattern**: ghi sự kiện vào bảng trong cùng transaction rồi job nền đẩy sang Kafka.

---

## 5. Cache — Redis (1 phút)

**Slide**: phụ lục A2.

**Nói**:

> Team Service dùng **Redis 7** qua `IDistributedCache` cho hai thứ đọc nhiều: **loại nhóm** (giữ 10 phút) và
> **thống kê Course** (giữ 30 giây). Dữ liệu đổi thì xóa cache ngay, nên không hiển thị số cũ.
> Response có header `X-Cache: HIT` hoặc `MISS` để quan sát. **Redis chết thì hệ thống vẫn chạy**, chỉ đọc thẳng
> database — có test cho trường hợp này.

**Làm**: Swagger gọi `GET /api/courses/{id}/stats` hai lần, chỉ header `X-Cache` đổi từ `MISS` sang `HIT`.

---

## 6. Background job (1 phút) — tiêu chí 10%

**Nói**:

> Có hai tác vụ nền:
>
> 1. `CourseCloseJob` trong Team Service là `BackgroundService` chạy **mỗi 60 giây**: Course nào quá hạn ghép nhóm
>    thì tự chuyển sang **Đã đóng**, xóa cache thống kê và phát sự kiện `CourseClosed` để báo email cho cả lớp.
> 2. Consumer Kafka trong Noti Service cũng là một `BackgroundService` chạy liên tục.

**Làm**: đăng nhập `hod@exe.local`, sửa hạn Course `FA26-EXE201` về quá khứ; khoảng 1 phút sau tải lại, trạng
thái thành "Đã đóng" và Mailpit có email đóng Course.

---

## 7. Frontend (1 phút)

**Slide**: 11 — UI/UX.

**Nói**:

> Web viết bằng **React 18, TypeScript, Vite, Ant Design 5**, giao diện theo phong cách F-Spark / F-Caps. Menu thay
> đổi theo 4 vai trò. Bản build được **Nginx** phục vụ; Nginx chuyển mọi đường dẫn `/api` sang Gateway, nên trình
> duyệt chỉ cần một địa chỉ, không vướng CORS. Code được định dạng thống nhất bằng Prettier, CI kiểm tra lại.

---

## 8. Triển khai — Docker Compose (1,5 phút) — tiêu chí 10%

**Slide**: 09 — System Architecture (dải DEPLOYMENT).

**Nói**:

> Mỗi service có **Dockerfile multi-stage**: stage SDK build, stage runtime chỉ chứa bản publish và chạy bằng user
> không phải root. **Một lệnh `docker compose up -d` dựng toàn bộ 13 container**:
>
> - 5 service .NET và web;
> - hạ tầng: SQL Server, Redis, Kafka, Mailpit;
> - giám sát: Prometheus, Grafana, blackbox exporter.
>
> Bí mật như mật khẩu SQL, khóa JWT nằm trong file `.env` không đưa lên Git; repo chỉ có `.env.example`.
> Hạ tầng có **healthcheck**, service .NET chỉ khởi động khi SQL Server, Kafka, Redis đã sẵn sàng.
>
> Để người ngoài truy cập, nhóm em mở link công khai bằng **Cloudflare Tunnel** từ máy chạy Docker, không cần mở cổng
> mạng.

**Làm**: `docker compose ps` cho thấy 13 container `Up`.

---

## 9. CI/CD — GitHub Actions và GHCR (1,5 phút) — làm thêm

**Slide**: 23 — CI/CD.

**Nói**:

> Mỗi lần push code, **GitHub Actions** tự chạy pipeline `ci-cd.yml` trên máy Ubuntu của GitHub:
>
> 1. **Backend**: build solution ở chế độ Release và chạy toàn bộ **93 unit test**.
> 2. **Frontend**: kiểm tra định dạng Prettier và build bản production.
> 3. **Image**: khi hai bước trên đạt, build song song **6 image Docker**.
> 4. **CD**: nếu là nhánh `main`, đẩy 6 image lên **GitHub Container Registry**, gắn tag `latest` và tag theo commit
>    `sha-xxxxxxx`.
>
> Nhờ vậy ai đẩy code làm hỏng build hay test thì cả nhóm biết ngay, và một máy mới chỉ cần `docker compose pull`
> là chạy được bản `main` mới nhất, không phải build. Muốn quay về bản cũ thì đặt `IMAGE_TAG=sha-...`.

**Làm**: mở tab **Actions** trên GitHub, chỉ lần chạy gần nhất đều xanh, khoảng 3 phút.

---

## 10. Giám sát — Prometheus, Grafana, cảnh báo (2 phút) — làm thêm

**Slide**: 24 — Monitoring.

**Nói**:

> Để biết hệ thống đang chạy thế nào và **container nào down là biết liền**, nhóm em thêm bộ giám sát:
>
> - Mỗi service .NET dùng **OpenTelemetry** xuất số liệu ở `/metrics`: số request, độ trễ, lỗi theo service, và số
>   liệu nghiệp vụ — số phòng tạo, lượt vào phòng, đơn, nhóm thành lập, sự kiện Kafka gửi và đọc, cache HIT/MISS,
>   email, và **mã lỗi nghiệp vụ** nào chặn người dùng nhiều nhất.
> - Những container không có `/metrics` như SQL Server, Redis, Kafka thì **blackbox exporter** kiểm tra kết nối.
> - **Prometheus** thu số liệu 5 giây một lần; **Grafana** vẽ dashboard dựng sẵn khi khởi động.
> - **Cảnh báo**: container nào không phản hồi quá 30 giây, Grafana tự **gửi email**; hồi phục thì gửi email báo đã
>   ổn.

**Làm** (đây là phần ấn tượng nhất, nên làm thật):

1. Mở Grafana `:3001`, chỉ hàng **Container** 13 ô xanh và các số nghiệp vụ khớp với demo vừa làm.
2. Chạy `docker compose stop redis` → ô `redis` chuyển **DOWN** đỏ sau vài giây.
3. Nói tiếp phần khác trong lúc chờ; khoảng 40 giây sau mở Mailpit chỉ email
   `[FIRING:1] Container không phản hồi redis`.
4. `docker compose start redis` → ô xanh lại, sau đó có email `[RESOLVED]`.

**Nếu bị hỏi** "Grafana chết thì ai báo?":
> Đúng là khi đó không còn ai gửi cảnh báo — trong thực tế sẽ đặt Grafana và Prometheus ở máy khác với hệ thống cần
> giám sát. Trong phạm vi đồ án, nhóm em chạy chung một Compose.

---

## 11. Kiểm thử (1 phút)

**Slide**: 22 — Testing.

**Nói**:

> - **93 unit test** bằng xUnit, Moq, SQLite in-memory: Team 61, Noti 19, Matching 8, Auth 5. Test viết theo quy tắc
>   nghiệp vụ: mỗi BR có test đúng và test vi phạm; thêm test cho Kafka thử lại và thư chết, cache khi Redis lỗi,
>   job đóng Course, và số liệu metric.
> - **Kiểm thử end-to-end** `tests/e2e/e2e_smoke.py` chạy **29 bước** trên hệ thống thật qua Gateway: đăng nhập,
>   phân quyền, QT01–QT06, các lỗi BR05, BR09, BR16, BR18, gọi gRPC và kiểm tra email trong Mailpit.
> - Unit test chạy tự động trên CI ở mỗi lần push.

---

## 12. Chốt phần công nghệ (30 giây)

**Slide**: 25 — Achievements.

**Nói**:

> Tóm lại, hệ thống đáp ứng đủ 7 tiêu chí của đề: kiến trúc microservice, REST API có JWT, background job, Kafka,
> gRPC, Docker Compose và tài liệu. Phần làm thêm gồm web React cho 4 vai trò, cache Redis, kiểm thử end-to-end,
> **CI/CD tự động lên GitHub Container Registry**, và **giám sát bằng Grafana có cảnh báo khi container down**.

---

## Câu hỏi khác hay gặp

| Câu hỏi | Ý trả lời |
|---|---|
| Vì sao chọn Kafka mà không phải Redis Streams? | Kafka giữ thứ tự theo key (phòng), đọc lại được từ offset khi consumer chạy lại, có consumer group và DLQ rõ ràng; Redis đã dùng cho cache |
| Hai người cùng vào chỗ cuối thì sao? | Concurrency token trên bảng Phòng + unique index: một người thành công, người kia nhận lỗi và thử lại |
| Database-per-service thì lấy tên sinh viên ở Auth thế nào? | Team giữ bản sao Email, FullName khi nạp sinh viên; hai bên tham chiếu qua `UserId`, không join chéo database |
| Log và xử lý lỗi? | `ILogger` ở mọi service; `AppExceptionHandler` dùng chung đổi exception thành ProblemDetails, lỗi 5xx ghi log đầy đủ, client không thấy chi tiết nội bộ |
| Cấu hình quản lý thế nào? | `appsettings.json` cho giá trị mặc định, biến môi trường trong `docker-compose.yml` ghi đè, bí mật lấy từ `.env` |
| Swagger ở đâu? | Auth `:5101/swagger`, Team `:5102/swagger` |

---

## Thứ tự slide phần công nghệ

| Mục kịch bản | Slide |
|---|---|
| 0 Kiến trúc · 8 Docker Compose | 09 |
| 1 REST API | 13 (và 10) |
| 2 Dữ liệu | 14, 15 |
| 3 gRPC | 12 |
| 4 Kafka · 5 Redis | 09, phụ lục A2 |
| 7 Frontend | 11 |
| 11 Kiểm thử | 22 |
| 9 CI/CD | 23 |
| 10 Giám sát | 24 |
| 12 Chốt | 25 |
