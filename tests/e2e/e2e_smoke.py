"""Run the demo smoke test for EXE101, or use --workflows for EXE201.

Usage: python tests/e2e/e2e_smoke.py .env [--workflows]
Use this only with a dedicated seeded Compose stack. Exit codes: 0 passed,
1 failed, 2 seed already used.
"""
import json
import os
import traceback
import sys
import time
import urllib.error
import urllib.request

GW = "http://localhost:8080"
COURSE = "30000000-0000-0000-0000-000000000001"
WORKFLOW_COURSE = "30000000-0000-0000-0000-000000000002"
sys.stdout.reconfigure(encoding="utf-8")

PASSWORD = None

results = []


def call(method, path, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(GW + path, data=data, method=method)
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


def check(name, status, expected, body=None, code=None, *, matches=True):
    ok = matches and status == expected and (code is None or (isinstance(body, dict) and body.get("code") == code))
    results.append(ok)
    print(f"[{'OK ' if ok else 'BAD'}] {name}: {status}")
    if not ok:
        details = body if isinstance(body, dict) else {}
        print(f"   Thất bại tại {name}: HTTP {status}, code={details.get('code', 'không có')}, title={details.get('title', 'không có')}")
        if status == expected and not matches:
            print("   Nội dung phản hồi không khớp kết quả nghiệp vụ mong đợi.")
        raise ScriptError()
    return body


def login(email):
    s, b = call("POST", "/api/auth/login", body={"email": email, "password": PASSWORD})
    check(f"login {email}", s, 200, b)
    return b["accessToken"]


class ScriptError(Exception):
    pass


def require_status(step_name, status, expected, body):
    if status != expected:
        details = body if isinstance(body, dict) else {}
        print(f"   Thất bại tại {step_name}: HTTP {status}, code={details.get('code', 'không có')}, title={details.get('title', 'không có')}")
        raise ScriptError()


def preflight(course_id, course_code):
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
    status, body = call("GET", f"/api/courses/{course_id}", token)
    require_status("kiểm tra Course mẫu", status, 200, body)
    if not isinstance(body, dict) or body.get("code") != course_code:
        print(f"   Không tìm thấy dữ liệu mẫu cho {course_code}.")
        raise ScriptError()
    if body.get("status") != "Forming":
        print(f"   {course_code} đang ở trạng thái {body.get('status')}. Script cần dữ liệu mẫu ban đầu.")
        return False
    status, body = call("GET", f"/api/courses/{course_id}/rooms?pageSize=1", token)
    require_status("kiểm tra dữ liệu mẫu", status, 200, body)
    count = body.get("totalItems") if isinstance(body, dict) else None
    if type(count) is not int or count < 0:
        print("   Danh sách phòng trả totalItems không hợp lệ.")
        raise ScriptError()
    if count > 0:
        print(f"Dữ liệu đã được dùng ở lần chạy trước (Course {course_code} đang có {count} phòng). Script cần dữ liệu mẫu ban đầu. Reset bằng: docker compose down -v  rồi  docker compose up -d  (chờ 30–60 giây), sau đó chạy lại.")
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
    # Gateway auth
    s, b = call("GET", f"/api/courses/{COURSE}/rooms")
    check("gateway rejects anonymous call", s, 401, b)
    s, b = call("POST", "/api/auth/login", body={"email": "student01@exe.local", "password": "wrong-password"})
    check("wrong password -> INVALID_CREDENTIALS", s, 401, b, "INVALID_CREDENTIALS")

    admin = login("admin@exe.local")
    t = {n: login(f"student{n:02d}@exe.local") for n in [1, 2, 6, 8, 9, 11]}

    s, b = call("GET", "/api/users?pageSize=5&sortBy=email", admin)
    check("admin lists users (paged)", s, 200, b)
    s, b = call("GET", "/api/users", t[1])
    check("student cannot list users", s, 403, b)

    # Verify the seeded course is available to the student.
    s, b = call("GET", "/api/me/courses", t[1])
    check("student01 my courses", s, 200, b)

    # QT01: SE student01 creates a room
    s, room = call("POST", f"/api/courses/{COURSE}/rooms", t[1])
    check("QT01 create room", s, 201, room,
          matches=isinstance(room, dict) and room.get("status") == "Open" and room.get("memberCount") == 1)
    rid = room["id"]
    print("    room code:", room["code"])

    s, b = call("POST", f"/api/courses/{COURSE}/rooms", t[1])
    check("BR05 second room for same student", s, 409, b, "BR05")

    # QT02: SE student02 and AI student06 join -> locked at 3
    s, b = call("POST", f"/api/rooms/{rid}/join", t[2])
    check("QT02 student02 joins", s, 200, b)
    s, b = call("POST", f"/api/rooms/{rid}/join", t[6])
    check("QT02 student06 joins -> locked", s, 200, b,
          matches=isinstance(b, dict) and b.get("status") == "Locked" and b.get("memberCount") == 3)
    print("    status after 3 members:", b.get("status") if isinstance(b, dict) else b)

    s, b = call("POST", f"/api/rooms/{rid}/join", t[8])
    check("locked room rejects direct join", s, 409, b, "ROOM_NOT_OPEN")

    # gRPC via REST: composition (3 members, 2 majors -> not satisfied)
    s, comp = call("GET", f"/api/rooms/{rid}/composition", t[1])
    check("composition via gRPC", s, 200, comp,
          matches=isinstance(comp, dict) and comp.get("satisfied") is False and bool(comp.get("violations")))
    print("    violations:", comp.get("violations") if isinstance(comp, dict) else comp)

    s, b = call("POST", f"/api/rooms/{rid}/complete", t[1])
    check("BR16 complete when composition not satisfied", s, 409, b, "BR16")

    # QT03: GD student08 applies, leader approves
    s, ap = call("POST", f"/api/rooms/{rid}/applies", t[8], {"message": "Mình làm thiết kế."})
    check("QT03 student08 applies", s, 201, ap,
          matches=isinstance(ap, dict) and ap.get("status") == "Pending" and ap.get("roomId") == rid)
    s, b = call("POST", f"/api/room-applies/{ap['id']}/approve", t[2])
    check("BR09 non-leader cannot approve", s, 403, b, "NOT_ROOM_LEADER")
    s, b = call("POST", f"/api/room-applies/{ap['id']}/approve", t[1])
    check("QT03 leader approves", s, 200, b,
          matches=isinstance(b, dict) and b.get("status") == "Approved" and b.get("roomId") == rid)

    # Recommendations (gRPC) for a student without room
    s, b = call("GET", f"/api/courses/{COURSE}/rooms/recommendations?limit=3", t[11])
    check("recommendations via gRPC", s, 200, b)

    # QT05: transfer leadership to student02.
    student02_id = "20000000-0000-0000-0000-000000000002"
    s, b = call("PUT", f"/api/rooms/{rid}/leader", t[1], {"studentId": student02_id})
    check("QT05 change leader to student02", s, 200, b,
          matches=isinstance(b, dict) and b.get("leaderId") == student02_id)

    # QT06: now 4 members SE,SE,AI,GD -> satisfied; complete by new leader
    s, comp = call("GET", f"/api/rooms/{rid}/composition", t[2])
    check("composition satisfied", s, 200, comp,
          matches=isinstance(comp, dict) and comp.get("satisfied") is True and comp.get("violations") == [])
    print("    satisfied:", comp.get("satisfied") if isinstance(comp, dict) else comp)
    prior_message_ids = {message["ID"] for message in mailpit_messages()}
    s, grp = call("POST", f"/api/rooms/{rid}/complete", t[2])
    members = grp.get("members") if isinstance(grp, dict) else None
    leaders = []
    if isinstance(members, list):
        leaders = [member.get("studentId") for member in members
                   if isinstance(member, dict) and member.get("isLeader") is True]
    check("QT06 complete room -> group", s, 201, grp,
          matches=isinstance(grp, dict) and grp.get("roomId") == rid and bool(grp.get("code"))
          and isinstance(members, list) and len(members) == 4 and leaders == [student02_id])
    print("    group code:", grp["code"])

    s, b = call("POST", f"/api/rooms/{rid}/leave", t[6])
    check("BR18 cannot leave completed room", s, 409, b, "BR18")

    # Search / filter / paging on rooms
    s, b = call("GET", f"/api/courses/{COURSE}/rooms?status=Completed&sortBy=code&page=1&pageSize=5", t[9])
    items = b.get("items") if isinstance(b, dict) else None
    check("list rooms filtered and paged", s, 200, b,
          matches=isinstance(items, list) and b.get("page") == 1 and b.get("pageSize") == 5
          and any(isinstance(item, dict) and item.get("id") == rid
                  and item.get("status") == "Completed" for item in items))

    # Notifications reach Mailpit through Kafka
    wait_for_room_completed_mail(grp["code"], prior_message_ids)
    results.append(True)
    print(f"[OK ] RoomCompleted email delivered for {grp['code']}")

    print(f"\n{sum(results)}/{len(results)} checks passed")
    return 0 if all(results) else 1


def room_leave_workflow(rooms_path, tokens):
    leader, member, third = (tokens[number] for number in (1, 2, 6))
    status, room = call("POST", rooms_path, leader)
    check("QT04 create room fixture", status, 201, room)
    room_path = f"/api/rooms/{room['id']}"
    status, body = call("POST", room_path + "/join", member)
    check("QT04 second student joins", status, 200, body)
    status, body = call("POST", room_path + "/join", third)
    check("QT04 room locks at three", status, 200, body,
          matches=isinstance(body, dict) and body.get("status") == "Locked" and body.get("memberCount") == 3)

    status, body = call("POST", room_path + "/leave", leader)
    check("BR13 leader must transfer before leaving", status, 409, body, "BR13")
    status, body = call("POST", room_path + "/leave", third)
    check("QT04 member leaves locked room", status, 204, body)
    status, body = call("GET", room_path, leader)
    check("QT04 room reopens below lock threshold", status, 200, body,
          matches=isinstance(body, dict) and body.get("status") == "Open" and body.get("memberCount") == 2)
    status, body = call("POST", room_path + "/leave", third)
    check("QT04 removed student cannot leave twice", status, 409, body, "NOT_A_MEMBER")

    status, body = call("POST", room_path + "/leave", member)
    check("QT04 second member leaves", status, 204, body)
    status, body = call("POST", room_path + "/leave", leader)
    check("QT04 last member leaves", status, 204, body)
    status, page = call("GET", rooms_path, leader)
    check("QT04 empty room is no longer visible", status, 200, page,
          matches=isinstance(page, dict) and page.get("totalItems") == 0)


def workflows():
    rooms_path = f"/api/courses/{WORKFLOW_COURSE}/rooms"
    tokens = {number: login(f"student{number:02d}@exe.local") for number in (1, 2, 6)}
    room_leave_workflow(rooms_path, tokens)
    print(f"\n{sum(results)}/{len(results)} workflow checks passed")
    return 0


if __name__ == "__main__":
    try:
        args = sys.argv[1:]
        if len(args) not in (1, 2) or not os.path.isfile(args[0]) or args[1:] not in ([], ["--workflows"]):
            print("Cách dùng: python tests/e2e/e2e_smoke.py .env [--workflows]")
            sys.exit(1)
        with open(args[0], encoding="utf-8") as env_file:
            env = dict(line.strip().split("=", 1) for line in env_file
                       if "=" in line and not line.lstrip().startswith("#"))
        PASSWORD = env["SEED_DEFAULT_PASSWORD"]
        extended = args[1:] == ["--workflows"]
        course_id, course_code = (WORKFLOW_COURSE, "FA26-EXE201") if extended else (COURSE, "FA26-EXE101")
        if not preflight(course_id, course_code):
            sys.exit(2)
        sys.exit(workflows() if extended else main())
    except ScriptError:
        sys.exit(1)
    except Exception as exc:
        print(f"Không thể tiếp tục script: {exc}")
        if os.environ.get("DEMO_DEBUG") == "1":
            traceback.print_exc()
        sys.exit(1)
