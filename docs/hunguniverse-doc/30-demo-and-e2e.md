# Diễn tập demo và E2E

Tài liệu tham chiếu cho PRN232 Final v0.4 tại commit 2e3789f.

[Mục lục bộ tài liệu](01-architecture.md)

## Cách hoạt động

Dữ liệu demo tiêu biểu đi từ phòng chưa có thành viên đến nhóm chính thức và email. Hai kịch bản dùng cùng dữ liệu mẫu nên cần lưu ý trạng thái đã thay đổi giữa các lần chạy.

Các script gọi API qua Gateway. Chúng có thể minh họa những nhánh lỗi mà giao diện ẩn nút thao tác, như cố duyệt đơn bằng người không phải trưởng phòng.

Luồng mới v0.4 có thể được minh họa bổ sung qua GPA, vai trò và hai Course. Dùng bảng kết quả E2E và ảnh Mailpit đúng với lần chạy đang trình bày.

## Cách kiểm tra

1. Chạy `python tests/e2e/e2e_smoke.py .env` trên dữ liệu thử mới và kiểm tra mã thoát.
2. Chạy demo thủ công với Course thử và ghi mã phòng, mã nhóm cùng người nhận email để đối chiếu.

## Đối chiếu mã nguồn

Các trích đoạn dưới đây hỗ trợ tra cứu. Đường dẫn mở phần tương ứng trong repo.

### e2e_smoke.py

Kịch bản kiểm tra tự động qua Gateway và Mailpit.

[tests/e2e/e2e_smoke.py dòng 71–188](../../tests/e2e/e2e_smoke.py#L71-L188)

~~~python
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

    # Notifications reach Mailpit through Kafka
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
    return 0 if all(results) else 1


~~~

### demo.py

Kịch bản diễn tập tuần tự theo luồng nghiệp vụ.

[docs/demo/demo.py dòng 100–194](../../docs/demo/demo.py#L100-L194)

~~~python
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
    require_status(current_step, s, 409, b)
    show("POST", "/api/courses/{FA26-EXE101}/rooms", s, b)

    step("4. QT02 – Sinh viên 02 (SE) và 06 (AI) vào phòng; đủ 3 người thì phòng tự KHÓA (BR08)")
    s, b = call("POST", f"/api/rooms/{rid}/join", S(2))
    require_status(current_step, s, 200, b)
    s, room = call("POST", f"/api/rooms/{rid}/join", S(6))
    require_status(current_step, s, 200, room)
    room_line(room)

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


~~~
