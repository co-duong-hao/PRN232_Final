"""Check the seeded EXE101 and EXE201 results in a real Chromium browser.

Run both API smoke modes first, then run this script with the same .env file.
Requires Playwright for Python and its Chromium browser.
"""

import argparse
from pathlib import Path

from playwright.sync_api import Browser, Page, expect, sync_playwright

WEB = "http://localhost:3000"
EXE101 = "30000000-0000-0000-0000-000000000001"
EXE201 = "30000000-0000-0000-0000-000000000002"


def login(page: Page, account: str, password: str, next_path: str) -> None:
    if page.url != f"{WEB}/login":
        page.goto(f"{WEB}/login")
    page.get_by_label("Email", exact=True).fill(f"{account}@exe.local")
    page.get_by_label("Mật khẩu", exact=True).fill(password)
    page.get_by_role("button", name="Đăng nhập", exact=True).click()
    expect(page).to_have_url(WEB + next_path)


def check_student_pages(browser: Browser, password: str) -> None:
    with browser.new_context() as context:
        context.set_default_timeout(8000)
        page = context.new_page()
        page.goto(f"{WEB}/staff/courses/{EXE101}")
        expect(page).to_have_url(f"{WEB}/login")
        print("[OK] Signed-out staff page redirects to login")

        login(page, "student02", password, f"/staff/courses/{EXE101}")
        expect(page.get_by_text("Bạn không có quyền truy cập trang này.")).to_be_visible()
        print("[OK] Student cannot open the staff page")

        page.get_by_role("menuitem", name="Course của tôi").click()
        page.get_by_role("link", name="Xem nhóm", exact=True).click()
        expect(page.get_by_role("heading", name="Nhóm FA26-EXE101-G001")).to_be_visible()
        expect(page.get_by_role("row").filter(has_text="SE180002").get_by_text("Sinh viên 02", exact=True)).to_be_visible()
        print("[OK] EXE101 member opens the completed group")


def check_cancelled_application(browser: Browser, password: str) -> None:
    with browser.new_context() as context:
        context.set_default_timeout(8000)
        page = context.new_page()
        login(page, "student09", password, "/student/courses")
        page.get_by_role("menuitem", name="Đơn xin vào phòng").click()
        cancelled_row = page.get_by_role("row").filter(has_text="Frontend")
        expect(cancelled_row.get_by_text("Đã hủy", exact=True)).to_be_visible()
        expect(cancelled_row.get_by_role("button", name="Hủy đơn")).to_have_count(0)
        print("[OK] Applicant sees the cancelled application without a cancel action")


def check_staff_pages(browser: Browser, password: str) -> None:
    with browser.new_context() as context:
        context.set_default_timeout(8000)
        page = context.new_page()
        login(page, "lecturer", password, "/staff/courses")
        page.goto(f"{WEB}/staff/courses/{EXE201}")
        expect(page.get_by_role("heading", name="FA26-EXE201 Đã đóng")).to_be_visible()
        page.goto(f"{WEB}/staff/courses/{EXE101}")
        expect(page.get_by_role("heading", name="FA26-EXE101 Đang ghép nhóm")).to_be_visible()
        expect(page.get_by_role("button", name="Đóng ghép nhóm", exact=True)).to_have_count(0)
        print("[OK] Lecturer can inspect both course states without a close action")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("env_file", type=Path)
    args = parser.parse_args()
    try:
        lines = args.env_file.read_text(encoding="utf-8").splitlines()
    except OSError as error:
        parser.error(str(error))
    password = next((line.partition("=")[2] for line in lines
                     if line.startswith("SEED_DEFAULT_PASSWORD=")), "")
    if not password:
        parser.error("SEED_DEFAULT_PASSWORD is missing or empty")

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        try:
            check_student_pages(browser, password)
            check_cancelled_application(browser, password)
            check_staff_pages(browser, password)
        finally:
            browser.close()


if __name__ == "__main__":
    main()
