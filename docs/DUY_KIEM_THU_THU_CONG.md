# Kiểm thử thủ công EXE Team Matching

Dùng một môi trường Compose dành riêng cho kiểm thử. Chuẩn bị dữ liệu mới theo [hướng dẫn chạy](HUONG_DAN_CHAY.md), sau đó mở Web `localhost:3000`, Team Swagger `localhost:5102/swagger` và Mailpit `localhost:8025`. Mật khẩu lấy từ `SEED_DEFAULT_PASSWORD` trong môi trường kiểm thử. Dùng profile trình duyệt riêng khi cần giữ hai phiên đăng nhập.

## Ca kiểm thử

Thực hiện CT01–CT09 theo thứ tự trên `FA26-EXE101`. Bắt đầu CT10 với một bộ dữ liệu sạch riêng.

| Mã | Thao tác | Kết quả kỳ vọng |
|---|---|---|
| CT01 | Gọi danh sách phòng qua Gateway khi thiếu JWT. Đăng nhập tài khoản mẫu với mật khẩu sai, sau đó thử mật khẩu đúng. | Danh sách phòng trả 401. Sai mật khẩu trả 401 `INVALID_CREDENTIALS`. Đăng nhập đúng mở trang theo vai trò. |
| CT02 | SV01 (SE) tạo phòng, rồi gọi lại API tạo trong cùng Course. | Phòng mở, có một thành viên và SV01 là trưởng phòng. Lần tạo thứ hai trả 409 `BR05`. |
| CT03 | SV02 (SE) rồi SV06 (AI) vào phòng. Dùng SV08 (GD) gọi API tham gia trực tiếp. | Phòng tự khóa khi đủ 3 người. SV08 nhận 409 `ROOM_NOT_OPEN`. |
| CT04 | Xem cơ cấu và thử hoàn tất bằng SV01 qua API. | Cơ cấu chưa đạt. Lệnh hoàn tất trả 409 `BR16`. |
| CT05 | SV08 gửi đơn. Dùng token SV02 gọi API duyệt. Sau đó duyệt thật bằng SV01. | Đơn ban đầu `Pending`. SV02 nhận 403 `NOT_ROOM_LEADER`. SV01 duyệt thành công, đơn `Approved`, phòng có 4 người. |
| CT06 | SV01 chuyển trưởng phòng cho SV02. Dùng SV02 tải lại phòng và xem cơ cấu. | SV02 là trưởng phòng. Cơ cấu đạt với SE×2, AI×1 và GD×1. |
| CT07 | SV02 hoàn tất phòng. SV06 gọi API rời phòng sau khi hoàn tất. | Nhận nhóm cùng ID phòng, có 4 thành viên và SV02 là trưởng nhóm. API rời trả 409 `BR18`. |
| CT08 | Mở Mailpit và tìm thư thành lập theo mã nhóm vừa nhận. | Tiêu đề đúng mã nhóm, có thư gửi đến SV01, SV02, SV06 và SV08. |
| CT09 | Tìm phòng đã hoàn tất bằng bộ lọc `Completed`. Đăng nhập giảng viên và mở thống kê Course. | Kết quả có mã phòng của CT07. Thống kê phản ánh phòng và nhóm vừa tạo. |
| CT10 | Tạo phòng trong EXE101 bằng SV01 rồi chuyển sang EXE201. Lọc theo GPA/vai trò trên danh sách phòng có dữ liệu tuyển dụng. | Hai Course có trạng thái thành viên riêng. Kết quả lọc phù hợp điều kiện đã nhập và có trạng thái rỗng khi không khớp. |

Khi nút bị ẩn do quyền hoặc trạng thái, kiểm tra phản hồi âm tính bằng Swagger hoặc công cụ HTTP. Các route kiểm tra nằm trong [RoomsController](../src/TeamService/Controllers/RoomsController.cs#L14-L78). Cách phân trang và mã lỗi xem tại [hợp đồng API](design/api-contract.md).

## Ghi nhận kết quả

| Ca | Commit chạy | Vai trò | Mã phòng/nhóm hoặc HTTP và mã lỗi | Đạt/không đạt | Bằng chứng |
|---|---|---|---|---|---|
| CT__ | | | | | |

Chụp ảnh cửa sổ liên quan hoặc lưu phản hồi đã che token. Nếu một ca tạo trạng thái sai, ghi ca bị ảnh hưởng và chuẩn bị lại dữ liệu trước khi chạy tiếp. Dùng [smoke test](../tests/e2e/e2e_smoke.py) để đối chiếu phần API trên một lượt seed riêng.

## Kết quả đối chiếu qua API ngày 16/11/2026

Lượt chạy trên Docker Compose với backend `a353bca` và script `b9f76e0`.

| Phạm vi | Kết quả ghi nhận |
|---|---|
| CT01–CT08 qua API | Smoke test 29/29. Tạo phòng `FA26-EXE101-R001`, hoàn tất thành nhóm `FA26-EXE101-G001`, xác nhận bốn email thành lập. |
| CT09 qua API | Bộ lọc Completed trả phòng R001. API thống kê với vai trò Lecturer trả 1 phòng hoàn tất, 1 nhóm và 4 sinh viên trong nhóm. |
| CT10 qua API | SV01 tạo phòng EXE201 sau khi đã vào nhóm EXE101. Tạo phòng cần GPA 3.2 và vai trò UIUX. Lọc GPA 3.2 với UIUX trả 1 phòng, GPA 3.1 với UIUX trả 0 và GPA 3.2 với FE trả 0. |

Các thao tác trên giao diện vẫn cần được ghi riêng vào bảng kết quả khi diễn tập.
