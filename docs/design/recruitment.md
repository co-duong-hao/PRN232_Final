# Bổ sung v0.4 — Hồ sơ sinh viên, form tạo nhóm, tìm nhóm theo GPA và vai trò

Tài liệu này **bổ sung** cho `api-contract.md` và `data-model.md`. Phần nào không nhắc tới ở đây thì giữ nguyên.

## Yêu cầu

1. Tạo phòng bằng một form: chọn kỳ, Course, và nhập thông tin tuyển thành viên (GPA yêu cầu, vai trò cần tuyển,
   tên nhóm, tên dự án, ý tưởng, điểm mục tiêu). Hồ sơ sinh viên có thêm GPA và vai trò mong muốn.
2. Một sinh viên được ở hai nhóm của hai Course khác nhau trong cùng kỳ (ví dụ FA26-EXE101 và FA26-EXE201).
   BR05 vốn chỉ chặn **trong cùng một Course**, nên không đổi quy tắc; chỉ cần dữ liệu mẫu cho EXE201.
3. Tìm phòng theo GPA và vai trò đang cần tuyển. Phòng đã hủy chỉ Admin thấy.
4. Giao diện tham khảo F-Caps / F-Spark: màu chủ đạo cam, form tạo nhóm dạng modal như ảnh mẫu.

## Quy tắc mới

| Mã | Quy tắc |
|---|---|
| BR19 | Phòng có `RequiredGpa`: sinh viên có GPA **thấp hơn** hoặc **chưa khai GPA** không được vào trực tiếp phòng đang mở (QT02) → 409 `BR19`. Sinh viên đó **vẫn được gửi đơn**; trưởng phòng thấy GPA của người xin và tự quyết định. Duyệt đơn không kiểm tra GPA. |
| BR20 | Phòng `Cancelled` chỉ Admin thấy: danh sách phòng của người khác không trả phòng đã hủy (kể cả khi lọc `status=Cancelled`); `GET /api/rooms/{id}` của phòng đã hủy trả 404 với người không phải Admin. |
| BR21 | Sinh viên tự khai hồ sơ: GPA từ 0.00 đến 4.00 (tối đa 2 chữ số thập phân, có thể để trống) và 1–3 vai trò mong muốn. |
| BR22 | Thông tin tuyển của phòng: `RequiredGpa` 0.00–4.00 hoặc trống; `TargetGrade` 0.0–10.0 hoặc trống; tối đa 5 vai trò cần tuyển; chỉ trưởng phòng sửa được, và chỉ khi phòng `Open` hoặc `Locked`. |

Người tạo phòng không bị kiểm tra BR19 (họ tự đặt yêu cầu).

## Dữ liệu (TeamDb)

| Bảng | Thay đổi |
|---|---|
| `TeamRoles` (mới) | `Id`, `Code` (20, unique), `Name` (100). Danh sách cố định, Admin sửa qua API dữ liệu nền. |
| `Students` | thêm `Gpa` decimal(3,2) null |
| `StudentTeamRoles` (mới) | PK (`StudentId`, `TeamRoleId`) — vai trò mong muốn của sinh viên |
| `Rooms` | thêm `Name` (100, null), `ProjectName` (200, null), `IdeaDescription` (1000, null), `RequiredGpa` decimal(3,2) null, `TargetGrade` decimal(4,2) null |
| `RoomNeededRoles` (mới) | PK (`RoomId`, `TeamRoleId`) — vai trò phòng đang cần tuyển |

Thêm bằng **một migration mới** tên `Recruitment` (không sửa migration `Initial`). Khi QT06 tạo `Group`, `Group.Name`
lấy `Room.Name` nếu có, ngược lại vẫn là mã nhóm.

### Dữ liệu mẫu bổ sung

- `TeamRoles`: `FE` Frontend, `BE` Backend, `MOBILE` Mobile, `UIUX` UI/UX Design, `BA` Business Analyst,
  `MKT` Marketing, `BIZ` Business/Finance.
- Course `FA26-EXE201`: `Id` = `30000000-0000-0000-0000-000000000002`, **`Forming`**, cùng hạn và loại nhóm như
  EXE101, ghi danh **cả 12 sinh viên** (để demo yêu cầu 2).
- GPA và vai trò của sinh viên mẫu:

| SV | GPA | Vai trò | | SV | GPA | Vai trò |
|---|---|---|---|---|---|---|
| 01 | 3.40 | BE, FE | | 07 | 2.60 | BE |
| 02 | 3.10 | FE | | 08 | 3.00 | UIUX |
| 03 | 2.80 | BE, MOBILE | | 09 | 2.40 | UIUX, FE |
| 04 | 3.60 | BA | | 10 | 3.20 | UIUX |
| 05 | 2.20 | MOBILE | | 11 | 2.90 | MKT, BIZ |
| 06 | 3.50 | BE | | 12 | 3.30 | MKT |

Seed chỉ chạy khi database trống. Seed mới phải chạy được cả khi database đã có dữ liệu cũ của bản trước
(thêm phần còn thiếu, không nhân đôi), hoặc ghi rõ trong README là cần `docker compose down -v`.

## API thay đổi

Mọi đường dẫn đi qua Gateway như cũ. Quyền: **S** Student, **A** Admin, **\*** mọi người đã đăng nhập.

### Vai trò

| Method | Path | Quyền | Mô tả |
|---|---|---|---|
| GET | `/api/team-roles` | \* | Danh sách vai trò (cùng dạng `Lookup` như `/api/majors`, phân trang) |
| POST/PUT/DELETE | `/api/team-roles[/{id}]` | A | Như các dữ liệu nền khác; xóa vai trò đang dùng → 409 `IN_USE` |

`team-roles` dùng chung controller dữ liệu nền (`api/{kind}` với `semesters|subjects|majors|team-roles`).

### Hồ sơ sinh viên

`GET /api/me/student` (S) — `StudentDto` thêm:

```json
{ "gpa": 3.4, "roles": [{ "id": "…", "code": "BE", "name": "Backend" }] }
```

`PUT /api/me/student/profile` (S) — sinh viên tự sửa hồ sơ (BR21):

```json
{ "gpa": 3.4, "roleIds": ["…", "…"] }
```

→ 200 `StudentDto`. `gpa` null là xóa GPA. `roleIds` 1–3 phần tử, không trùng, phải tồn tại. Sai → 400.

`StudentDto` ở mọi nơi khác (`/api/students`) cũng có `gpa` và `roles`.

### Tạo phòng

`POST /api/courses/{courseId}/rooms` (S) — **body tùy chọn** (không gửi body vẫn chạy như cũ):

```json
{
  "name": "F-Spark Team",
  "projectName": "Ứng dụng ghép nhóm",
  "ideaDescription": "Mô tả ngắn ý tưởng",
  "requiredGpa": 2.5,
  "targetGrade": 8.0,
  "neededRoleIds": ["…"]
}
```

Kiểm tra BR22 (400 nếu sai). Các quy tắc QT01 cũ giữ nguyên.

`PUT /api/rooms/{id}/profile` (S, trưởng phòng) — cùng các trường trên, thay toàn bộ thông tin tuyển. Không phải
trưởng phòng → 403 `NOT_ROOM_LEADER`; phòng không `Open`/`Locked` → 409 `ROOM_NOT_ACTIVE`.

### Phòng: dữ liệu trả về

`RoomSummary` (và vì vậy `Room`) thêm:

```json
{
  "name": "F-Spark Team", "projectName": "…", "ideaDescription": "…",
  "requiredGpa": 2.5, "targetGrade": 8.0,
  "neededRoles": [{ "id": "…", "code": "UIUX", "name": "UI/UX Design" }]
}
```

`RoomMember` thêm `gpa` và `roles` (cùng dạng như trên). `RoomApply` thêm `gpa` và `roles` của người xin.

### Tìm phòng

`GET /api/courses/{courseId}/rooms` thêm tham số:

| Tham số | Ý nghĩa |
|---|---|
| `gpa` | Chỉ trả phòng **vào được với GPA này**: `RequiredGpa` trống hoặc ≤ `gpa` |
| `roleIds` | Lặp lại nhiều lần (`?roleIds=a&roleIds=b`): phòng cần **ít nhất một** vai trò trong danh sách |
| `q` | Tìm trong mã phòng, **tên nhóm, tên dự án** |
| `sortBy` | thêm `requiredGpa`, `targetGrade` |

Áp dụng BR20 cho mọi người không phải Admin.

### Mã lỗi mới

| Mã | HTTP | Nghĩa |
|---|---|---|
| `BR19` | 409 | GPA thấp hơn yêu cầu của phòng (hoặc chưa khai GPA); hãy gửi đơn |

## Giao diện

- Màu chủ đạo cam (`#EA580C`), góc bo 8px; Manager đổi theme chung trong `main.tsx`.
- **Hồ sơ của tôi** (`/student/profile`): GPA (0–4, bước 0.01) và 1–3 vai trò.
- **Tạo nhóm**: modal theo ảnh mẫu — Kỳ*, Course*, Tên nhóm, Tên dự án, GPA yêu cầu (tối đa 4), Điểm mục tiêu
  (tối đa 10), Vai trò cần tuyển, Mô tả ý tưởng; nút **Lưu nhóm**. Mở từ "Course của tôi" (chọn kỳ và Course trong
  modal) và từ trang phòng của một Course (Course đã chọn sẵn).
- **Tìm nhóm**: trang phòng của Course có bộ lọc GPA (mặc định là GPA của tôi, có công tắc "Chỉ phòng tôi vào được"),
  vai trò cần tuyển, trạng thái, tìm theo tên; thẻ phòng hiện tên nhóm, dự án, GPA yêu cầu, điểm mục tiêu, vai trò
  cần tuyển.
- Đơn xin vào phòng hiện GPA và vai trò của người xin.
- Giảng viên/trưởng bộ môn không thấy phòng đã hủy; Admin thấy (bộ lọc "Đã hủy" chỉ hiện với Admin).
