"""Cách dùng: python docs/demo/demo.py .env. Cần dữ liệu mẫu mới (docker compose down -v rồi up -d). Exit: 0 đạt, 1 lỗi, 2 dữ liệu cũ."""
import json
import os
import traceback
import sys
import time
import urllib.error
import urllib.request

GW = "http://localhost:8080"
COURSE = "30000000-0000-0000-0000-000000000001"
sys.stdout.reconfigure(encoding="utf-8")
PASSWORD = None


def call(method, path, token=None, body=None):
    req = urllib.request.Request(GW + path, data=json.dumps(body).encode() if body is not None else None, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            raw = r.read()
            try:
                return r.status, json.loads(raw) if raw else None
            except ValueError:
                return r.status, raw.decode(errors="replace")[:200]
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw) if raw else None
        except ValueError:
            return e.code, raw.decode(errors="replace")[:200]


def step(title):
    global current_step
    current_step = title
    print(f"\n== {title}")
    time.sleep(0.3)


def show(method, path, status, body):
    print(f"   {method} {path} -> {status}")
    if isinstance(body, dict) and "code" in body and status >= 400:
        print(f"   Lỗi {body['code']}: {body['title']}")


def room_line(room):
    majors = ", ".join(f"{m['majorCode']}×{m['count']}" for m in room["majors"])
    print(f"   Phòng {room['code']} | {room['status']} | {room['memberCount']} người | {majors} | trưởng phòng: {room['leaderName']}")


tokens = {}


def login(email):
    s, b = call("POST", "/api/auth/login", body={"email": email, "password": PASSWORD})
    require_status(f"đăng nhập {email}", s, 200, b)
    tokens[email] = b["accessToken"]
    return b


class ScriptError(Exception):
    pass


def require_status(step_name, status, expected, body):
    if status != expected:
        details = body if isinstance(body, dict) else {}
        print(f"   Thất bại tại {step_name}: HTTP {status}, code={details.get('code', 'không có')}, title={details.get('title', 'không có')}")
        raise ScriptError()


def preflight():
    print("== Kiểm tra trước khi chạy")
    try:
        status, body = call("GET", "/health")
    except (urllib.error.URLError, OSError, TimeoutError):
        print("Không kết nối được API Gateway ở http://localhost:8080. Hãy chạy: docker compose up -d")
        raise ScriptError()
    require_status("kiểm tra Gateway", status, 200, body)
    status, body = call("POST", "/api/auth/login", body={"email": "student01@exe.local", "password": PASSWORD})
    if status != 200:
        details = body if isinstance(body, dict) else {}
        message = details.get("title") or details.get("message") or body or "Không có thông điệp"
        print(f"Đăng nhập thất bại: HTTP {status}, code={details.get('code', 'không có')}, thông điệp: {message}. Kiểm tra SEED_DEFAULT_PASSWORD trong .env và trạng thái docker compose ps.")
        raise ScriptError()
    token = body["accessToken"]
    status, body = call("GET", f"/api/courses/{COURSE}/rooms?pageSize=1", token)
    require_status("kiểm tra dữ liệu mẫu", status, 200, body)
    count = body["totalItems"]
    if count > 0:
        print(f"Dữ liệu đã được dùng ở lần chạy trước (Course FA26-EXE101 đang có {count} phòng). Script cần dữ liệu mẫu ban đầu. Reset bằng: docker compose down -v  rồi  docker compose up -d  (chờ 30–60 giây), sau đó chạy lại.")
        return False
    print("   Gateway, đăng nhập và dữ liệu mẫu: OK")
    return True


def show_course_stats(lecturer):
    status, stats = call("GET", f"/api/courses/{COURSE}/stats", lecturer)
    require_status("xem thống kê Course", status, 200, stats)
    total = stats["totalStudents"]
    in_room = stats["studentsInRoom"]
    in_group = stats["studentsInGroup"]
    without_room = max(0, total - in_room)
    print(f"   Giảng viên xem FA26-EXE101: {in_room}/{total} SV đã vào phòng, "
          f"{in_group}/{total} SV đã có nhóm, {without_room} SV chưa có phòng, "
          f"{stats['groupCount']} nhóm chính thức.")
    labels = {"Open": "Đang mở", "Locked": "Đã khóa", "Completed": "Đã thành nhóm"}
    counts = ", ".join(f"{label} {stats['roomsByStatus'].get(key, 0)}" for key, label in labels.items())
    print(f"   Trạng thái phòng: {counts}")


def main():
    step("1. Đăng nhập qua API Gateway (Auth Service phát JWT)")
    lecturer = login("lecturer@exe.local")["accessToken"]
    for n in [1, 2, 6, 8, 11]:
        u = login(f"student{n:02d}@exe.local")
        print(f"   {u['user']['fullName']:<14} {u['user']['email']:<22} role={u['user']['roles']}")
    S = lambda n: tokens[f"student{n:02d}@exe.local"]

    step("2. QT01 – Sinh viên 01 (SE) tạo phòng → thành trưởng phòng")
    s, room = call("POST", f"/api/courses/{COURSE}/rooms", S(1))
    require_status(current_step, s, 201, room)
    show("POST", f"/api/courses/{{FA26-EXE101}}/rooms", s, room)
    room_line(room)
    rid = room["id"]

    step("3. BR05 – Sinh viên 01 thử tạo phòng thứ hai trong cùng Course")
    s, b = call("POST", f"/api/courses/{COURSE}/rooms", S(1))
    require_status(current_step, s, 409, b)
    show("POST", "/api/courses/{FA26-EXE101}/rooms", s, b)

    step("4. QT02 – Sinh viên 02 (SE) và 06 (AI) vào phòng; đủ 3 người thì phòng tự KHÓA (BR08)")
    s, b = call("POST", f"/api/rooms/{rid}/join", S(2))
    require_status(current_step, s, 200, b)
    s, room = call("POST", f"/api/rooms/{rid}/join", S(6))
    require_status(current_step, s, 200, room)
    room_line(room)
    show_course_stats(lecturer)

    step("5. Sinh viên 08 (GD) không vào thẳng được phòng đã khóa")
    s, b = call("POST", f"/api/rooms/{rid}/join", S(8))
    require_status(current_step, s, 409, b)
    show("POST", "/api/rooms/{id}/join", s, b)

    step("6. gRPC – Kiểm tra cơ cấu phòng qua Matching Service")
    s, comp = call("GET", f"/api/rooms/{rid}/composition", S(1))
    require_status(current_step, s, 200, comp)
    print(f"   satisfied={comp['satisfied']}")
    for v in comp["violations"]:
        print("   -", v)

    step("7. BR16 – Trưởng phòng thử hoàn tất khi chưa đủ cơ cấu")
    s, b = call("POST", f"/api/rooms/{rid}/complete", S(1))
    require_status(current_step, s, 409, b)
    show("POST", "/api/rooms/{id}/complete", s, b)

    step("8. gRPC – Sinh viên 08 (GD) xem gợi ý phòng")
    s, recs = call("GET", f"/api/courses/{COURSE}/rooms/recommendations?limit=3", S(8))
    require_status(current_step, s, 200, recs)
    for r in recs:
        print(f"   {r['roomCode']} điểm {r['score']}: {' '.join(r['reasons'])}")

    step("9. QT03 – Sinh viên 08 gửi đơn; trưởng phòng duyệt")
    s, ap = call("POST", f"/api/rooms/{rid}/applies", S(8), {"message": "Mình phụ trách thiết kế UI/UX."})
    require_status(current_step, s, 201, ap)
    print(f"   Đơn {ap['status']} – {ap['fullName']} ({ap['majorCode']}): {ap['message']}")
    s, b = call("POST", f"/api/room-applies/{ap['id']}/approve", S(2))
    require_status(current_step, s, 403, b)
    show("POST", "/api/room-applies/{id}/approve  (sinh viên 02, không phải trưởng phòng)", s, b)
    s, ap = call("POST", f"/api/room-applies/{ap['id']}/approve", S(1))
    require_status(current_step, s, 200, ap)
    print(f"   Trưởng phòng duyệt → đơn {ap['status']}")
    s, room = call("GET", f"/api/rooms/{rid}", S(1))
    require_status(current_step, s, 200, room)
    room_line(room)

    step("10. QT05 – Chuyển quyền trưởng phòng cho Sinh viên 02")
    s, room = call("PUT", f"/api/rooms/{rid}/leader", S(1), {"studentId": "20000000-0000-0000-0000-000000000002"})
    require_status(current_step, s, 200, room)
    room_line(room)

    step("11. gRPC – Kiểm tra lại cơ cấu: 4 người, 3 ngành, SE×2")
    s, comp = call("GET", f"/api/rooms/{rid}/composition", S(2))
    require_status(current_step, s, 200, comp)
    print(f"   satisfied={comp['satisfied']}  violations={comp['violations']}")

    step("12. QT06 – Trưởng phòng mới hoàn tất phòng → Nhóm chính thức")
    s, grp = call("POST", f"/api/rooms/{rid}/complete", S(2))
    require_status(current_step, s, 201, grp)
    print(f"   Nhóm {grp['code']} ({grp['groupTypeName']})")
    for m in grp["members"]:
        print(f"   - {m['studentCode']} {m['fullName']} ({m['majorCode']}){'  ★ trưởng nhóm' if m['isLeader'] else ''}")

    show_course_stats(lecturer)
    print("   Trên web: đăng nhập giảng viên, mở Quản lý Course / FA26-EXE101 / Thống kê.")
    print("   Chọn Xem sinh viên để lọc người chưa có phòng hoặc chọn Đã thành nhóm để xem phòng hoàn tất.")
    print("   Thu hẹp cửa sổ để xem các chỉ số xếp lại và cuộn ngang trong bảng.")
    print("   Có thể chặn riêng yêu cầu GET */stats trong DevTools, tải lại trang để xem lỗi, "
          "rồi bỏ chặn và bấm Thử lại.")

    step("13. BR18 – Thành viên không tự rời nhóm đã thành lập")
    s, b = call("POST", f"/api/rooms/{rid}/leave", S(6))
    require_status(current_step, s, 409, b)
    show("POST", "/api/rooms/{id}/leave", s, b)

    step("14. Kafka → Noti Service → email (Mailpit)")
    time.sleep(4)
    with urllib.request.urlopen("http://localhost:8025/api/v1/messages?limit=100", timeout=10) as r:
        mails = json.loads(r.read())
    print(f"   Mailpit đã nhận {mails['total']} email. Mới nhất:")
    for m in mails["messages"][:6]:
        print(f"   - tới {m['To'][0]['Address']:<22} {m['Subject']}")
    print("\nXem tất cả email: http://localhost:8025")


if __name__ == "__main__":
    try:
        if len(sys.argv) != 2 or not os.path.isfile(sys.argv[1]):
            print("Cách dùng: python docs/demo/demo.py .env")
            sys.exit(1)
        with open(sys.argv[1], encoding="utf-8") as env_file:
            env = dict(line.strip().split("=", 1) for line in env_file
                       if "=" in line and not line.lstrip().startswith("#"))
        PASSWORD = env["SEED_DEFAULT_PASSWORD"]
        if not preflight():
            sys.exit(2)
        sys.exit(main() or 0)
    except ScriptError:
        sys.exit(1)
    except Exception as exc:
        print(f"Không thể tiếp tục script: {exc}")
        if os.environ.get("DEMO_DEBUG") == "1":
            traceback.print_exc()
        sys.exit(1)
