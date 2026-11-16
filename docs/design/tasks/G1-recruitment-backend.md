# G1 — Backend: hồ sơ sinh viên, thông tin tuyển của phòng, tìm phòng theo GPA và vai trò

Worker 2. Chạy song song với G2 (frontend); hợp đồng API đã chốt trong `docs/design/recruitment.md`.

## Đọc trước

- `docs/design/recruitment.md` (bắt buộc — toàn bộ yêu cầu, quy tắc BR19–BR22, dữ liệu, API)
- `docs/design/conventions.md` (quy ước và "Luật cho worker")
- `docs/design/api-contract.md`, `docs/design/data-model.md` (phần cũ vẫn giữ nguyên)
- Code hiện có trong `src/TeamService` (Domain, Data, Services, Controllers, Dtos) và `tests/TeamService.Tests`

## Được sửa

- `src/TeamService/**`
- `tests/TeamService.Tests/**`

Không sửa `src/Shared/**`, Auth, Gateway, Noti, Matching, frontend, `docker-compose.yml`, tài liệu thiết kế.

## Việc cần làm

1. **Dữ liệu**: entity `TeamRole`, `StudentTeamRole`, `RoomNeededRole`; các cột mới của `Student`, `Room` đúng kiểu và
   độ dài trong `recruitment.md`. Tạo **migration mới `Recruitment`** bằng `dotnet ef migrations add Recruitment`
   (không sửa migration `Initial`).
2. **Seed** (`TeamDbSeeder`): 7 vai trò; GPA và vai trò của 12 sinh viên; Course `FA26-EXE201` với Id cố định
   `30000000-0000-0000-0000-000000000002`, trạng thái `Forming`, ghi danh cả 12 sinh viên. Seed phải chạy đúng
   trên database trống; với database của bản trước thì chỉ bổ sung phần còn thiếu (không nhân đôi, không đổi
   GUID cố định đã có của EXE101).
3. **Vai trò**: thêm `team-roles` vào route dữ liệu nền (`api/{kind}`), dùng lại `ReferenceService` (danh sách
   đọc cho mọi người đã đăng nhập; tạo/sửa/xóa cho Admin; đang dùng → 409 `IN_USE`).
4. **Hồ sơ sinh viên**: `StudentDto` thêm `gpa`, `roles`; `PUT /api/me/student/profile` theo BR21.
5. **Thông tin tuyển của phòng**: body tùy chọn cho `POST /api/courses/{courseId}/rooms` (không có body vẫn chạy —
   dùng `[FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)]`); `PUT /api/rooms/{id}/profile` cho trưởng phòng;
   kiểm tra BR22. QT06: `Group.Name` lấy `Room.Name` nếu có.
6. **BR19** trong QT02 (vào phòng): kiểm tra **sau** BR02, BR05 và **trước** BR11. Gửi đơn và duyệt đơn không kiểm
   tra GPA.
7. **BR20**: danh sách phòng và `GET /api/rooms/{id}` ẩn phòng `Cancelled` với người không có role Admin.
8. **DTO**: `RoomSummary`/`Room` thêm các trường tuyển và `neededRoles`; `RoomMember` và `RoomApply` thêm `gpa`, `roles`.
9. **Tìm phòng**: tham số `gpa`, `roleIds` (nhiều giá trị), `q` tìm cả tên nhóm và tên dự án, `sortBy`
   `requiredGpa` / `targetGrade`.

### Test (`tests/TeamService.Tests`)

Giữ toàn bộ test cũ xanh. Thêm ít nhất:

- BR19: GPA thấp hơn → `BR19`; GPA bằng yêu cầu → vào được; chưa khai GPA → `BR19`; GPA thấp vẫn gửi đơn được
  và trưởng phòng duyệt được.
- BR20: sinh viên và giảng viên không thấy phòng đã hủy (cả khi lọc `status=Cancelled`), Admin thấy; `GET` phòng đã
  hủy → 404 với sinh viên.
- BR21: GPA ngoài 0–4, quá 3 vai trò, vai trò không tồn tại → 400; sửa thành công trả hồ sơ mới.
- BR22: tạo phòng có thông tin tuyển; `requiredGpa` 4.5 hoặc `targetGrade` 11 → 400; người không phải trưởng phòng
  sửa → `NOT_ROOM_LEADER`.
- Tìm phòng: lọc `gpa`, lọc nhiều `roleIds`, `q` theo tên nhóm.
- Yêu cầu 2: một sinh viên tạo/vào phòng ở EXE101 **và** EXE201 cùng lúc đều thành công; vẫn bị BR05 khi vào phòng
  thứ hai **cùng** Course.

## Xong khi

- `dotnet build ExeTeamMatching.sln` không lỗi; `dotnet test tests/TeamService.Tests` xanh.
- `src/TeamService/Data/Migrations` có migration `Recruitment`.
- Nếu máy có Docker: `docker compose down -v`, `docker compose build team-service`, `docker compose up -d`, chờ đủ lâu;
  `python tests/e2e/e2e_smoke.py .env` vẫn `29/29` (body tạo phòng là tùy chọn nên script cũ phải chạy được).
  Không chạy được thì ghi rõ trong báo cáo.
