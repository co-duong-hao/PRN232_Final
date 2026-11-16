"""Exercise the complete recruitment and email workflow on a dedicated seeded Compose stack."""
import argparse
import dataclasses
import json
import os
from pathlib import Path
import sys
import time
import unittest
import urllib.error
import urllib.parse
import urllib.request

EXE101 = "30000000-0000-0000-0000-000000000001"
EXE201 = "30000000-0000-0000-0000-000000000002"


@dataclasses.dataclass(frozen=True)
class Response:
    status: int
    body: object
    headers: object


class LocalHttp:
    def __init__(self, origin):
        parsed = urllib.parse.urlsplit(origin)
        if (parsed.scheme != "http" or parsed.hostname not in {"localhost", "127.0.0.1", "::1"}
                or parsed.username or parsed.password or parsed.path.strip("/")
                or parsed.query or parsed.fragment):
            raise ValueError("Use an HTTP origin bound to localhost for the isolated test stack.")
        self.origin = origin.rstrip("/")
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def request(self, method, path, token=None, body=None):
        headers = {"Accept": "application/json"}
        data = None
        if body is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        if token is not None:
            headers["Authorization"] = f"Bearer {token}"
        request = urllib.request.Request(self.origin + path, data=data, method=method, headers=headers)
        try:
            with self.opener.open(request, timeout=15) as response:
                return Response(response.status, self.decode(response.read()), response.headers)
        except urllib.error.HTTPError as error:
            with error:
                return Response(error.code, self.decode(error.read()), error.headers)

    @staticmethod
    def decode(raw):
        if not raw:
            return None
        try:
            return json.loads(raw)
        except (UnicodeError, ValueError):
            return raw.decode("utf-8", errors="replace")


def with_query(path, **query):
    return f"{path}?{urllib.parse.urlencode(query, doseq=True)}"


def student_email(number):
    return f"student{number:02d}@exe.local"


class Inbox:
    def __init__(self, http, timeout):
        self.http = http
        self.timeout = timeout

    def summaries(self):
        response = self.http.request("GET", "/api/v1/messages?limit=100")
        if response.status != 200:
            raise AssertionError(f"Mailpit inbox returned HTTP {response.status}")
        return response.body["messages"] or []

    def snapshot(self):
        return {message["ID"] for message in self.summaries()}

    def wait_for(self, subject, students, baseline, *, fragments=()):
        expected = {student_email(number) for number in students}
        deadline = time.monotonic() + self.timeout
        actual = []
        while time.monotonic() < deadline:
            matches = [
                message for message in self.summaries()
                if message["ID"] not in baseline and message["Subject"] == subject
            ]
            actual = [
                recipient["Address"].lower()
                for message in matches for recipient in message["To"]
            ]
            extras = set(actual) - expected
            if extras or len(actual) > len(set(actual)):
                raise AssertionError(f"Unexpected or repeated recipients for {subject!r}: {sorted(actual)}")
            if set(actual) == expected:
                for match in matches:
                    route = "/api/v1/message/" + urllib.parse.quote(match["ID"], safe="")
                    detail = self.http.request("GET", route)
                    if detail.status != 200:
                        raise AssertionError(f"Mailpit message detail returned HTTP {detail.status}")
                    number = int(match["To"][0]["Address"][7:9])
                    text = detail.body.get("Text") or ""
                    for fragment in (f"Chào Sinh viên {number:02d}", *fragments):
                        if fragment not in text:
                            raise AssertionError(f"Missing {fragment!r} in {subject!r} for student {number}")
                return
            time.sleep(0.5)
        raise AssertionError(f"Timed out waiting for {subject!r}. Expected {sorted(expected)}, got {sorted(actual)}.")


class RecruitmentScenario(unittest.TestCase):
    def __init__(self, gateway, inbox, password):
        super().__init__("test_recruitment_isolation_approval_and_email_delivery")
        self.gateway = gateway
        self.inbox = inbox
        self.password = password

    def request(self, method, path, *, token=None, body=None, status=200, code=None):
        response = self.gateway.request(method, path, token, body)
        detail = response.body if isinstance(response.body, dict) else {}
        self.assertEqual(status, response.status,
                         f"{method} {path}: HTTP {response.status}, code={detail.get('code')}, title={detail.get('title')}")
        if code is not None:
            self.assertEqual(code, detail.get("code"), f"{method} {path}")
        return response

    def login(self, email):
        body = self.request("POST", "/api/auth/login",
                            body={"email": email, "password": self.password}).body
        self.assertTrue(body.get("accessToken"), f"Access token missing for {email}")
        return body["accessToken"]

    def check_demo_state(self, token):
        self.request("GET", "/health")
        # Inspect with an administrator so cancelled or completed historical rooms also block mutation.
        admin = self.login("admin@exe.local")
        for course, code in ((EXE101, "FA26-EXE101"), (EXE201, "FA26-EXE201")):
            self.assertEqual("Forming", self.request("GET", f"/api/courses/{course}", token=token).body["status"])
            rooms = self.request("GET", with_query(f"/api/courses/{course}/rooms", pageSize=1), token=admin).body
            self.assertEqual(0, rooms["totalItems"], f"{code} already has rooms. Start a fresh isolated stack.")
        return admin

    def create_open_room(self, course, leader, roles):
        profile = {
            "name": "Campus Design Lab",
            "projectName": "Campus Accessibility",
            "ideaDescription": "Bản đồ lối đi trong trường",
            "requiredGpa": 3.1,
            "targetGrade": 8.5,
            "neededRoleIds": [roles["UIUX"], roles["BE"]],
        }
        response = self.request("POST", f"/api/courses/{course}/rooms", token=leader,
                                body=profile, status=201)
        room = response.body
        self.assertTrue(response.headers["Location"].endswith(f"/api/rooms/{room['id']}"))
        self.assertEqual("Open", room["status"])
        self.assertEqual(1, room["memberCount"])
        self.assertEqual(profile["ideaDescription"], room["ideaDescription"])
        self.assertEqual({"BE", "UIUX"}, {role["code"] for role in room["neededRoles"]})
        return room

    def application(self, room, token, message):
        response = self.request("POST", f"/api/rooms/{room['id']}/applies", token=token,
                                body={"message": message}, status=201)
        result = response.body
        self.assertTrue(response.headers["Location"].endswith(f"/api/room-applies/{result['id']}"))
        self.assertEqual(room["code"], result["roomCode"])
        self.assertEqual("Pending", result["status"])
        self.assertEqual(message, result["message"])
        self.assertIsNone(result["decidedAt"])
        return result

    def room_stats(self, course, staff, *, cache=None):
        response = self.request("GET", f"/api/courses/{course}/stats", token=staff)
        if cache is not None:
            self.assertEqual(cache, response.headers.get("X-Cache"))
        return response.body

    def personal_applications(self, course, token, status):
        path = with_query("/api/me/applies", courseId=course, status=status)
        return self.request("GET", path, token=token).body["items"]

    def test_recruitment_isolation_approval_and_email_delivery(self):
        tokens = {number: self.login(student_email(number)) for number in (1, 2, 3, 6, 8, 9, 11)}
        staff = self.check_demo_state(tokens[1])
        roles_page = self.request("GET", with_query("/api/team-roles", pageSize=100), token=tokens[1]).body
        roles = {role["code"]: role["id"] for role in roles_page["items"]}

        profile = self.request("PUT", "/api/me/student/profile", token=tokens[8],
                               body={"gpa": 3.05, "roleIds": [roles["UIUX"], roles["FE"]]}).body
        self.assertEqual(3.05, profile["gpa"])
        self.assertEqual({"UIUX", "FE"}, {role["code"] for role in profile["roles"]})
        applicant_id = profile["id"]
        unrelated = self.request("GET", "/api/me/student", token=tokens[9]).body
        self.assertNotEqual(applicant_id, unrelated["id"])
        self.assertEqual(2.4, unrelated["gpa"])

        # Every later step depends on the objects from the previous one. Let a failed setup
        # stop this journey before it can submit more mutations to the stack.
        room = self.create_open_room(EXE201, tokens[1], roles)
        room_path = f"/api/rooms/{room['id']}"
        self.request("PUT", room_path + "/profile", token=tokens[8],
                     body={"name": "Unauthorized edit"}, status=403, code="NOT_ROOM_LEADER")
        self.assertEqual("Campus Design Lab", self.request("GET", room_path, token=tokens[8]).body["name"])
        self.request("POST", room_path + "/join", token=tokens[8], status=409, code="BR19")

        in_search = with_query(f"/api/courses/{EXE201}/rooms", q="Accessibility", roleIds=[roles["UIUX"]],
                               gpa=3.1, page=1, pageSize=1)
        below_search = with_query(f"/api/courses/{EXE201}/rooms", q="Accessibility", gpa=3.09)
        found = self.request("GET", in_search, token=tokens[8]).body
        self.assertEqual([room["id"]], [item["id"] for item in found["items"]])
        self.assertEqual(0, self.request("GET", below_search, token=tokens[8]).body["totalItems"])

        self.request("POST", room_path + "/join", token=tokens[2])
        initial_mail = self.inbox.snapshot()
        locked = self.request("POST", room_path + "/join", token=tokens[6]).body
        self.assertEqual(("Locked", 3), (locked["status"], locked["memberCount"]))
        self.inbox.wait_for(f"[EXE] Phòng {room['code']} đã khóa", (1, 2, 6), initial_mail,
                            fragments=("Phòng đủ 3 thành viên",))

        other = self.create_open_room(EXE101, tokens[1], roles)
        other_path = f"/api/rooms/{other['id']}"
        self.request("POST", other_path + "/join", token=tokens[2])
        self.request("POST", other_path + "/join", token=tokens[6])
        self.application(other, tokens[8], "Hồ sơ được xử lý độc lập trong EXE101")

        baseline = self.inbox.snapshot()
        text = "Em muốn làm bản đồ lối đi cho sinh viên"
        apply = self.application(room, tokens[8], text)
        self.inbox.wait_for(f"[EXE] Đơn xin vào phòng {room['code']}", (1,), baseline,
                            fragments=("Sinh viên 08", text))
        self.request("POST", room_path + "/applies", token=tokens[8], body={"message": "Lặp lại"},
                     status=409, code="APPLY_ALREADY_PENDING")
        self.request("GET", room_path + "/applies", token=tokens[2], status=403, code="NOT_ROOM_LEADER")

        inbox = self.request("GET", with_query(room_path + "/applies", status="Pending"), token=tokens[1]).body
        self.assertEqual(1, inbox["totalItems"])
        summary = inbox["items"][0]
        self.assertEqual(apply["id"], summary["id"])
        self.assertEqual(applicant_id, summary["studentId"])
        self.assertEqual(3.05, summary["gpa"])
        self.assertEqual({"FE", "UIUX"}, {role["code"] for role in summary["roles"]})

        rejected = self.application(room, tokens[9], "Đơn được dùng để kiểm tra từ chối")
        baseline = self.inbox.snapshot()
        reject_path = f"/api/room-applies/{rejected['id']}/reject"
        self.assertEqual("Rejected", self.request("POST", reject_path, token=tokens[1]).body["status"])
        self.inbox.wait_for(f"[EXE] Đơn vào phòng {room['code']}: bị từ chối", (9,), baseline,
                            fragments=("Sinh viên 01", "từ chối đơn của bạn"))
        self.assertEqual([rejected["id"]], [item["id"] for item in
                                          self.personal_applications(EXE201, tokens[9], "Rejected")])

        waiting = self.application(room, tokens[11], "Đơn chờ để kiểm tra đóng phòng")
        before = self.room_stats(EXE201, staff)
        self.assertEqual(3, before["studentsInRoom"])
        self.assertEqual(0, before["groupCount"])
        self.assertEqual(before, self.room_stats(EXE201, staff, cache="HIT"))
        other_before = self.room_stats(EXE101, staff)
        baseline = self.inbox.snapshot()
        approve_path = f"/api/room-applies/{apply['id']}/approve"
        self.request("POST", approve_path, token=tokens[2], status=403, code="NOT_ROOM_LEADER")
        approved = self.request("POST", approve_path, token=tokens[1]).body
        self.assertEqual("Approved", approved["status"])
        self.assertTrue(approved["decidedAt"])

        after = self.room_stats(EXE201, staff, cache="MISS")
        self.assertEqual(4, after["studentsInRoom"])
        self.assertEqual(other_before, self.room_stats(EXE101, staff, cache="HIT"))
        self.inbox.wait_for(f"[EXE] Đơn vào phòng {room['code']}: được chấp nhận", (8,), baseline,
                            fragments=("Sinh viên 01", "chấp nhận đơn của bạn"))
        self.inbox.wait_for(f"[EXE] Sinh viên 08 đã vào phòng {room['code']}", (1, 2, 6), baseline,
                            fragments=("Phòng hiện có 4 thành viên",))
        self.request("POST", approve_path, token=tokens[1], status=409, code="APPLY_NOT_PENDING")
        self.assertEqual([apply["id"]], [item["id"] for item in
                                       self.personal_applications(EXE201, tokens[8], "Approved")])
        other_pending = self.personal_applications(EXE101, tokens[8], "Pending")
        self.assertEqual([other["id"]], [item["roomId"] for item in other_pending])

        before_completion = self.inbox.snapshot()
        detail = self.request("GET", room_path, token=tokens[8]).body
        second = next(member for member in detail["members"] if member["studentCode"] == "SE180002")
        self.request("PUT", room_path + "/leader", token=tokens[1], body={"studentId": second["studentId"]})
        self.inbox.wait_for(f"[EXE] Phòng {room['code']} có trưởng phòng mới", (1, 2, 6, 8),
                            before_completion, fragments=("Trưởng phòng mới là Sinh viên 02",))
        self.request("POST", room_path + "/complete", token=tokens[1], status=403, code="NOT_ROOM_LEADER")
        analysis = self.request("GET", room_path + "/composition", token=tokens[2]).body
        self.assertTrue(analysis["satisfied"], analysis.get("violations"))
        self.assertEqual((4, 3), (analysis["memberCount"], analysis["distinctMajorCount"]))

        group = self.request("POST", room_path + "/complete", token=tokens[2], status=201).body
        self.assertEqual("Campus Design Lab", group["name"])
        self.assertEqual(room["id"], group["roomId"])
        self.assertEqual(4, len(group["members"]))
        self.assertEqual([second["studentId"]], [m["studentId"] for m in group["members"] if m["isLeader"]])
        stored_group = self.request("GET", f"/api/groups/{group['id']}", token=tokens[8]).body
        self.assertEqual(group["code"], stored_group["code"])
        self.assertEqual(group["roomId"], stored_group["roomId"])
        self.assertCountEqual(group["members"], stored_group["members"])
        self.inbox.wait_for(f"[EXE] Nhóm {group['code']} đã được thành lập", (1, 2, 6, 8), before_completion,
                            fragments=(room["code"], group["code"]))
        self.assertEqual([waiting["id"]], [item["id"] for item in
                                          self.personal_applications(EXE201, tokens[11], "Cancelled")])
        final_stats = self.room_stats(EXE201, staff)
        self.assertEqual((1, 4), (final_stats["groupCount"], final_stats["studentsInGroup"]))


def password_from(path):
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        key, separator, value = line.strip().partition("=")
        if separator and key == "SEED_DEFAULT_PASSWORD" and value:
            return value.strip().strip('"').strip("'")
    raise ValueError(f"SEED_DEFAULT_PASSWORD is missing from {path}")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gateway", required=True, help="HTTP origin for the isolated Gateway")
    parser.add_argument("--mailpit", required=True, help="HTTP origin for the isolated Mailpit")
    parser.add_argument("--env-file", type=Path, help="Compose env file containing SEED_DEFAULT_PASSWORD")
    parser.add_argument("--mail-timeout", type=float, default=25, help="Seconds to wait for each set of emails")
    parser.add_argument("--confirm-disposable-stack", action="store_true",
                        help="Confirm that seeded EXE101 and EXE201 may be changed by this run")
    args = parser.parse_args(argv)
    if not args.confirm_disposable_stack:
        parser.error("--confirm-disposable-stack is required because the workflow modifies both courses")
    if args.mail_timeout <= 0:
        parser.error("--mail-timeout must be positive")
    try:
        password = password_from(args.env_file) if args.env_file else os.environ.get("SEED_DEFAULT_PASSWORD")
        if not password:
            raise ValueError("Set SEED_DEFAULT_PASSWORD or pass --env-file")
        gateway = LocalHttp(args.gateway)
        inbox = Inbox(LocalHttp(args.mailpit), args.mail_timeout)
    except (OSError, ValueError) as error:
        parser.error(str(error))
    test = RecruitmentScenario(gateway, inbox, password)
    suite = unittest.TestSuite([test])
    return 0 if unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(main())
