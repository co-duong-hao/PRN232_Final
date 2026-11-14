"""End-to-end smoke test through the gateway. Usage (system running via docker compose, fresh data): python tests/e2e/e2e_smoke.py .env"""
import json
import sys
import time
import urllib.error
import urllib.request

GW = "http://localhost:8080"
COURSE = "30000000-0000-0000-0000-000000000001"
sys.stdout.reconfigure(encoding="utf-8")

env = dict(
    line.strip().split("=", 1)
    for line in open(sys.argv[1], encoding="utf-8")
    if "=" in line and not line.lstrip().startswith("#")
)
PASSWORD = env["SEED_DEFAULT_PASSWORD"]

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
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw) if raw else None
        except ValueError:
            return e.code, raw.decode(errors="replace")[:200]


def check(name, status, expected, body=None, code=None):
    ok = status == expected and (code is None or (isinstance(body, dict) and body.get("code") == code))
    results.append(ok)
    extra = ""
    if not ok:
        extra = f"  -> got {status} {json.dumps(body, ensure_ascii=False)[:300] if body is not None else ''}"
    print(f"[{'OK ' if ok else 'BAD'}] {name}: {status}{extra}")
    return body


def login(email):
    s, b = call("POST", "/api/auth/login", body={"email": email, "password": PASSWORD})
    check(f"login {email}", s, 200, b)
    return b["accessToken"] if s == 200 else None


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

# Clean state: student01 may already own a room from a previous run.
s, b = call("GET", "/api/me/courses", t[1])
check("student01 my courses", s, 200, b)

# QT01: SE student01 creates a room
s, room = call("POST", f"/api/courses/{COURSE}/rooms", t[1])
check("QT01 create room", s, 201, room)
rid = room["id"]
print("    room code:", room["code"])

s, b = call("POST", f"/api/courses/{COURSE}/rooms", t[1])
check("BR05 second room for same student", s, 409, b, "BR05")

# QT02: SE student02 and AI student06 join -> locked at 3
s, b = call("POST", f"/api/rooms/{rid}/join", t[2])
check("QT02 student02 joins", s, 200, b)
s, b = call("POST", f"/api/rooms/{rid}/join", t[6])
check("QT02 student06 joins -> locked", s, 200, b)
print("    status after 3 members:", b.get("status") if isinstance(b, dict) else b)

s, b = call("POST", f"/api/rooms/{rid}/join", t[8])
check("locked room rejects direct join", s, 409, b, "ROOM_NOT_OPEN")

# gRPC via REST: composition (3 members, 2 majors -> not satisfied)
s, comp = call("GET", f"/api/rooms/{rid}/composition", t[1])
check("composition via gRPC", s, 200, comp)
print("    violations:", comp.get("violations") if isinstance(comp, dict) else comp)

s, b = call("POST", f"/api/rooms/{rid}/complete", t[1])
check("BR16 complete when composition not satisfied", s, 409, b, "BR16")

# QT03: GD student08 applies, leader approves
s, ap = call("POST", f"/api/rooms/{rid}/applies", t[8], {"message": "Mình làm thiết kế."})
check("QT03 student08 applies", s, 201, ap)
s, b = call("POST", f"/api/room-applies/{ap['id']}/approve", t[2])
check("BR09 non-leader cannot approve", s, 403, b, "NOT_ROOM_LEADER")
s, b = call("POST", f"/api/room-applies/{ap['id']}/approve", t[1])
check("QT03 leader approves", s, 200, b)

# Recommendations (gRPC) for a student without room
s, b = call("GET", f"/api/courses/{COURSE}/rooms/recommendations?limit=3", t[11])
check("recommendations via gRPC", s, 200, b)

# QT05: change leader then QT04 leave as former leader
s, b = call("PUT", f"/api/rooms/{rid}/leader", t[1], {"studentId": "20000000-0000-0000-0000-000000000002"})
check("QT05 change leader to student02", s, 200, b)

# QT06: now 4 members SE,SE,AI,GD -> satisfied; complete by new leader
s, comp = call("GET", f"/api/rooms/{rid}/composition", t[2])
check("composition satisfied", s, 200, comp)
print("    satisfied:", comp.get("satisfied") if isinstance(comp, dict) else comp)
s, grp = call("POST", f"/api/rooms/{rid}/complete", t[2])
check("QT06 complete room -> group", s, 201, grp)
if isinstance(grp, dict):
    print("    group code:", grp.get("code"))

s, b = call("POST", f"/api/rooms/{rid}/leave", t[6])
check("BR18 cannot leave completed room", s, 409, b, "BR18")

# Search / filter / paging on rooms
s, b = call("GET", f"/api/courses/{COURSE}/rooms?status=Completed&sortBy=code&page=1&pageSize=5", t[9])
check("list rooms filtered and paged", s, 200, b)

# Notifications reach Mailpit through Redis Streams
time.sleep(4)
with urllib.request.urlopen("http://localhost:8025/api/v1/messages?limit=50", timeout=10) as r:
    mails = json.loads(r.read())
subjects = [m["Subject"] for m in mails.get("messages", [])]
print(f"    mailpit has {mails.get('total')} messages; latest:")
for subj in subjects[:8]:
    print("     -", subj)
results.append(any("Nhóm" in x for x in subjects))
print(f"[{'OK ' if results[-1] else 'BAD'}] RoomCompleted email delivered")

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
