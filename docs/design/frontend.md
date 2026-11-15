# Frontend — quy ước

Ứng dụng web React cho sinh viên, giảng viên, trưởng bộ môn và admin. Mọi dữ liệu lấy từ backend qua
API Gateway; frontend không có logic nghiệp vụ riêng ngoài việc ẩn/hiện nút cho hợp lý.

## Công nghệ

React 18, TypeScript (strict), Vite 5, Ant Design 5 (giao diện tiếng Việt), React Router 6, dayjs.
**Không thêm package mới**: `package.json` là của Manager. Cần gì ngoài danh sách này thì nêu trong báo cáo.

## Chạy

```bash
cd frontend
npm install        # đã chạy sẵn trong mỗi worktree
npm run dev        # http://localhost:5173, /api được proxy sang Gateway http://localhost:8080
npm run build      # kiểm tra kiểu + build; phải không lỗi trước khi báo xong
```

`npm run dev` cần backend đang chạy (`docker compose up -d` ở thư mục gốc). Bản Docker của frontend chạy
ở http://localhost:3000 (Nginx chuyển `/api` sang Gateway).

Tài khoản mẫu: `docs/design/data-model.md`, mục "Dữ liệu mẫu"; mật khẩu là `SEED_DEFAULT_PASSWORD`
trong `.env.example`.

## Cấu trúc và quyền sửa

```
frontend/src/
  api/          types.ts (kiểu DTO), client.ts (fetch + lỗi), index.ts (một hàm cho mỗi endpoint)   [Manager]
  auth/         AuthContext (useAuth: user, student, hasRole, login, logout), RequireAuth            [Manager]
  components/   AppLayout, StatusTag, labels, format, useApiAction, Placeholder                      [Manager]
  App.tsx       bảng route                                                                           [Manager]
  main.tsx      ConfigProvider, AntApp, Router, AuthProvider                                          [Manager]
  pages/student/      trang sinh viên                                                                [F1]
  features/student/   component riêng của F1                                                         [F1]
  pages/staff/, pages/admin/   trang giảng viên, trưởng bộ môn, admin                                [F2]
  features/staff/     component riêng của F2                                                         [F2]
```

Mỗi trang đã có sẵn một component giữ chỗ cùng tên và route trong `App.tsx`. Task chỉ thay nội dung các
component đó, **giữ nguyên tên export**. Thiếu hàm API hoặc kiểu dữ liệu thì nêu trong báo cáo; đừng sửa
`api/`.

## Quy tắc viết

- Gọi backend **chỉ** qua các hàm trong `@/api` (`coursesApi`, `roomsApi`, `meApi`...). Không gọi `fetch`.
- Thao tác ghi (tạo, vào phòng, duyệt...) dùng `useApiAction(fn, "thông báo thành công")`: tự hiện lỗi từ
  backend, kèm mã quy tắc như `[BR05]`. Đọc dữ liệu thì bắt lỗi rồi gọi `useShowError()`.
- Sau mỗi thao tác ghi thành công, tải lại dữ liệu liên quan để giao diện khớp server.
- Trạng thái hiển thị bằng `RoomStatusTag`, `ApplyStatusTag`, `CourseStatusTag`, `MajorCounts`; ngày giờ
  bằng `formatDateTime`, `formatDate`. Nhãn tiếng Việt lấy từ `components/labels.ts`.
- Bảng danh sách dùng phân trang phía server: truyền `page`, `pageSize`, `sortBy`, `sortDir`, `q` và bộ lọc
  vào hàm API, đọc `totalItems` để vẽ `Pagination`. Ô tìm kiếm dùng `Input.Search`.
- Thao tác khó hoàn tác (rời phòng, hoàn tất phòng, đóng Course, vô hiệu hóa tài khoản) phải có
  `Popconfirm` hoặc `Modal.confirm`.
- Có trạng thái đang tải (`Spin`, `loading` của `Table`/`Button`) và trạng thái rỗng (`Empty`).
- Ẩn nút người dùng không được dùng (theo vai trò, trạng thái phòng, trưởng phòng hay không). Backend vẫn là
  nơi kiểm tra cuối cùng; giao diện chỉ giúp người dùng không bấm nhầm.
- Toàn bộ chữ trên giao diện là tiếng Việt.
- TypeScript strict, không dùng `any`. Component là function component với hooks.
- Định danh: `useAuth().user.id` là **userId**; `useAuth().student.id` là **studentId**. Phòng, đơn, nhóm
  dùng studentId (ví dụ so `room.leaderId === student.id` để biết có phải trưởng phòng).

## Luật cho worker

Giống `conventions.md`, mục "Luật cho worker", với các điểm riêng:

- Chỉ sửa file trong mục "Được sửa" của task.
- Trước khi báo xong: `npm run build` trong `frontend/` không lỗi.
- Nếu chạy được backend, tự thử các luồng trong mục "Xong khi" của task trên trình duyệt; nếu không chạy
  được, ghi rõ trong báo cáo.
