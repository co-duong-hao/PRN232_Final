"""Narrated demo of the main workflow through the gateway. Usage (fresh data: docker compose down -v; docker compose up -d): python docs/demo/demo.py .env"""
import json
import sys
import time
import urllib.error
import urllib.request

GW = "http://localhost:8080"
COURSE = "30000000-0000-0000-0000-000000000001"
sys.stdout.reconfigure(encoding="utf-8")
env = dict(l.strip().split("=", 1) for l in open(sys.argv[1], encoding="utf-8") if "=" in l and not l.lstrip().startswith("#"))
PASSWORD = env["SEED_DEFAULT_PASSWORD"]


def call(method, path, token=None, body=None):
    req = urllib.request.Request(GW + path, data=json.dumps(body).encode() if body is not None else None, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            raw = r.read()
            return r.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read()
        return e.code, json.loads(raw) if raw else None


def step(title):
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
    tokens[email] = b["accessToken"]
    return b


step("1. Đăng nhập qua API Gateway (Auth Service phát JWT)")
for n in [1, 2, 6, 8, 11]:
    u = login(f"student{n:02d}@exe.local")
    print(f"   {u['user']['fullName']:<14} {u['user']['email']:<22} role={u['user']['roles']}")
S = lambda n: tokens[f"student{n:02d}@exe.local"]

step("2. QT01 – Sinh viên 01 (SE) tạo phòng → thành trưởng phòng")
s, room = call("POST", f"/api/courses/{COURSE}/rooms", S(1))
show("POST", f"/api/courses/{{FA26-EXE101}}/rooms", s, room)
room_line(room)
rid = room["id"]

step("3. BR05 – Sinh viên 01 thử tạo phòng thứ hai trong cùng Course")
s, b = call("POST", f"/api/courses/{COURSE}/rooms", S(1))
show("POST", "/api/courses/{FA26-EXE101}/rooms", s, b)

step("4. QT02 – Sinh viên 02 (SE) và 06 (AI) vào phòng; đủ 3 người thì phòng tự KHÓA (BR08)")
call("POST", f"/api/rooms/{rid}/join", S(2))
s, room = call("POST", f"/api/rooms/{rid}/join", S(6))
room_line(room)

step("5. Sinh viên 08 (GD) không vào thẳng được phòng đã khóa")
s, b = call("POST", f"/api/rooms/{rid}/join", S(8))
show("POST", "/api/rooms/{id}/join", s, b)

step("6. gRPC – Kiểm tra cơ cấu phòng qua Matching Service")
s, comp = call("GET", f"/api/rooms/{rid}/composition", S(1))
print(f"   satisfied={comp['satisfied']}")
for v in comp["violations"]:
    print("   -", v)

step("7. BR16 – Trưởng phòng thử hoàn tất khi chưa đủ cơ cấu")
s, b = call("POST", f"/api/rooms/{rid}/complete", S(1))
show("POST", "/api/rooms/{id}/complete", s, b)

step("8. gRPC – Sinh viên 08 (GD) xem gợi ý phòng")
s, recs = call("GET", f"/api/courses/{COURSE}/rooms/recommendations?limit=3", S(8))
for r in recs:
    print(f"   {r['roomCode']} điểm {r['score']}: {' '.join(r['reasons'])}")

step("9. QT03 – Sinh viên 08 gửi đơn; trưởng phòng duyệt")
s, ap = call("POST", f"/api/rooms/{rid}/applies", S(8), {"message": "Mình phụ trách thiết kế UI/UX."})
print(f"   Đơn {ap['status']} – {ap['fullName']} ({ap['majorCode']}): {ap['message']}")
s, b = call("POST", f"/api/room-applies/{ap['id']}/approve", S(2))
show("POST", "/api/room-applies/{id}/approve  (sinh viên 02, không phải trưởng phòng)", s, b)
s, ap = call("POST", f"/api/room-applies/{ap['id']}/approve", S(1))
print(f"   Trưởng phòng duyệt → đơn {ap['status']}")
s, room = call("GET", f"/api/rooms/{rid}", S(1))
room_line(room)

step("10. QT05 – Chuyển quyền trưởng phòng cho Sinh viên 02")
s, room = call("PUT", f"/api/rooms/{rid}/leader", S(1), {"studentId": "20000000-0000-0000-0000-000000000002"})
room_line(room)

step("11. gRPC – Kiểm tra lại cơ cấu: 4 người, 3 ngành, SE×2")
s, comp = call("GET", f"/api/rooms/{rid}/composition", S(2))
print(f"   satisfied={comp['satisfied']}  violations={comp['violations']}")

step("12. QT06 – Trưởng phòng mới hoàn tất phòng → Nhóm chính thức")
s, grp = call("POST", f"/api/rooms/{rid}/complete", S(2))
print(f"   Nhóm {grp['code']} ({grp['groupTypeName']})")
for m in grp["members"]:
    print(f"   - {m['studentCode']} {m['fullName']} ({m['majorCode']}){'  ★ trưởng nhóm' if m['isLeader'] else ''}")

step("13. BR18 – Thành viên không tự rời nhóm đã thành lập")
s, b = call("POST", f"/api/rooms/{rid}/leave", S(6))
show("POST", "/api/rooms/{id}/leave", s, b)

step("14. Redis Streams → Noti Service → email (Mailpit)")
time.sleep(4)
with urllib.request.urlopen("http://localhost:8025/api/v1/messages?limit=100", timeout=10) as r:
    mails = json.loads(r.read())
print(f"   Mailpit đã nhận {mails['total']} email. Mới nhất:")
for m in mails["messages"][:6]:
    print(f"   - tới {m['To'][0]['Address']:<22} {m['Subject']}")
print("\nXem tất cả email: http://localhost:8025")
