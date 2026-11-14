# Hợp đồng REST API

Client gọi qua Gateway `http://localhost:8080`. Gateway kiểm tra JWT rồi chuyển tiếp:
`/api/auth/**`, `/api/users/**`, `/api/roles/**` → Auth Service; mọi `/api/**` còn lại → Team Service.
Quy ước về lỗi, phân trang, phân quyền: `conventions.md`. Các bảng: `data-model.md`.

Ký hiệu quyền: **A** Admin, **H** HeadOfDepartment, **L** Lecturer, **S** Student, **\*** mọi người đã
đăng nhập.

---

## Auth Service

| Method | Path | Quyền | Mô tả |
|---|---|---|---|
| POST | `/api/auth/login` | ẩn danh | Đăng nhập |
| GET | `/api/auth/me` | \* | Thông tin người gọi |
| GET | `/api/users` | A | Danh sách; lọc `q` (email, họ tên), `role`, `status`; sắp xếp `email` (mặc định), `fullName`, `createdAt` |
| GET | `/api/users/{id}` | A | |
| POST | `/api/users` | A | Tạo tài khoản |
| PUT | `/api/users/{id}` | A | Sửa `fullName`, `status`, `roles` |
| POST | `/api/users/{id}/reset-password` | A | Đặt mật khẩu mới |
| DELETE | `/api/users/{id}` | A | Xóa mềm: `status` = `Inactive` |
| GET | `/api/roles` | A | Danh sách role |

`POST /api/auth/login`

```json
// request
{ "email": "student01@exe.local", "password": "..." }
// 200
{
  "accessToken": "eyJ...", "tokenType": "Bearer", "expiresAt": "2026-11-15T04:00:00Z",
  "user": { "id": "1000...01", "email": "student01@exe.local", "fullName": "Sinh viên 01", "roles": ["Student"] }
}
```

- Sai email, sai mật khẩu hoặc tài khoản `Inactive`: 401 `INVALID_CREDENTIALS`, cùng một thông báo.
- Token ký HS256 bằng `Jwt:Key`, có `iss`, `aud`, `exp` và các claim `sub` (User.Id), `email`, `name`,
  mỗi role một claim `role`.

`POST /api/users`: `{ "email", "fullName", "password", "roles": ["Student"] }` → 201.
Email trùng: 409 `EMAIL_EXISTS`. Mật khẩu dưới 8 ký tự hoặc role không tồn tại: 400.
Admin không tự hạ quyền hoặc tự vô hiệu hóa chính mình: 409 `CANNOT_MODIFY_SELF`.

Response người dùng: `{ id, email, fullName, status, roles, createdAt }`. Không bao giờ trả `passwordHash`.

---

## Team Service

Người gọi có role Student được ánh xạ sang `Student` qua `Student.UserId == ICurrentUser.UserId`.
Không tìm thấy: 403 `NOT_A_STUDENT`.

### Dữ liệu nền

Bốn tài nguyên có cùng bộ endpoint `GET` danh sách, `GET /{id}`, `POST`, `PUT /{id}`, `DELETE /{id}`:

| Path | Đọc | Ghi | Trường | Lọc, sắp xếp |
|---|---|---|---|---|
| `/api/semesters` | \* | A | `code`, `name`, `startDate`, `endDate` | `q`; `code`, `startDate` |
| `/api/subjects` | \* | A | `code`, `name` | `q`; `code`, `name` |
| `/api/majors` | \* | A | `code`, `name` | `q`; `code`, `name` |
| `/api/students` | A H L | A | `userId`, `studentCode`, `fullName`, `email`, `majorId` | `q` (mã, họ tên, email), `majorId`; `studentCode`, `fullName` |

- Mã trùng: 409 `CODE_EXISTS`. Xóa bản ghi đang được tham chiếu: 409 `IN_USE`.
- Response sinh viên có thêm `majorCode`.

`/api/group-types` (đọc \*, ghi A H):

```json
{
  "name": "Nhóm EXE chuẩn", "minMemberCount": 4, "maxMemberCount": 6, "minMajorCount": 3,
  "majors": [{ "majorId": "...", "minQuantity": 2, "maxQuantity": 3 }]
}
```

Kiểm tra (400 nếu sai): `1 ≤ minMemberCount ≤ maxMemberCount`; `minMajorCount ≥ 1`;
mỗi ngành `0 ≤ minQuantity ≤ maxQuantity ≤ maxMemberCount`; tổng `minQuantity` ≤ `maxMemberCount`;
không lặp `majorId`. `PUT` thay toàn bộ danh sách `majors`. Không sửa, xóa GroupType đang được một
Course `Forming` hoặc `Closed` dùng: 409 `IN_USE`.

### Course

| Method | Path | Quyền | Mô tả |
|---|---|---|---|
| GET | `/api/courses` | \* | Lọc `semesterId`, `subjectId`, `status`, `q`; sắp xếp `code` (mặc định), `deadline` |
| GET | `/api/courses/{id}` | \* | Kèm GroupType và số sinh viên |
| POST | `/api/courses` | A | `{ semesterId, subjectId, groupTypeId, startTime, deadline }` |
| PUT | `/api/courses/{id}` | A H | `{ groupTypeId, startTime, deadline }` |
| DELETE | `/api/courses/{id}` | A | Chỉ khi `Planned` và chưa có phòng |
| POST | `/api/courses/{id}/open` | A H | `Planned` → `Forming` |
| POST | `/api/courses/{id}/close` | A H | `Forming` → `Closed`, phát `CourseClosed` |
| GET | `/api/courses/{id}/students` | A H L | Lọc `q`, `majorId`, `hasRoom` (`true` \| `false`); sắp xếp `studentCode`, `fullName` |
| POST | `/api/courses/{id}/students` | A | `{ studentIds: [] }` → `{ added, skipped }` |
| DELETE | `/api/courses/{id}/students/{studentId}` | A | 409 `IN_USE` nếu sinh viên đang ở phòng của Course |
| GET | `/api/courses/{id}/stats` | A H L | `{ totalStudents, studentsInRoom, studentsInGroup, roomsByStatus, groupCount }` |
| GET | `/api/me/courses` | S | Các Course của tôi, mỗi Course kèm `myRoom` và `myGroup` (có thể null) |

- `code` = `{Semester.Code}-{Subject.Code}` (BR01), sinh ở server. Đã tồn tại: 409 `COURSE_EXISTS`.
- `deadline` phải sau `startTime`: 400. Đổi `groupTypeId` chỉ khi `Planned`: 409 `COURSE_NOT_PLANNED`.
- Chuyển trạng thái sai chiều: 409 `INVALID_COURSE_STATE`.

### Phòng

Mọi thao tác ghi của sinh viên trong mục này yêu cầu `Course.Status == Forming`, nếu không:
409 `COURSE_NOT_FORMING`. Sinh viên không thuộc Course: 403 `BR02`.

| Method | Path | Quyền | Quy trình |
|---|---|---|---|
| GET | `/api/courses/{courseId}/rooms` | \* | Lọc `status`, `q` (mã phòng); sắp xếp `code` (mặc định), `createdAt`, `memberCount` |
| GET | `/api/courses/{courseId}/rooms/recommendations` | S | Gợi ý phòng (gRPC `RecommendRooms`), tham số `limit` |
| POST | `/api/courses/{courseId}/rooms` | S | QT01 |
| GET | `/api/rooms/{id}` | \* | Chi tiết |
| POST | `/api/rooms/{id}/join` | S | QT02 |
| POST | `/api/rooms/{id}/leave` | S | QT04 |
| PUT | `/api/rooms/{id}/leader` | S (trưởng phòng) | QT05, `{ studentId }` |
| GET | `/api/rooms/{id}/composition` | \* | Kiểm tra cơ cấu (gRPC `AnalyzeComposition`) |
| POST | `/api/rooms/{id}/complete` | S (trưởng phòng) | QT06 |

Sinh viên chỉ xem được phòng của Course mình thuộc về (403 `BR02`); A H L xem được tất cả.

```json
// RoomSummary (danh sách)
{ "id": "...", "code": "FA26-EXE101-R001", "status": "Locked", "memberCount": 3,
  "leaderName": "Sinh viên 01", "majors": [{ "majorCode": "SE", "count": 2 }, { "majorCode": "GD", "count": 1 }],
  "createdAt": "..." }
// RoomDetail = RoomSummary + courseId, courseCode, leaderId và
"members": [{ "studentId": "...", "studentCode": "SE180001", "fullName": "Sinh viên 01", "majorCode": "SE", "isLeader": true, "joinedAt": "..." }]
```

**QT01 — tạo phòng.** Kiểm tra BR02, rồi BR05 (đã ở một phòng của Course: 409 `BR05`).
Tăng `Course.RoomSequence`, sinh mã (BR04), tạo phòng `Open` với `LeaderId` là người tạo (BR06),
`MemberCount` 1, thêm `StudentInRoom`. Hủy mọi đơn `Pending` của sinh viên trong Course (BR12).
Phát `RoomCreated`. → 201 `RoomDetail`.

**QT02 — vào phòng đang mở.** Phòng không `Open`: 409 `ROOM_NOT_OPEN` (phòng `Locked` thì phải gửi
đơn). Kiểm tra BR02, BR05, rồi BR11:

- `MemberCount ≥ GroupType.MaxMemberCount` → 409 `BR11`;
- ngành của sinh viên có trong `GroupTypeMajors` và số sinh viên ngành đó trong phòng đã bằng
  `MaxQuantity` → 409 `BR11`.

Thêm thành viên, tăng `MemberCount` và `Version`. `MemberCount ≥ Room:LockThreshold` → `Locked` (BR08).
Hủy các đơn `Pending` khác của sinh viên trong Course (BR12). Phát `RoomMemberJoined`, và `RoomLocked`
nếu vừa khóa. → 200 `RoomDetail`.

**QT04 — rời phòng.** Không phải thành viên: 409 `NOT_A_MEMBER`. Phòng `Completed`: 409 `BR18`.
Là trưởng phòng và phòng còn người khác: 409 `BR13`. Xóa `StudentInRoom`, giảm `MemberCount`, tăng
`Version`. Còn 0 người → `Cancelled` và hủy mọi đơn `Pending` của phòng. Đang `Locked` mà
`MemberCount < LockThreshold` → `Open`. → 204.

**QT05 — đổi trưởng phòng.** Người gọi không phải trưởng phòng: 403 `NOT_ROOM_LEADER`. `studentId`
không phải thành viên khác trong phòng: 409 `NOT_A_MEMBER`. Phòng phải `Open` hoặc `Locked`
(409 `ROOM_NOT_ACTIVE`). Cập nhật `LeaderId`, tăng `Version`. Phát `RoomLeaderChanged`. → 200 `RoomDetail`.

**Kiểm tra cơ cấu.** Dựng `GroupTypeRule` từ GroupType của Course và danh sách mã ngành của thành viên,
gọi `IMatchingClient.AnalyzeCompositionAsync`, trả nguyên `CompositionAnalysis`.

**QT06 — hoàn tất phòng.** Không phải trưởng phòng: 403 `NOT_ROOM_LEADER`. Phòng không `Open`/`Locked`:
409 `ROOM_NOT_ACTIVE`. Gọi `AnalyzeCompositionAsync`; `Satisfied == false` → 409 `BR16`, `title` là
`"Phòng chưa thỏa cơ cấu nhóm: " + string.Join(" ", violations)`. Đạt thì trong một `SaveChanges`:

- tạo `Group` (`Code` = mã phòng thay `-R` bằng `-G`, `Name` = `Code`, `GroupTypeId` của Course, `RoomId`);
- tạo `StudentInGroup` cho từng thành viên, `IsLeader` cho trưởng phòng;
- phòng → `Completed`, tăng `Version`; hủy các đơn `Pending` của phòng.

Phát `RoomCompleted`. → 201 `GroupDetail`. Nếu có người vào hoặc rời phòng giữa lúc kiểm tra và lúc ghi,
`Version` lệch và yêu cầu nhận 409 `CONCURRENCY_CONFLICT`.

**Gợi ý phòng.** Lấy các phòng `Open`/`Locked` của Course, dựng `RoomSnapshot`, gọi
`RecommendRoomsAsync` với ngành của người gọi. Trả danh sách `{ roomId, roomCode, score, canJoin, reasons }`.
Sinh viên đã ở trong một phòng của Course: trả danh sách rỗng.

### Đơn xin vào phòng

| Method | Path | Quyền | Mô tả |
|---|---|---|---|
| POST | `/api/rooms/{id}/applies` | S | QT03 bước 1, `{ message }` |
| GET | `/api/rooms/{id}/applies` | trưởng phòng, A H L | Lọc `status`; sắp xếp `createdAt` (mặc định, mới nhất trước) |
| GET | `/api/me/applies` | S | Đơn của tôi; lọc `status`, `courseId` |
| POST | `/api/room-applies/{id}/approve` | trưởng phòng | |
| POST | `/api/room-applies/{id}/reject` | trưởng phòng | |
| POST | `/api/room-applies/{id}/cancel` | người gửi đơn | |

Response đơn: `{ id, roomId, roomCode, studentId, studentCode, fullName, majorCode, message, status,
decidedAt, createdAt }` (có `majorCode` để trưởng phòng xét cơ cấu).

**Gửi đơn.** Phòng không `Locked`: 409 `ROOM_NOT_LOCKED` (phòng `Open` thì vào trực tiếp). Kiểm tra BR02,
BR05. Đã có đơn `Pending` vào phòng này: 409 `APPLY_ALREADY_PENDING`. Tạo đơn `Pending`. Phát
`RoomApplyCreated`. → 201.

**Duyệt.** Đơn không `Pending`: 409 `APPLY_NOT_PENDING`. Người gọi không phải trưởng phòng của phòng đó:
403 `NOT_ROOM_LEADER` (BR09). Phòng phải `Open`/`Locked`. Kiểm tra lại BR05 và BR11 cho người xin như
QT02. Thêm thành viên, tăng `MemberCount` và `Version`; đơn → `Approved` với `DecidedBy`, `DecidedAt`;
hủy các đơn `Pending` khác của người xin trong Course (BR12); áp dụng BR08 nếu phòng đang `Open`.
Phát `RoomApplyDecided` (`Approved`) và `RoomMemberJoined`. → 200 đơn.

**Từ chối.** Điều kiện như duyệt. Đơn → `Rejected`. Phát `RoomApplyDecided` (`Rejected`). → 200 đơn.

**Hủy.** Chỉ người gửi (403 `FORBIDDEN`), chỉ khi `Pending`. Đơn → `Cancelled`. → 200 đơn.

### Nhóm

| Method | Path | Quyền | Mô tả |
|---|---|---|---|
| GET | `/api/courses/{courseId}/groups` | \* | Lọc `q` (mã); sắp xếp `code` (mặc định), `createdAt` |
| GET | `/api/groups/{id}` | \* | `GroupDetail` |

`GroupDetail`: `{ id, code, name, courseId, courseCode, roomId, groupTypeId, groupTypeName, createdAt,
members: [{ studentId, studentCode, fullName, majorCode, isLeader }] }`.

Sau khi nhóm thành lập, không có endpoint nào cho thành viên rời hoặc đổi nhóm (BR18).

### Bảng mã lỗi nghiệp vụ

| Mã | HTTP | Nghĩa |
|---|---|---|
| `BR02` | 403 | Sinh viên không thuộc Course |
| `BR05` | 409 | Sinh viên đã ở một phòng trong Course |
| `BR11` | 409 | Phòng đủ người hoặc ngành của sinh viên đã đủ số lượng |
| `BR13` | 409 | Trưởng phòng phải chuyển quyền trước khi rời |
| `BR16` | 409 | Phòng chưa thỏa cơ cấu GroupType |
| `BR18` | 409 | Phòng đã hoàn tất, không thay đổi thành viên |
| `NOT_A_STUDENT` | 403 | Tài khoản không gắn với sinh viên nào |
| `NOT_ROOM_LEADER` | 403 | Chỉ trưởng phòng được thực hiện |
| `NOT_A_MEMBER` | 409 | Sinh viên không phải thành viên của phòng |
| `ROOM_NOT_OPEN`, `ROOM_NOT_LOCKED`, `ROOM_NOT_ACTIVE` | 409 | Trạng thái phòng không phù hợp |
| `APPLY_ALREADY_PENDING`, `APPLY_NOT_PENDING` | 409 | Trạng thái đơn không phù hợp |
| `COURSE_NOT_FORMING`, `COURSE_NOT_PLANNED`, `INVALID_COURSE_STATE`, `COURSE_EXISTS` | 409 | Trạng thái Course |
| `CODE_EXISTS`, `IN_USE` | 409 | Dữ liệu nền |
| `MATCHING_UNAVAILABLE` | 503 | Matching Service không phản hồi |
