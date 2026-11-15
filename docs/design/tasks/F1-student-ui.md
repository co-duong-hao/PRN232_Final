# F1 — Giao diện sinh viên

Worker 1. Không phụ thuộc F2.

## Mục tiêu

Sinh viên làm được toàn bộ quy trình ghép nhóm trên web: xem Course, tạo phòng, vào phòng, xin vào phòng,
duyệt đơn khi là trưởng phòng, kiểm tra cơ cấu, chuyển trưởng phòng, hoàn tất phòng thành nhóm.

## Đọc trước

- `docs/design/frontend.md` (bắt buộc)
- `docs/design/api-contract.md`, các mục "Phòng", "Đơn xin vào phòng", "Nhóm", "/api/me/courses"
- `frontend/src/api/index.ts`, `frontend/src/api/types.ts`, `frontend/src/components/*`

## Được sửa

- `frontend/src/pages/student/**`
- `frontend/src/features/student/**` (tạo mới nếu cần)

## Màn hình

### 1. Course của tôi — `MyCoursesPage` (`/student/courses`)

`meApi.courses()`. Mỗi Course một thẻ (`Card`) gồm: mã, `CourseStatusTag`, loại nhóm, hạn ghép nhóm, số
sinh viên, và tình trạng của tôi:

- có `myGroup`: "Đã có nhóm {code}" + nút **Xem nhóm** → `/student/groups/{id}`;
- có `myRoom`: "Đang ở phòng {code}" + `RoomStatusTag` + nút **Vào phòng của tôi** → `/student/rooms/{id}`;
- chưa có gì: "Chưa có phòng" + nút **Tìm phòng** → `/student/courses/{id}`.

Course không ở trạng thái `Forming`: hiện chú thích "Chưa mở / đã đóng ghép nhóm", vẫn cho xem.

### 2. Phòng trong Course — `CourseRoomsPage` (`/student/courses/:courseId`)

- Đầu trang: thông tin Course (`coursesApi.get`) và quy định của loại nhóm (lấy GroupType từ
  `referenceApi.groupTypes()` theo `groupTypeId`), ví dụ "4–6 thành viên · tối thiểu 3 ngành · SE: 2–3".
- Nếu tôi đã ở một phòng của Course (từ `meApi.courses()`): `Alert` kèm link sang phòng của tôi; ẩn mọi nút
  tạo/vào/xin vào phòng.
- Nút **Tạo phòng** (`coursesApi.createRoom`) → chuyển sang trang phòng vừa tạo.
- Thẻ **Gợi ý cho bạn** (`coursesApi.recommendations(courseId, 3)`): mỗi gợi ý có mã phòng, điểm, các lý do
  (`reasons`), nút vào/xin vào. Lỗi 503 `MATCHING_UNAVAILABLE` thì hiện "Dịch vụ gợi ý tạm thời không phản
  hồi" thay vì làm hỏng trang. Danh sách rỗng thì không hiện thẻ.
- Bảng phòng (`coursesApi.rooms`): mã, trạng thái, `số người / MaxMemberCount`, `MajorCounts`, trưởng phòng,
  ngày tạo. Lọc theo trạng thái, tìm theo mã, sắp xếp theo mã / ngày tạo / số người, phân trang server.
- Cột thao tác: phòng `Open` → **Vào phòng** (`roomsApi.join`, xong chuyển sang trang phòng); phòng `Locked`
  → **Gửi đơn** (modal nhập lời nhắn tối đa 500 ký tự, `roomsApi.apply`); mọi phòng → **Xem**. Ẩn nút vào và
  gửi đơn khi Course không `Forming` hoặc tôi đã có phòng.

### 3. Chi tiết phòng — `RoomDetailPage` (`/student/rooms/:roomId`)

`roomsApi.get`. Xác định `isMember` (studentId của tôi có trong `members`) và `isLeader`
(`room.leaderId === student.id`).

- Thông tin phòng: mã, Course, `RoomStatusTag`, số người, trưởng phòng.
- Bảng thành viên: mã SV, họ tên, ngành, ngày vào, biểu tượng trưởng phòng.
- Thẻ **Cơ cấu nhóm** (`roomsApi.composition`): đạt / chưa đạt, danh sách `violations`, ngành còn thiếu và
  ngành vượt (dạng `Tag`), nút làm mới. Xử lý 503 như trang trước.
- Thao tác (chỉ khi phòng `Open` hoặc `Locked`):
  - không phải thành viên: **Vào phòng** nếu `Open`, **Gửi đơn** nếu `Locked`;
  - thành viên: **Rời phòng** (xác nhận; xong về `/student/courses`). Trưởng phòng còn người khác trong phòng
    thì vô hiệu hóa nút và ghi chú "Chuyển quyền trưởng phòng trước khi rời";
  - trưởng phòng: **Chuyển trưởng phòng** (modal chọn thành viên khác, `roomsApi.changeLeader`) và
    **Hoàn tất thành nhóm** (xác nhận, `roomsApi.complete`, xong chuyển sang `/student/groups/{id}`).
    Nút hoàn tất chỉ bật khi thẻ cơ cấu báo đạt.
- Trưởng phòng thấy thêm bảng **Đơn xin vào phòng** (`roomsApi.applies`, mặc định lọc `Pending`, có bộ lọc
  trạng thái): người xin, mã SV, **ngành**, lời nhắn, ngày gửi, nút **Chấp nhận** / **Từ chối**
  (`appliesApi.approve` / `reject`). Sau khi duyệt, tải lại cả phòng, cơ cấu và danh sách đơn.
- Phòng `Completed`: `Alert` "Phòng đã thành nhóm" và link sang nhóm (tìm `myGroup` có `roomId` trùng trong
  `meApi.courses()`).

### 4. Đơn của tôi — `MyAppliesPage` (`/student/applies`)

`meApi.applies`: phòng (link sang trang phòng), `ApplyStatusTag`, lời nhắn, ngày gửi, ngày xử lý. Lọc theo
trạng thái, phân trang server. Đơn `Pending` có nút **Hủy đơn** (xác nhận, `appliesApi.cancel`).

### 5. Nhóm — `GroupDetailPage` (`/student/groups/:groupId`)

`groupsApi.get`: mã nhóm, Course, loại nhóm, ngày thành lập, bảng thành viên (trưởng nhóm có biểu tượng),
dòng thống kê số thành viên theo ngành.

## Xong khi

- `npm run build` không lỗi.
- Các luồng sau chạy được trên trình duyệt với dữ liệu mẫu mới (`docker compose down -v; docker compose up -d`):
  1. `student01` tạo phòng; `student02`, `student06` vào phòng → phòng hiện "Đã khóa".
  2. `student08` xem gợi ý, gửi đơn vào phòng; `student01` thấy đơn kèm ngành GD và chấp nhận.
  3. `student01` thấy cơ cấu "đạt", chuyển trưởng phòng cho `student02`; `student02` hoàn tất → trang nhóm.
  4. `student03` thử vào một phòng khác sau khi đã có phòng → thấy thông báo lỗi `[BR05]`.
  5. `student09` gửi đơn rồi hủy ở trang "Đơn của tôi".
- Không chạy được backend thì ghi rõ trong báo cáo; Manager sẽ thử.

## Ngoài phạm vi

Trang giảng viên/admin (F2), sửa `api/`, `auth/`, `components/`, `App.tsx`.
