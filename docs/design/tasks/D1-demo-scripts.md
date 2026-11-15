# D1 — Script demo và e2e: kiểm tra dữ liệu trước khi chạy, không crash

Worker 1. Chỉ sửa hai script Python, không đụng code dịch vụ.

## Vấn đề

`docs/demo/demo.py` và `tests/e2e/e2e_smoke.py` giả định dữ liệu mẫu còn mới (vừa `docker compose down -v`
rồi `docker compose up -d`). Khi chạy lại lần thứ hai mà chưa reset, Sinh viên 01 đã ở trong một phòng, nên bước
tạo phòng trả 409 `BR05` (đúng nghiệp vụ). Script không xử lý trường hợp này và crash:

```text
== 2. QT01 – Sinh viên 01 (SE) tạo phòng → thành trưởng phòng
   POST /api/courses/{FA26-EXE101}/rooms -> 409
   Lỗi BR05: Sinh viên đã ở một phòng khác trong Course.
Traceback (most recent call last):
  File "docs/demo/demo.py", line 63, in <module>
    room_line(room)
  File "docs/demo/demo.py", line 41, in room_line
    majors = ", ".join(f"{m['majorCode']}×{m['count']}" for m in room["majors"])
KeyError: 'majors'
```

Hội đồng có thể thấy đúng lỗi này nếu nhóm quên reset trước khi demo.

## Được sửa

- `docs/demo/demo.py`
- `tests/e2e/e2e_smoke.py`

Không sửa file nào khác. Chỉ dùng thư viện chuẩn của Python (không cài thêm package).

## Việc cần làm (áp dụng cho cả hai script)

1. **Kiểm tra trước khi chạy** (preflight), in kết quả thành một mục riêng ở đầu:
   - Gateway phản hồi `GET /health` (`http://localhost:8080/health`). Không kết nối được → báo
     "Không kết nối được API Gateway ở http://localhost:8080. Hãy chạy: docker compose up -d" và thoát.
   - Đăng nhập được bằng `student01@exe.local`. Lỗi → in mã HTTP và thông điệp, gợi ý kiểm tra
     `SEED_DEFAULT_PASSWORD` trong `.env` và trạng thái `docker compose ps`, rồi thoát.
   - **Dữ liệu còn mới**: gọi `GET /api/courses/30000000-0000-0000-0000-000000000001/rooms?pageSize=1`
     bằng token sinh viên; nếu `totalItems > 0` thì dữ liệu đã được dùng.
   - Dữ liệu đã được dùng → in rõ (tiếng Việt):
     "Dữ liệu đã được dùng ở lần chạy trước (Course FA26-EXE101 đang có N phòng). Script cần dữ liệu mẫu ban đầu.
     Reset bằng: docker compose down -v  rồi  docker compose up -d  (chờ 30–60 giây), sau đó chạy lại."
     rồi thoát với **exit code 2**, không chạy bước nào khác.
2. **Không bao giờ crash bằng traceback** khi API trả kết quả ngoài dự kiến:
   - Mọi bước đọc trường từ response (ví dụ `room["id"]`, `room["majors"]`, `b["accessToken"]`) phải kiểm tra
     status trước. Status sai → in bước nào thất bại, mã HTTP, `code` và `title` của ProblemDetails nếu có,
     rồi dừng với exit code 1.
   - Bọc phần chạy chính: lỗi kết nối hoặc lỗi bất ngờ → in một dòng giải thích dễ hiểu, exit code 1. Không in
     traceback (có thể in thêm chi tiết khi đặt biến môi trường `DEMO_DEBUG=1`).
3. Thiếu đối số `.env` hoặc file không tồn tại → in cách dùng (`python docs/demo/demo.py .env`) và thoát.
4. Giữ nguyên nội dung, thứ tự và lời dẫn của 14 bước demo và 29 bước e2e khi dữ liệu mới. Không đổi dữ liệu
   mẫu, tài khoản hay mã phòng mong đợi.
5. Docstring đầu mỗi file ghi cách dùng, yêu cầu dữ liệu mới và ý nghĩa exit code (0 đạt, 1 lỗi, 2 dữ liệu cũ).

## Xong khi

Nếu máy có Docker (hệ thống đang chạy):

1. `docker compose down -v`, `docker compose up -d`, chờ đủ lâu → `python docs/demo/demo.py .env` chạy hết 14 bước
   như trước, exit code 0.
2. Chạy lại ngay lần nữa (không reset) → in thông báo dữ liệu cũ kèm lệnh reset, **không có traceback**, exit code 2.
3. Tương tự cho `python tests/e2e/e2e_smoke.py .env`: lần đầu `29/29 checks passed` (exit 0), lần hai báo dữ liệu
   cũ (exit 2).
4. `docker compose stop gateway` rồi chạy script → báo không kết nối được Gateway, không traceback; sau đó
   `docker compose start gateway`.

Ghi exit code của từng trường hợp vào báo cáo (PowerShell: `$LASTEXITCODE`). Không có Docker thì ghi rõ trong
báo cáo; Manager sẽ thử.
