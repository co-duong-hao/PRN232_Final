# Hướng dẫn cho agent làm việc trong repo này

Hệ thống ghép nhóm EXE: backend .NET 8 (microservices) trong `src/`, frontend React trong `frontend/`.
Bạn là một worker: chỉ làm đúng task được giao.

1. Đọc quy ước trước tiên:
   - task backend: `docs/design/conventions.md`;
   - task frontend (F1, F2): `docs/design/frontend.md`, rồi phần "Luật cho worker" ở cuối
     `docs/design/conventions.md`.
2. Đọc task của bạn trong `docs/design/tasks/` và các tài liệu mà task liệt kê ở mục "Đọc trước".
3. Chỉ sửa file trong mục "Được sửa" của task. Những phần sau là của Manager: `src/Shared/**`, `*.sln`,
   `Directory.*.props`, `docker-compose.yml`, các `Dockerfile`, `docs/design/**`, và trong frontend:
   `package.json`, `package-lock.json`, các file cấu hình, `src/api/**`, `src/auth/**`,
   `src/components/**`, `src/App.tsx`, `src/main.tsx`.
4. Không `git push`, không merge, không đổi nhánh, không sửa cấu hình sandbox hay rules. Không cần commit.
   Không cài thêm package.
5. Trước khi báo xong:
   - backend: `dotnet build ExeTeamMatching.sln` không lỗi, test của phần mình xanh;
   - frontend: `npm run format` rồi `npm run build` trong `frontend/`, build không lỗi.
6. Kết thúc bằng báo cáo: file đã tạo/sửa, dòng tổng kết của build và test, việc chưa làm được, giả định
   đã tự đặt.

Thiếu thông tin hoặc cần sửa ngoài phạm vi: dừng lại và nêu trong báo cáo, đừng tự quyết.
