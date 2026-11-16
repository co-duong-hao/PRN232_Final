# Kịch bản demo EXE Team Matching

Dành 7 phút cho luồng ghép nhóm và 1 phút cho tìm nhóm theo GPA/vai trò nếu còn thời gian. Chuẩn bị trình duyệt có các phiên SV01, SV02, SV06 và SV08. Mở sẵn Web, Swagger, Mailpit và đặt cửa sổ terminal ở thư mục repo.

## Trước khi chiếu

1. Dùng môi trường Compose riêng. Dựng và seed theo [hướng dẫn chạy](HUONG_DAN_CHAY.md). Kiểm tra `docker compose ps`, Gateway `http://localhost:8080/health` và đăng nhập được.
2. Chọn `FA26-EXE101` với dữ liệu mới. Kiểm tra loại nhóm có 4–6 thành viên, ít nhất 3 ngành, 2–3 SE.
3. Chọn một trong hai cách chạy cùng bộ dữ liệu. Demo trên Web để hội đồng thấy thao tác. Chạy script khi cần trình diễn API trong terminal. Mỗi lượt đều tạo dữ liệu, vì vậy chuẩn bị seed mới trước khi chuyển cách chạy.

## Điều phối trên sân khấu

| Thời gian | Thao tác | Lời dẫn và bằng chứng |
|---|---|---|
| 0:00–1:00 | SV01 tạo phòng trong EXE101. | “Sinh viên tạo phòng trở thành trưởng phòng.” Chỉ mã phòng vừa tạo. |
| 1:00–2:00 | SV02 và SV06 tham gia. Mở lại màn hình của SV08. | “Phòng tự khóa khi đủ ba người. Sinh viên tiếp theo cần gửi đơn.” Chỉ trạng thái phòng và số thành viên. |
| 2:00–3:00 | SV01 mở kết quả kiểm tra cơ cấu. | “Matching Service kiểm tra từng điều kiện. Ba người và hai ngành còn thiếu so với loại nhóm đang chọn.” Chỉ lý do chưa đạt. |
| 3:00–4:30 | SV08 gửi đơn. SV01 chấp nhận rồi chuyển trưởng phòng cho SV02. | Chỉ đơn đã duyệt và thành viên GD mới. Mở phiên SV02, xác nhận quyền trưởng phòng. |
| 4:30–6:00 | SV02 kiểm tra cơ cấu, bấm hoàn tất rồi mở chi tiết nhóm. | “Đã đủ bốn người, ba ngành, hai SE.” Ghi mã nhóm và chỉ SV02 trong danh sách thành viên. |
| 6:00–7:00 | Tìm thư thành lập trong Mailpit theo mã nhóm. | “Team Service phát sự kiện qua Kafka. Noti Service chuyển thành email gửi các thành viên.” Đối chiếu mã nhóm với bước trước. |
| Nếu còn 1 phút | Mở Course EXE201 và danh sách phòng có dữ liệu tuyển dụng. | Đổi bộ lọc GPA/vai trò, chỉ kết quả thay đổi và trạng thái Course độc lập. |

## Chạy qua terminal

```powershell
python docs/demo/demo.py .env
$LASTEXITCODE
```

Mã 0 là chạy hết luồng, 1 là lỗi, 2 là dữ liệu đã được dùng. Nếu script dừng sau khi tạo phòng, giữ log và mã phòng làm bằng chứng. Khi cần chạy lại từ đầu, thực hiện bước reset trong [hướng dẫn chạy](HUONG_DAN_CHAY.md) trên môi trường demo riêng. Việc xóa volume sẽ xóa dữ liệu của Compose project đó.

Nếu web gặp lỗi trong buổi trình bày, dùng Swagger với đúng vai trò để tiếp tục từ trạng thái hiện tại, hoặc dành một bộ dữ liệu sạch để chạy script. Nếu email đến chậm, kiểm tra mã nhóm đã tạo và mở log Noti trước khi kết luận về Kafka hoặc SMTP. [Mã demo 14 bước](demo/demo.py)
