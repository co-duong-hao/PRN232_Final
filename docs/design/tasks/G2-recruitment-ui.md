# G2 — Giao diện: hồ sơ, form tạo nhóm, tìm nhóm theo GPA và vai trò

Worker 1. Chạy song song với G1 (backend). Kiểu dữ liệu và hàm API **đã có sẵn** trong `frontend/src/api`
theo hợp đồng mới; backend sẽ có khi G1 xong, nên trong lúc làm chỉ cần build qua.

## Đọc trước

- `docs/design/recruitment.md` (bắt buộc — yêu cầu, quy tắc BR19–BR22, mục "Giao diện")
- `docs/design/frontend.md` (quy ước frontend và luật cho worker)
- Ảnh mẫu form "Create group" mô tả trong `recruitment.md`: modal tiêu đề "Tạo nhóm", phụ đề
  "Thiết lập hồ sơ nhóm và định hướng dự án", hai cột, nút **Hủy** và **Lưu nhóm** (nút chính màu cam).
- `frontend/src/api/types.ts` (`TeamRole`, các trường mới của `Student`, `RoomSummary`, `RoomMember`, `RoomApply`,
  `RoomListParams.gpa/roleIds`, `RoomProfileRequest`, `StudentProfileRequest`) và `frontend/src/api/index.ts`
  (`referenceApi.teamRoles`, `meApi.updateProfile`, `coursesApi.createRoom(id, body)`, `roomsApi.updateProfile`)

## Được sửa

- `frontend/src/pages/student/**` (gồm `ProfilePage.tsx` đang là trang giữ chỗ)
- `frontend/src/pages/staff/**`
- `frontend/src/features/**`

Không sửa `src/api/**`, `src/auth/**`, `src/components/**`, `App.tsx`, `main.tsx`, cấu hình, `package.json`.
Route `/student/profile` và mục menu "Hồ sơ của tôi" đã có; theme đã đổi sang cam.

## Việc cần làm

1. **Hồ sơ của tôi** (`ProfilePage`): hiển thị mã SV, họ tên, email, ngành (chỉ đọc); sửa GPA (`InputNumber` 0–4,
   bước 0.01, có thể để trống) và vai trò (`Select` nhiều lựa chọn, 1–3, từ `referenceApi.teamRoles`); lưu bằng
   `meApi.updateProfile`. Sau khi lưu, hồ sơ trên header phải cập nhật — gọi lại `meApi.student()`; nếu cần làm mới
   `useAuth().student` mà không sửa được `auth/`, tải lại trang sau khi lưu là chấp nhận được, ghi trong báo cáo.
2. **Modal tạo nhóm** (`features/student/CreateRoomModal.tsx`), dùng chung ở hai nơi:
   - "Course của tôi": nút **Tạo nhóm** ở đầu trang; trong modal chọn **Kỳ** (từ các Course của tôi) rồi
     **Course** (chỉ Course `Forming` của kỳ đó mà tôi **chưa có phòng**).
   - Trang phòng của một Course: nút **Tạo phòng** cũ mở modal với Kỳ và Course đã chọn sẵn, khóa lại.
   - Trường: Tên nhóm, Tên dự án, GPA yêu cầu (tối đa 4), Điểm mục tiêu (tối đa 10), Vai trò cần tuyển (tối đa 5),
     Mô tả ý tưởng. Gợi ý (placeholder) như ảnh mẫu: "F-Spark Team", "Không bắt buộc", "2.5", "8.0",
     "Mô tả ngắn ý tưởng dự án". Lưu → `coursesApi.createRoom(courseId, body)` → chuyển tới trang phòng.
3. **Tìm nhóm** (`CourseRoomsPage`):
   - Bộ lọc: GPA (mặc định GPA của tôi), công tắc **"Chỉ phòng tôi vào được"** (bật → gửi `gpa`), vai trò cần tuyển
     (nhiều lựa chọn → `roleIds`), trạng thái, ô tìm theo tên nhóm / dự án / mã phòng.
   - Mỗi phòng hiện: tên nhóm (hoặc mã phòng nếu chưa đặt tên), tên dự án, GPA yêu cầu, điểm mục tiêu, vai trò cần
     tuyển (`Tag`), cơ cấu ngành, số người, trạng thái. Có thể đổi bảng sang dạng thẻ cho giống ảnh mẫu.
   - **Vào phòng** bị `BR19` → hiện thông báo "GPA của bạn thấp hơn yêu cầu của phòng. Hãy gửi đơn để trưởng phòng
     xét." kèm nút mở modal gửi đơn.
   - Không còn tùy chọn lọc "Đã hủy" cho sinh viên.
4. **Chi tiết phòng** (`RoomDetailPage`): thẻ **Thông tin tuyển** (tên nhóm, dự án, ý tưởng, GPA yêu cầu, điểm mục
   tiêu, vai trò cần tuyển); trưởng phòng có nút **Sửa thông tin tuyển** (dùng lại form, gọi
   `roomsApi.updateProfile`). Bảng thành viên và bảng đơn xin vào phòng thêm cột **GPA** và **Vai trò**.
5. **Trang giảng viên/admin** (`pages/staff`): tab Phòng và danh sách sinh viên hiện GPA/vai trò và tên nhóm; bộ lọc
   trạng thái "Đã hủy" chỉ hiện khi `hasRole("Admin")`.
6. Màu: không đặt cứng mã màu xanh cũ (`#1677ff`) trong các trang; dùng màu theme hoặc thẻ màu của Ant Design.

## Xong khi

- `npm run format` rồi `npm run build` trong `frontend/` không lỗi.
- Nếu backend G1 đã có trên máy và chạy được: thử các luồng trong mục "Giao diện" của `recruitment.md` với
  `student01` (GPA 3.40) và `student05` (GPA 2.20 — bị BR19 khi vào phòng yêu cầu 2.5, gửi đơn được). Không có
  backend thì ghi rõ trong báo cáo; Manager sẽ thử sau khi gộp G1 và G2.
