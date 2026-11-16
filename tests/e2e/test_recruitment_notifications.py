"""Offline tests for the Mailpit assertions and input handling used by the E2E scenario."""
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import Mock, patch
from urllib.error import HTTPError

from recruitment_notifications import Inbox, LocalHttp, Response, password_from, with_query


def summary(identifier, subject, *students):
    return {
        "ID": identifier,
        "Subject": subject,
        "To": [{"Address": f"student{student:02d}@exe.local"} for student in students],
    }


class InboxTests(unittest.TestCase):
    def setUp(self):
        self.http = Mock()
        self.inbox = Inbox(self.http, timeout=10)

    def fake_polls(self, *message_lists, text=None):
        polls = iter(message_lists)

        def route(_, path):
            if path == "/api/v1/messages?limit=100":
                return Response(200, {"messages": next(polls)}, {})
            return Response(200, {"Text": text or ""}, {})

        self.http.request.side_effect = route

    def test_snapshot_contains_identifiers_only(self):
        self.fake_polls([summary("one", "A", 1), summary("two", "B", 2)])

        self.assertEqual({"one", "two"}, self.inbox.snapshot())
        self.http.request.assert_called_once_with("GET", "/api/v1/messages?limit=100")

    def test_null_message_list_is_empty(self):
        self.fake_polls(None)

        self.assertEqual(set(), self.inbox.snapshot())

    def test_wait_ignores_existing_messages_and_other_subjects(self):
        subject = "[EXE] Đơn vào phòng: được chấp nhận"
        stale = summary("before", subject, 1)
        other_subject = summary("other", "[EXE] Mail khác", 2)
        target = summary("message/id", subject, 8)
        self.fake_polls([stale, other_subject], [stale, other_subject, target],
                        text="Chào Sinh viên 08,\n\nTrưởng phòng đã chấp nhận đơn của bạn.")

        with patch("recruitment_notifications.time.sleep") as pause:
            self.inbox.wait_for(subject, (8,), {"before"}, fragments=("chấp nhận đơn",))

        pause.assert_called_once_with(0.5)
        self.http.request.assert_any_call("GET", "/api/v1/message/message%2Fid")
        paths = [call.args[1] for call in self.http.request.call_args_list]
        self.assertNotIn("/api/v1/message/before", paths)
        self.assertNotIn("/api/v1/message/other", paths)

    def test_unexpected_or_duplicate_recipients_raise(self):
        cases = {
            "extra": [summary("one", "A", 1, 8)],
            "duplicate": [summary("one", "A", 1), summary("two", "A", 1)],
        }
        for label, messages in cases.items():
            with self.subTest(label=label):
                self.fake_polls(messages)

                with self.assertRaisesRegex(AssertionError, "Unexpected or repeated recipients"):
                    self.inbox.wait_for("A", (1,), set())

    def test_expected_recipient_with_wrong_personalized_greeting_fails(self):
        self.fake_polls([summary("one", "A", 1)], text="Chào Sinh viên 02,\n\nĐã nhận đơn.")

        with self.assertRaisesRegex(AssertionError, "Chào Sinh viên 01"):
            self.inbox.wait_for("A", (1,), set(), fragments=("Đã nhận đơn",))

    def test_missing_recipient_reports_addresses_after_timeout(self):
        self.fake_polls([summary("one", "A", 1)])

        with (patch("recruitment_notifications.time.sleep"),
              patch("recruitment_notifications.time.monotonic", side_effect=[0, 1, 11])):
            with self.assertRaisesRegex(AssertionError, "student01@exe.local.*student02@exe.local"):
                self.inbox.wait_for("A", (1, 2), set())

    def test_missing_mailpit_detail_has_clear_failure(self):
        self.http.request.side_effect = [
            Response(200, {"messages": [summary("one", "A", 1)]}, {}),
            Response(404, "", {}),
        ]

        with self.assertRaisesRegex(AssertionError, "message detail returned HTTP 404"):
            self.inbox.wait_for("A", (1,), set())


class ScenarioInputTests(unittest.TestCase):
    def test_local_gateway_origin_accepts_ipv4_ipv6_and_hostnames(self):
        for origin in ("http://localhost:18080", "http://127.0.0.1:18080", "http://[::1]:18080/"):
            with self.subTest(origin=origin):
                self.assertEqual(origin.rstrip("/"), LocalHttp(origin).origin)

    def test_origin_rejects_remote_sites_and_urls_with_credentials_or_paths(self):
        for origin in ("https://localhost:18080", "http://example.com", "http://fake.localhost",
                       "http://user:pass@localhost", "http://localhost/api",
                       "http://localhost?x=1", "http://localhost/#fragment"):
            with self.subTest(origin=origin):
                with self.assertRaises(ValueError):
                    LocalHttp(origin)

    def test_http_conflict_body_is_available_to_assertions(self):
        from io import BytesIO
        http = LocalHttp("http://localhost:18080")
        http.opener = Mock()
        http.opener.open.side_effect = HTTPError(
            "http://localhost:18080/api/rooms/1", 409, "Conflict", {},
            BytesIO(b'{"code":"BR19"}'),
        )

        result = http.request("POST", "/api/rooms/1", "sample-only", {"message": "Tiếng Việt"})

        self.assertEqual(409, result.status)
        self.assertEqual({"code": "BR19"}, result.body)
        sent = http.opener.open.call_args.args[0]
        self.assertEqual("POST", sent.get_method())
        self.assertEqual("Bearer sample-only", sent.get_header("Authorization"))
        self.assertIn("Tiếng Việt".encode(), sent.data)

    def test_dotenv_ignores_comments_unrelated_keys_and_quotes(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / ".env"
            path.write_text('# SEED_DEFAULT_PASSWORD=comment\nOTHER_KEY=other\nSEED_DEFAULT_PASSWORD="OnlyForTest"\n',
                            encoding="utf-8-sig")

            self.assertEqual("OnlyForTest", password_from(path))

    def test_empty_or_missing_password_is_rejected(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / ".env"
            path.write_text("SEED_DEFAULT_PASSWORD=\n", encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "SEED_DEFAULT_PASSWORD is missing"):
                password_from(path)

    def test_role_filter_repeats_query_key_per_role(self):
        self.assertEqual("/api/rooms?roleIds=BE&roleIds=UIUX&q=Campus+Design",
                         with_query("/api/rooms", roleIds=["BE", "UIUX"], q="Campus Design"))


if __name__ == "__main__":
    unittest.main()
