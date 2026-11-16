# Hướng dẫn chạy dự án EXE Team Matching

Hướng dẫn từng bước cho máy Windows, dùng cho cả nhóm. Mọi lệnh chạy trong **PowerShell** (hoặc Terminal của
VS Code), tại thư mục gốc dự án — nơi có file `docker-compose.yml`.

Nếu chỉ cần nhớ nhanh: [phần 9 — Chạy nhanh trước buổi demo](#9-chạy-nhanh-trước-buổi-demo).

---

## 1. Cần cài gì

| Phần mềm | Dùng để | Bắt buộc? |
|---|---|---|
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | Chạy toàn bộ hệ thống | **Có** |
| [Git](https://git-scm.com/download/win) | Lấy mã nguồn | **Có** |
| [Python 3](https://www.python.org/downloads/) | Chạy kịch bản demo và kiểm thử end-to-end | Khi demo / test |
| [.NET SDK 8](https://dotnet.microsoft.com/download/dotnet/8.0) | Chạy unit test, chạy service ngoài Docker | Khi phát triển |
| [Node.js 20+](https://nodejs.org/) | Chạy frontend ở chế độ phát triển | Khi phát triển |

**Cấu hình Docker Desktop**: vào *Settings → Resources*, cho Docker ít nhất **6–8 GB RAM**. Hệ thống có 13 container
(SQL Server và Kafka khá nặng).

---

## 2. Lấy mã nguồn (lần đầu)

Repo là private: chấp nhận lời mời vào `co-duong-hao/PRN232_Final` trên GitHub trước.

```powershell
git clone https://github.com/co-duong-hao/PRN232_Final.git
cd PRN232_Final
```

Lần sau, cập nhật mã mới nhất:

```powershell
git pull
```

---

## 3. Tạo file cấu hình `.env` (lần đầu)

```powershell
Copy-Item .env.example .env
notepad .env
```

Trong Notepad, sửa đúng một dòng rồi lưu (Ctrl + S):

```text
MSSQL_ACCEPT_EULA=Y
```

Điền `Y` nghĩa là bạn đồng ý [điều khoản của SQL Server](https://go.microsoft.com/fwlink/?linkid=857698)
(bản Developer, miễn phí cho học tập). Các dòng khác để nguyên — đó là giá trị cho máy cá nhân.
File `.env` không được đưa lên Git.

| Biến | Ý nghĩa |
|---|---|
| `MSSQL_ACCEPT_EULA` | Đồng ý điều khoản SQL Server (`Y`) |
| `MSSQL_SA_PASSWORD` | Mật khẩu SQL Server trong Docker |
| `JWT_KEY` | Khóa ký token đăng nhập (dùng chung cho Gateway, Auth, Team) |
| `SEED_DEFAULT_PASSWORD` | Mật khẩu của **mọi tài khoản mẫu** |

---

## 4. Build hệ thống (lần đầu, hoặc khi code thay đổi)

Mở Docker Desktop, chờ góc dưới bên trái hiện **Engine running**.

**Build từng image một** — build tất cả cùng lúc dễ làm Docker hết bộ nhớ và sập. Lần đầu mất khoảng 5–10 phút.

```powershell
docker compose build auth-service
docker compose build team-service
docker compose build matching-service
docker compose build noti-service
docker compose build gateway
docker compose build web
```

Sau khi `git pull`, chỉ cần build lại service có code thay đổi (ví dụ chỉ `team-service` và `web`).

### Cách khác: tải image đã build sẵn (không cần build)

Mỗi lần code được đưa lên nhánh `main`, GitHub Actions tự build và lưu image lên GitHub Container Registry (GHCR).
Máy yếu hoặc Docker hay sập khi build thì dùng cách này:

1. Tạo token trên GitHub: *Settings → Developer settings → Personal access tokens → Tokens (classic)*, chỉ tích
   quyền `read:packages`.
2. Đăng nhập (dán token khi được hỏi mật khẩu):

   ```powershell
   docker login ghcr.io -u <tên-GitHub-của-bạn>
   ```

3. Tải image rồi chạy, bỏ qua bước build:

   ```powershell
   docker compose pull
   docker compose up -d --no-build
   ```

Image trên GHCR là bản của nhánh `main`. Đang sửa code ở nhánh khác thì vẫn build trên máy như trên.

---

## 5. Khởi động

```powershell
docker compose up -d
```

Chờ **30–60 giây** (SQL Server và Kafka khởi động chậm; Auth và Team tự tạo database, chạy migration, nạp dữ liệu
mẫu). Kiểm tra:

```powershell
docker compose ps
```

Đủ **13 container** ở trạng thái `Up`; `sqlserver`, `redis`, `kafka`, `mailpit` có thêm `(healthy)`.

```powershell
curl.exe http://localhost:8080/health
```

Trả về `Healthy` là sẵn sàng.

### Các địa chỉ

| Địa chỉ | Nội dung |
|---|---|
| http://localhost:3000 | **Web app** — đăng nhập và dùng như người dùng thật |
| http://localhost:8025 | **Mailpit** — hộp thư nhận mọi email hệ thống gửi, kể cả email cảnh báo của Grafana |
| http://localhost:3001 | **Grafana** — dashboard "EXE Team Matching" (xem không cần đăng nhập; sửa: `admin` / `GRAFANA_ADMIN_PASSWORD`) |
| http://localhost:9090 | **Prometheus** — *Status → Targets* xem nguồn số liệu |
| http://localhost:5102/swagger | Swagger của Team Service |
| http://localhost:5101/swagger | Swagger của Auth Service |
| http://localhost:8080 | API Gateway (mọi lời gọi API đi qua đây) |

---

## 6. Tài khoản mẫu

Mật khẩu của mọi tài khoản là giá trị `SEED_DEFAULT_PASSWORD` trong `.env`.

| Email | Vai trò |
|---|---|
| `admin@exe.local` | Admin |
| `hod@exe.local` | Trưởng bộ môn |
| `lecturer@exe.local` | Giảng viên |
| `student01@exe.local` … `student12@exe.local` | Sinh viên |

- SV 01–05 ngành SE, 06–07 AI, 08–10 GD, 11–12 MKT.
- Cả `FA26-EXE101` và `FA26-EXE201` đang mở ghép nhóm, đủ 12 sinh viên.
- GPA mẫu: SV 01 là **3.40**, SV 05 là **2.20** (dùng để thử quy tắc GPA BR19). Bảng đầy đủ trong `README.md`.

---

## 7. Chạy demo và kiểm thử

Hai kịch bản Python cần **dữ liệu mẫu ban đầu**. Nếu dữ liệu đã bị dùng, script sẽ dừng và in lệnh reset.

### Reset dữ liệu về ban đầu

```powershell
docker compose down -v
docker compose up -d
```

Chờ 30–60 giây trước khi chạy script.

### Demo có lời dẫn (14 bước, từ tạo phòng đến thành nhóm)

```powershell
python docs/demo/demo.py .env
```

Sau đó mở http://localhost:8025 để xem email.

### Kiểm thử end-to-end (29 bước)

Reset dữ liệu trước (nếu vừa chạy demo), rồi:

```powershell
python tests/e2e/e2e_smoke.py .env
```

Kết quả đúng: dòng cuối `29/29 checks passed`.

| Mã thoát | Ý nghĩa |
|---|---|
| 0 | Đạt |
| 1 | Lỗi (không kết nối được, bước nào đó sai) — đọc dòng thông báo |
| 2 | Dữ liệu đã được dùng — reset rồi chạy lại |

### Unit test (không cần Docker, cần .NET SDK 8)

```powershell
dotnet test ExeTeamMatching.sln
```

Kết quả đúng: 4 dòng `Passed!` (Auth, Matching, Noti, Team), tổng 83 test.

---

## 8. Xem các thành phần hoạt động (khi trình bày)

**Grafana** — mở http://localhost:3001 (dashboard "EXE Team Matching" là trang chủ):

- Hàng **Container**: 13 ô UP/DOWN, mỗi container một ô; bên phải là các cảnh báo đang bật.
- Các hàng dưới: request mỗi giây, độ trễ, số phòng, nhóm, sự kiện Kafka, email, cache... Chạy `demo.py` để thấy số tăng.

**Thử cảnh báo "container down"** — biết ngay khi một container hỏng:

```powershell
docker compose stop redis
```

Khoảng 5 giây sau ô `redis` chuyển **DOWN** màu đỏ; khoảng 40 giây sau Mailpit (http://localhost:8025) nhận email
`[FIRING:1] Container không phản hồi redis`. Bật lại:

```powershell
docker compose start redis
```

Khoảng 40 giây sau có email `[RESOLVED] ...`. Đổi người nhận cảnh báo: đặt `ALERT_EMAIL_TO=...` trong `.env`.


**Kafka** — sự kiện đã được Noti Service đọc hết (cột `LAG` bằng 0):

```powershell
docker compose exec -T kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group noti-service
```

**Redis cache** — các khóa cache đang có:

```powershell
docker compose exec -T redis redis-cli --scan --pattern "exe-team:*"
```

Trên Swagger của Team Service, gọi `GET /api/courses/{id}/stats` hai lần: header `X-Cache` lần đầu `MISS`, lần sau
`HIT`.

**Tác vụ nền** — đăng nhập web bằng `hod@exe.local`, mở ghép nhóm `FA26-EXE201` và sửa hạn về quá khứ: khoảng 1 phút
sau Course tự chuyển sang "Đã đóng".

**Log của một service**:

```powershell
docker compose logs -f team-service
```

(Ctrl + C để thoát.)

---

## 9. Chạy nhanh trước buổi demo

Đã build từ trước, chỉ cần:

```powershell
docker compose down -v
docker compose up -d
```

Chờ 60 giây, kiểm tra `docker compose ps` đủ 13 container `Up`, mở http://localhost:3000, http://localhost:8025 và http://localhost:3001
(hàng "Container" phải xanh hết).
Không chạy `demo.py` hay `e2e_smoke.py` trước giờ demo — chúng làm thay đổi dữ liệu; nếu lỡ chạy thì reset lại.

---

## 10. Dừng hệ thống

```powershell
docker compose down
```

Giữ nguyên dữ liệu. Thêm `-v` (`docker compose down -v`) để xóa luôn dữ liệu.

---

## 11. Lỗi thường gặp

| Hiện tượng | Nguyên nhân | Cách xử lý |
|---|---|---|
| Docker Desktop báo *"unable to start"*, hoặc build báo *"Bus error"* | Docker hết bộ nhớ | Thoát hẳn Docker Desktop rồi mở lại; tăng RAM cho Docker (phần 1); build từng image (phần 4) |
| Một container cứ khởi động lại; log có *"runtimeconfig.json … The document is empty"* | Image hỏng do Docker sập giữa lúc build | `docker compose build --no-cache <tên-service>` rồi `docker compose up -d <tên-service>` |
| Build báo *"no such host"* khi tải image | DNS của Docker chập chờn | Chờ vài giây rồi chạy lại lệnh build |
| Đăng nhập web báo lỗi 502 | Auth/Team chưa lên xong | Chờ thêm; xem `docker compose ps` và `docker compose logs auth-service` |
| `docker compose up` báo thiếu `MSSQL_ACCEPT_EULA` hoặc `JWT_KEY` | Chưa có `.env` | Làm lại phần 3 |
| Script báo *"Dữ liệu đã được dùng ở lần chạy trước"* | Chưa reset | Phần 7 — reset dữ liệu |
| Script báo *"Không kết nối được API Gateway"* | Hệ thống chưa chạy | `docker compose up -d`, chờ 60 giây |
| Web không thấy tính năng mới sau `git pull` | Image cũ | Build lại `team-service` và `web` (hoặc `docker compose pull`), rồi `docker compose up -d` |
| `docker compose pull` báo *"denied"* hoặc *"unauthorized"* | Chưa đăng nhập GHCR, hoặc token thiếu quyền `read:packages` | Làm lại bước đăng nhập ở phần 4 |
| Cổng 1433, 3000, 8080… đã bị chiếm | Phần mềm khác đang dùng cổng | Tắt phần mềm đó (ví dụ SQL Server cài sẵn trên máy) |

---

## 12. Chạy ngoài Docker (cho người phát triển)

Chỉ chạy hạ tầng bằng Docker, các service chạy bằng `dotnet run`, mỗi lệnh một cửa sổ terminal:

```powershell
docker compose up -d sqlserver redis kafka mailpit
dotnet run --project src/MatchingService
dotnet run --project src/AuthService
dotnet run --project src/TeamService
dotnet run --project src/NotiService
dotnet run --project src/Gateway
```

Frontend (tự tải lại khi sửa code, mở http://localhost:5173):

```powershell
cd frontend
npm install
npm run dev
```

Định dạng code frontend trước khi commit: `npm run format`.
