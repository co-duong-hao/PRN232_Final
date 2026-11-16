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


def require_status(step_name, status, expected, body, code=None):
    details = body if isinstance(body, dict) else {}
    if status != expected or (code is not None and details.get("code") != code):
        print(f"   Thất bại tại {step_name}: HTTP {status}, code={details.get('code', 'không có')}, title={details.get('title', 'không có')} (mong đợi HTTP {expected}{f', code={code}' if code else ''})")
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
    token = body.get("accessToken") if isinstance(body, dict) else None
    if not isinstance(token, str) or not token.strip():
        print("   Đăng nhập trả HTTP 200 nhưng thiếu accessToken hợp lệ.")
        raise ScriptError()
    status, body = call("GET", f"/api/courses/{COURSE}/rooms?pageSize=1", token)
    require_status("kiểm tra dữ liệu mẫu", status, 200, body)
    count = body.get("totalItems") if isinstance(body, dict) else None
    if type(count) is not int or count < 0:
        print("   Danh sách phòng trả totalItems không hợp lệ.")
        raise ScriptError()
    if count > 0:
        print(f"Dữ liệu đã được dùng ở lần chạy trước (Course FA26-EXE101 đang có {count} phòng). Script cần dữ liệu mẫu ban đầu. Reset bằng: docker compose down -v  rồi  docker compose up -d  (chờ 30–60 giây), sau đó chạy lại.")
        return False
    print("   Gateway, đăng nhập và dữ liệu mẫu: OK")
    return True


def mailpit_messages():
    with urllib.request.urlopen("http://localhost:8025/api/v1/messages?limit=100", timeout=3) as response:
        inbox = json.load(response)
    return inbox["messages"] or []


def wait_for_room_completed_mail(group_code, prior_message_ids):
    expected = {f"student{number:02d}@exe.local" for number in (1, 2, 6, 8)}
    subject = f"[EXE] Nhóm {group_code} đã được thành lập"
    deadline = time.monotonic() + 20
    recipients = set()
    while time.monotonic() < deadline:
        messages = [
            message for message in mailpit_messages()
            if message["ID"] not in prior_message_ids and message["Subject"] == subject
        ]
        recipients = {person["Address"].lower() for message in messages for person in message["To"]}
        if expected <= recipients:
            return messages
        time.sleep(0.5)
    missing = ", ".join(sorted(expected - recipients))
    print(f"   Mailpit chưa nhận đủ email RoomCompleted cho nhóm {group_code}. Thiếu: {missing}")
    raise ScriptError()


def main():
    step("1. Đăng nhập qua API Gateway (Auth Service phát JWT)")
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
    require_status(current_step, s, 409, b, "BR05")
    show("POST", "/api/courses/{FA26-EXE101}/rooms", s, b)

    step("4. QT02 – Sinh viên 02 (SE) và 06 (AI) vào phòng; đủ 3 người thì phòng tự KHÓA (BR08)")
    s, b = call("POST", f"/api/rooms/{rid}/join", S(2))
    require_status(current_step, s, 200, b)
    s, room = call("POST", f"/api/rooms/{rid}/join", S(6))
    require_status(current_step, s, 200, room)
    room_line(room)

    step("5. Sinh viên 08 (GD) không vào thẳng được phòng đã khóa")
    s, b = call("POST", f"/api/rooms/{rid}/join", S(8))
    require_status(current_step, s, 409, b, "ROOM_NOT_OPEN")
    show("POST", "/api/rooms/{id}/join", s, b)

    step("6. gRPC – Kiểm tra cơ cấu phòng qua Matching Service")
    s, comp = call("GET", f"/api/rooms/{rid}/composition", S(1))
    require_status(current_step, s, 200, comp)
    print(f"   satisfied={comp['satisfied']}")
    for v in comp["violations"]:
        print("   -", v)

    step("7. BR16 – Trưởng phòng thử hoàn tất khi chưa đủ cơ cấu")
    s, b = call("POST", f"/api/rooms/{rid}/complete", S(1))
    require_status(current_step, s, 409, b, "BR16")
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
    require_status(current_step, s, 403, b, "NOT_ROOM_LEADER")
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
    prior_message_ids = {message["ID"] for message in mailpit_messages()}
    s, grp = call("POST", f"/api/rooms/{rid}/complete", S(2))
    require_status(current_step, s, 201, grp)
    print(f"   Nhóm {grp['code']} ({grp['groupTypeName']})")
    for m in grp["members"]:
        print(f"   - {m['studentCode']} {m['fullName']} ({m['majorCode']}){'  ★ trưởng nhóm' if m['isLeader'] else ''}")

    step("13. BR18 – Thành viên không tự rời nhóm đã thành lập")
    s, b = call("POST", f"/api/rooms/{rid}/leave", S(6))
    require_status(current_step, s, 409, b, "BR18")
    show("POST", "/api/rooms/{id}/leave", s, b)

    step("14. Kafka → Noti Service → email (Mailpit)")
    messages = wait_for_room_completed_mail(grp["code"], prior_message_ids)
    print(f"   Mailpit đã nhận email thành lập nhóm {grp['code']} cho 4 thành viên:")
    for message in messages:
        recipients = ", ".join(person["Address"] for person in message["To"])
        print(f"   - tới {recipients}: {message['Subject']}")
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
