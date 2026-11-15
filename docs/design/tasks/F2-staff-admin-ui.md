# F2 — Giao diện giảng viên, trưởng bộ môn, admin

Worker 2. Không phụ thuộc F1.

## Mục tiêu

Giảng viên và trưởng bộ môn theo dõi được tình hình ghép nhóm của từng Course; admin quản lý Course,
danh sách sinh viên của Course và tài khoản.

## Đọc trước

- `docs/design/frontend.md` (bắt buộc)
- `docs/design/api-contract.md`, mục "Auth Service", "Course", "Phòng" (phần đọc), "Nhóm"
- `frontend/src/api/index.ts`, `frontend/src/api/types.ts`, `frontend/src/components/*`

## Được sửa

- `frontend/src/pages/staff/**`
- `frontend/src/pages/admin/**`
- `frontend/src/features/staff/**` (tạo mới nếu cần)

## Quyền theo vai trò

Dùng `useAuth().hasRole(...)` để ẩn/hiện nút, khớp quyền của backend:

| Thao tác | Admin | Trưởng bộ môn | Giảng viên |
|---|---|---|---|
| Xem Course, thống kê, sinh viên, phòng, nhóm | ✓ | ✓ | ✓ |
| Mở / đóng ghép nhóm, sửa Course | ✓ | ✓ | |
| Tạo, xóa Course; thêm / gỡ sinh viên | ✓ | | |
| Quản lý tài khoản | ✓ | | |

## Màn hình

### 1. Danh sách Course — `CoursesPage` (`/staff/courses`)

- Bảng `coursesApi.list`: mã (link sang chi tiết), `CourseStatusTag`, loại nhóm, số sinh viên, bắt đầu,
  hạn. Lọc theo trạng thái, học kỳ (`referenceApi.semesters`), môn (`referenceApi.subjects`); tìm theo `q`;
  sắp xếp theo mã / hạn; phân trang server.
- Thao tác mỗi dòng: **Mở ghép nhóm** (`Planned`), **Đóng ghép nhóm** (`Forming`, xác nhận), **Sửa**,
  **Xóa** (chỉ `Planned`, xác nhận).
- Nút **Tạo Course** (admin): modal chọn học kỳ, môn, loại nhóm (`referenceApi.groupTypes`), thời gian bắt
  đầu và hạn (`DatePicker` có giờ). Mã Course do server sinh.
- Modal **Sửa**: loại nhóm (chỉ đổi được khi `Planned`), bắt đầu, hạn.

### 2. Chi tiết Course — `CourseDetailPage` (`/staff/courses/:courseId`)

- Đầu trang: mã, trạng thái, loại nhóm và quy định của nó, thời gian; các nút mở/đóng/sửa như trang trước.
- Thống kê (`coursesApi.stats`): `Statistic` cho tổng sinh viên, đã vào phòng, đã có nhóm, số nhóm;
  `Progress` tỉ lệ sinh viên đã có nhóm; số phòng theo từng trạng thái (`roomsByStatus`).
- `Tabs`:
  - **Sinh viên** (`coursesApi.students`): mã SV, họ tên, email, ngành, đã có phòng hay chưa. Lọc theo ngành
    (`referenceApi.majors`) và "đã có phòng / chưa có phòng" (`hasRoom`), tìm theo `q`, phân trang. Admin có
    nút **Thêm sinh viên** (modal `Select` nhiều lựa chọn, tìm qua `referenceApi.students({ q })`, gọi
    `coursesApi.enroll`, báo số thêm mới / bỏ qua) và nút **Gỡ** từng dòng (xác nhận).
  - **Phòng** (`coursesApi.rooms`): mã, trạng thái, số người, `MajorCounts`, trưởng phòng, ngày tạo; lọc
    trạng thái, tìm mã, phân trang. Mở rộng một dòng để xem thành viên (`roomsApi.get`) và nút **Kiểm tra cơ
    cấu** (`roomsApi.composition`, hiện `violations`; lỗi 503 hiện "Dịch vụ ghép nhóm không phản hồi").
  - **Nhóm** (`coursesApi.groups`): mã, số thành viên, trưởng nhóm, ngày thành lập; mở rộng dòng để xem
    thành viên.
- Sau mỗi thao tác ghi, tải lại thống kê và tab đang mở.

### 3. Tài khoản — `UsersPage` (`/admin/users`)

- Bảng `usersApi.list`: email, họ tên, vai trò (`Tag`, nhãn từ `roleLabel`), trạng thái, ngày tạo. Lọc theo
  vai trò, trạng thái; tìm `q`; sắp xếp theo email / họ tên / ngày tạo; phân trang server.
- **Tạo tài khoản**: email, họ tên, mật khẩu (tối thiểu 8 ký tự), vai trò (nhiều lựa chọn, `usersApi.roles`).
- **Sửa**: họ tên, trạng thái, vai trò. **Đặt lại mật khẩu**: modal nhập mật khẩu mới.
  **Vô hiệu hóa** (xác nhận, `usersApi.deactivate`) chỉ hiện với tài khoản đang `Active`.
- Lỗi `EMAIL_EXISTS`, `CANNOT_MODIFY_SELF` hiện qua `useApiAction` như mọi lỗi khác.

## Xong khi

- `npm run build` không lỗi.
- Các luồng sau chạy được trên trình duyệt với dữ liệu mẫu mới:
  1. `lecturer` xem `FA26-EXE101`: thống kê, lọc sinh viên chưa có phòng, xem phòng và cơ cấu; không thấy nút
     tạo/sửa/xóa/mở/đóng.
  2. `hod` mở ghép nhóm `FA26-EXE201`, sửa hạn, rồi đóng.
  3. `admin` thêm 3 sinh viên vào `FA26-EXE201`, gỡ 1 sinh viên; tạo một tài khoản Lecturer mới, sửa họ tên,
     đặt lại mật khẩu, vô hiệu hóa nó; tự vô hiệu hóa chính mình thì thấy lỗi `CANNOT_MODIFY_SELF`.
- Không chạy được backend thì ghi rõ trong báo cáo; Manager sẽ thử.

## Ngoài phạm vi

Trang sinh viên (F1); CRUD học kỳ, môn, ngành, loại nhóm (dùng Swagger); sửa `api/`, `auth/`, `components/`,
`App.tsx`.
