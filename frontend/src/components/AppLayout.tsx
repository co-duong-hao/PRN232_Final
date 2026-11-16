import {
  AppstoreOutlined,
  BookOutlined,
  FileTextOutlined,
  LogoutOutlined,
  MenuOutlined,
  TeamOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Alert, Avatar, Breadcrumb, Button, Drawer, Dropdown, Layout, Menu, Tag } from "antd";
import type { BreadcrumbProps, MenuProps } from "antd";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { formatDecimal } from "./format";
import { roleLabel } from "./labels";

const { Header, Sider, Content, Footer } = Layout;

function buildBreadcrumbs(pathname: string): NonNullable<BreadcrumbProps["items"]> {
  if (pathname === "/student/courses") {
    return [{ title: "Học phần của tôi" }];
  }
  if (pathname.startsWith("/student/courses/")) {
    return [{ title: <Link to="/student/courses">Học phần của tôi</Link> }, { title: "Tìm nhóm" }];
  }
  if (pathname.startsWith("/student/rooms/")) {
    return [{ title: <Link to="/student/courses">Học phần của tôi</Link> }, { title: "Chi tiết phòng" }];
  }
  if (pathname.startsWith("/student/groups/")) {
    return [{ title: <Link to="/student/courses">Học phần của tôi</Link> }, { title: "Chi tiết nhóm" }];
  }
  if (pathname === "/student/applies") {
    return [{ title: "Đơn xin vào phòng" }];
  }
  if (pathname === "/student/profile") {
    return [{ title: "Hồ sơ của tôi" }];
  }
  if (pathname === "/staff/courses") {
    return [{ title: "Quản lý học phần" }];
  }
  if (pathname.startsWith("/staff/courses/")) {
    return [{ title: <Link to="/staff/courses">Quản lý học phần</Link> }, { title: "Chi tiết học phần" }];
  }
  if (pathname === "/admin/users") {
    return [{ title: "Quản lý tài khoản" }];
  }
  return [{ title: "Trang chủ" }];
}

/** Khung giao diện chung: thanh điều hướng theo vai trò, breadcrumb, tài khoản và nhắc hoàn thiện hồ sơ. */
export function AppLayout() {
  const { user, student, hasRole, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);

  const items: { key: string; icon: ReactNode; label: string }[] = [];
  if (hasRole("Student")) {
    items.push(
      { key: "/student/courses", icon: <BookOutlined />, label: "Học phần của tôi" },
      { key: "/student/applies", icon: <FileTextOutlined />, label: "Đơn xin vào phòng" },
      { key: "/student/profile", icon: <UserOutlined />, label: "Hồ sơ của tôi" },
    );
  }
  if (hasRole("Admin", "HeadOfDepartment", "Lecturer")) {
    items.push({ key: "/staff/courses", icon: <AppstoreOutlined />, label: "Quản lý học phần" });
  }
  if (hasRole("Admin")) {
    items.push({ key: "/admin/users", icon: <TeamOutlined />, label: "Quản lý tài khoản" });
  }

  const selected = useMemo(() => {
    if (
      location.pathname.startsWith("/student/courses") ||
      location.pathname.startsWith("/student/rooms") ||
      location.pathname.startsWith("/student/groups")
    ) {
      return "/student/courses";
    }
    return items
      .map((item) => item.key)
      .filter((k) => location.pathname.startsWith(k))
      .sort((a, b) => b.length - a.length)[0];
  }, [items, location.pathname]);

  const breadcrumbs = useMemo(() => buildBreadcrumbs(location.pathname), [location.pathname]);

  const missingGpa = student != null && student.gpa == null;
  const missingRoles = student != null && student.roles.length === 0;
  const showOnboardingReminder =
    hasRole("Student") &&
    student != null &&
    (missingGpa || missingRoles) &&
    location.pathname !== "/student/profile";

  const onboardingMessage = useMemo(() => {
    if (missingGpa && missingRoles) {
      return "Bạn chưa cập nhật GPA tích lũy và vai trò mong muốn. Hãy hoàn thiện hồ sơ để lọc nhóm chính xác và tránh bị từ chối khi vào phòng có yêu cầu GPA.";
    }
    if (missingGpa) {
      return "Bạn chưa cập nhật GPA tích lũy. Các phòng có yêu cầu GPA tối thiểu sẽ không cho vào trực tiếp nếu hồ sơ còn trống GPA.";
    }
    return "Bạn chưa chọn vai trò mong muốn trong nhóm. Cập nhật vai trò giúp trưởng phòng dễ đánh giá khi bạn tham gia hoặc gửi đơn.";
  }, [missingGpa, missingRoles]);

  const accountInitial = user?.fullName?.trim().charAt(0).toUpperCase() || "U";

  const accountMenuItems: MenuProps["items"] = [];
  if (student) {
    const roleSummary = student.roles.length
      ? student.roles.map((r) => r.name).join(", ")
      : "Chưa chọn vai trò";
    accountMenuItems.push(
      {
        key: "summary",
        disabled: true,
        label: (
          <div style={{ minWidth: 200, cursor: "default", color: "#334155" }}>
            <div style={{ fontWeight: 600 }}>{user?.fullName}</div>
            <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>
              GPA: {student.gpa != null ? formatDecimal(student.gpa) : "Chưa cập nhật"}
            </div>
            <div style={{ fontSize: 12, color: "#475569" }}>Vai trò: {roleSummary}</div>
          </div>
        ),
      },
      { type: "divider" },
      { key: "/student/profile", icon: <UserOutlined />, label: "Hồ sơ của tôi" },
      { key: "/student/applies", icon: <FileTextOutlined />, label: "Đơn xin vào phòng" },
      { type: "divider" },
    );
  }
  accountMenuItems.push({ key: "logout", icon: <LogoutOutlined />, label: "Đăng xuất", danger: true });

  const menu = (
    <Menu
      mode="inline"
      items={items}
      selectedKeys={selected ? [selected] : []}
      onClick={({ key }) => {
        navigate(key);
        setMobileNavigationOpen(false);
      }}
    />
  );

  return (
    <Layout className="app-shell" hasSider>
      <a className="app-shell__skip" href="#main-content">
        Chuyển đến nội dung chính
      </a>
      <Sider
        className="app-shell__sidebar"
        breakpoint="lg"
        collapsedWidth={0}
        trigger={null}
        onBreakpoint={(narrow) => {
          if (!narrow) setMobileNavigationOpen(false);
        }}
        theme="light"
        width={244}
      >
        <div className="app-shell__brand">
          <span className="app-shell__brand-mark" aria-hidden="true">
            EXE
          </span>
          <div>
            <div>Ghép nhóm EXE</div>
            <span className="app-shell__brand-sub">Cổng hỗ trợ EXE101 · EXE201</span>
          </div>
        </div>
        <nav aria-label="Điều hướng chính">{menu}</nav>
      </Sider>
      <Drawer
        title="Điều hướng"
        placement="left"
        width="min(300px, 85vw)"
        open={mobileNavigationOpen}
        onClose={() => setMobileNavigationOpen(false)}
        destroyOnHidden
        styles={{ body: { padding: 8 } }}
      >
        <nav aria-label="Điều hướng chính">{menu}</nav>
      </Drawer>
      <Layout className="app-shell__main">
        <Header className="app-shell__header">
          <div className="app-shell__header-left">
            <Button
              className="app-shell__mobile-toggle"
              type="text"
              icon={<MenuOutlined />}
              aria-label="Mở menu điều hướng"
              aria-expanded={mobileNavigationOpen}
              aria-haspopup="dialog"
              onClick={() => setMobileNavigationOpen(true)}
            />
            <Breadcrumb className="app-shell__breadcrumb" items={breadcrumbs} />
          </div>
          <Dropdown
            trigger={["click"]}
            placement="bottomRight"
            menu={{
              items: accountMenuItems,
              onClick: ({ key }) => {
                if (key === "logout") {
                  logout();
                  navigate("/login");
                } else if (key.startsWith("/")) {
                  navigate(key);
                }
              },
            }}
          >
            <Button className="app-shell__account" type="text">
              <span className="app-shell__account-content">
                <Avatar className="app-shell__account-avatar" size="small">
                  {accountInitial}
                </Avatar>
                <span className="app-shell__account-meta">
                  <span className="app-shell__account-name">{user?.fullName}</span>
                  {student && (
                    <span className="app-shell__account-detail">
                      {student.studentCode} · {student.majorCode} ·{" "}
                      {student.gpa != null ? `GPA ${formatDecimal(student.gpa)}` : "Chưa có GPA"}
                    </span>
                  )}
                </span>
                {!student &&
                  user?.roles.map((r) => (
                    <Tag className="app-shell__account-role-tag" key={r} color="orange">
                      {roleLabel[r]}
                    </Tag>
                  ))}
              </span>
            </Button>
          </Dropdown>
        </Header>
        <Content className="app-shell__content" id="main-content" tabIndex={-1}>
          {showOnboardingReminder && (
            <div className="app-shell__onboarding">
              <Alert
                type="info"
                message="Hoàn thiện hồ sơ cá nhân"
                description={onboardingMessage}
                action={
                  <Button type="primary" size="small" onClick={() => navigate("/student/profile")}>
                    Cập nhật hồ sơ
                  </Button>
                }
              />
            </div>
          )}
          <Outlet />
        </Content>
        <Footer className="app-footer">
          <span className="app-footer__name">Hệ thống ghép nhóm EXE</span>
          <span>Đồ án PRN232 · Nhóm 6</span>
        </Footer>
      </Layout>
    </Layout>
  );
}
