# G2b — Giao diện: hoàn thiện bố cục theo mẫu F-Spark

Worker 1. Tiếp nối G2. Chức năng của G2 đã chạy đúng trên hệ thống thật (Manager đã thử: hồ sơ, modal tạo nhóm, lọc
GPA/vai trò, BR19, phòng đã hủy). Task này chỉ sửa **bố cục** những chỗ chưa theo mục "Mẫu giao diện tham khảo"
trong `G2-recruitment-ui.md`, và bổ sung cột còn thiếu ở trang giảng viên. **Không đổi logic gọi API.**

## Đọc trước

- `docs/design/tasks/G2-recruitment-ui.md`, mục **"Mẫu giao diện tham khảo (F-Spark, F-Caps)"** (bắt buộc)
- `docs/design/frontend.md`

## Được sửa

- `frontend/src/pages/student/**`, `frontend/src/pages/staff/**`, `frontend/src/features/**`

## Việc cần làm

1. **Tìm nhóm** (`CourseRoomsPage`) — hiện vẫn là một bảng dài 12 cột. Chuyển sang bố cục F-Spark "Discover Groups":
   - Đầu trang: chữ nhỏ màu cam "SINH VIÊN", tiêu đề lớn "Tìm nhóm — {mã Course}", phụ đề "Tìm nhóm phù hợp với mục tiêu
     dự án hoặc tạo nhóm mới", nút cam **+ Tạo nhóm** ở góc phải (mở `CreateRoomModal` như hiện nay). Giữ dòng quy định
     loại nhóm và `Alert` "Bạn đang ở phòng …".
   - Thân trang chia **hai cột** (`Row`/`Col`, trên màn hình hẹp xếp chồng):
     - **Cột trái (~40%)**: thẻ bộ lọc (Tên nhóm, GPA của bạn — ghi "Tối đa 4", công tắc "Chỉ phòng tôi vào được", Vai trò
       cần tuyển, Trạng thái) và **danh sách thẻ phòng** cuộn được, có phân trang. Mỗi thẻ: tên nhóm (hoặc mã phòng),
       dòng phụ "FA26 · EXE201 · R001", trưởng phòng, số người "x/MaxMemberCount", vai trò cần tuyển dạng `Tag`
       (hoặc "Chưa tuyển thêm"), GPA yêu cầu; **dải chéo "Đang tuyển"** ở góc phải trên khi phòng `Open`/`Locked` và có
       vai trò cần tuyển (`Badge.Ribbon` của Ant Design là đủ). Thẻ đang chọn có viền cam.
     - **Cột phải (~60%)**: chi tiết phòng đang chọn — tên, dự án, mô tả ý tưởng, GPA yêu cầu, điểm mục tiêu, vai trò
       cần tuyển, cơ cấu ngành, thành viên — và nút **Vào phòng** / **Gửi đơn** / **Xem trang phòng**. Chưa chọn gì thì
       hiện ô trống: "Chọn một nhóm" — "Bấm vào một nhóm trong danh sách để xem chi tiết và gửi yêu cầu tham gia".
   - Giữ thẻ "Gợi ý cho bạn" (đặt trên danh sách thẻ ở cột trái, hoặc thu gọn) và toàn bộ xử lý BR19 hiện có.
2. **Chi tiết phòng** (`RoomDetailPage`) — thông tin đang là các dòng chữ, nút nằm cuối thẻ. Theo F-Spark "My Group
   Workspace":
   - Hàng đầu: tên nhóm làm tiêu đề, các nút hành động ở **góc phải** (Sửa thông tin tuyển, Chuyển trưởng phòng,
     **Hoàn tất thành nhóm** — nút cam, **Rời phòng** — viền đỏ); người không phải thành viên thấy Vào phòng / Gửi đơn.
   - Thẻ thông tin: mã phòng + Course + tag trạng thái; bên dưới là **lưới ô nhỏ** (mỗi ô một nhãn chữ hoa xám nhỏ và
     giá trị): Dự án, GPA yêu cầu, Điểm mục tiêu, Trưởng phòng, Course, Số thành viên.
   - Khối **Mô tả ý tưởng** và khối **Vai trò cần tuyển** riêng (nền xám nhạt, bo góc).
   - Phần thành viên, cơ cấu nhóm, đơn xin vào phòng giữ nguyên.
3. **Course của tôi** (`MyCoursesPage`) — 4 thẻ thống kê đang là thẻ trắng trơn. Thêm **viền trái màu cam** và một
   biểu tượng trong ô vuông cam nhạt ở góc phải mỗi thẻ (như Dashboard của F-Spark).
4. **Trang giảng viên** (`pages/staff/CourseDetailPage`): bảng sinh viên của Course thêm cột **GPA** và **Vai trò**;
   bảng phòng thêm cột **Tên nhóm** và **GPA yêu cầu**. (Bộ lọc "Đã hủy" chỉ cho Admin đã đúng — giữ nguyên.)

## Xong khi

- `npm run format` rồi `npm run build` trong `frontend/` không lỗi.
- Nếu hệ thống đang chạy (http://localhost:3000): đăng nhập `student01@exe.local`, xem "Tìm nhóm" của FA26-EXE201,
  chọn một thẻ thấy chi tiết ở cột phải; mở trang phòng thấy lưới ô thông tin và nút ở góc phải. Ghi vào báo cáo
  những gì đã thử.
