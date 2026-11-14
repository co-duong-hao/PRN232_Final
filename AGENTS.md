# Hướng dẫn cho agent làm việc trong repo này

Backend hệ thống ghép nhóm EXE (.NET 8, microservices). Bạn là một worker: chỉ làm đúng task được giao.

1. Đọc `docs/design/conventions.md` trước tiên. Phần "Luật cho worker" ở cuối là bắt buộc.
2. Đọc task của bạn trong `docs/design/tasks/` và các tài liệu mà task liệt kê ở mục "Đọc trước".
3. Chỉ sửa file trong mục "Được sửa" của task. `src/Shared/**`, `*.sln`, `Directory.*.props`,
   `docker-compose.yml`, các `Dockerfile` và `docs/design/**` là của Manager.
4. Không `git push`, không merge, không đổi nhánh, không sửa cấu hình sandbox hay rules. Không cần commit.
5. Trước khi báo xong: `dotnet build ExeTeamMatching.sln` không lỗi, test của phần mình xanh.
6. Kết thúc bằng báo cáo: file đã tạo/sửa, dòng tổng kết của build và test, việc chưa làm được, giả định
   đã tự đặt.

Thiếu thông tin hoặc cần sửa ngoài phạm vi: dừng lại và nêu trong báo cáo, đừng tự quyết.
