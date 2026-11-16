import {
  AppstoreOutlined,
  BookOutlined,
  FileTextOutlined,
  LogoutOutlined,
  MenuOutlined,
  TeamOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Avatar, Button, Drawer, Dropdown, Layout, Menu, Tag, Typography } from "antd";
import type { ReactNode } from "react";
import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { roleLabel } from "./labels";

const { Header, Sider, Content, Footer } = Layout;

/** Shell for every signed-in page: sidebar menu by role, header with the user, routed content. */
export function AppLayout() {
  const { user, student, hasRole, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);

  const items: { key: string; icon: ReactNode; label: string }[] = [];
  if (hasRole("Student")) {
    items.push(
      { key: "/student/courses", icon: <BookOutlined />, label: "Course của tôi" },
      { key: "/student/applies", icon: <FileTextOutlined />, label: "Đơn xin vào phòng" },
      { key: "/student/profile", icon: <UserOutlined />, label: "Hồ sơ của tôi" },
    );
  }
  if (hasRole("Admin", "HeadOfDepartment", "Lecturer")) {
    items.push({ key: "/staff/courses", icon: <AppstoreOutlined />, label: "Quản lý Course" });
  }
  if (hasRole("Admin")) {
    items.push({ key: "/admin/users", icon: <TeamOutlined />, label: "Tài khoản" });
  }

  const selected = items
    .map((item) => item.key)
    .filter((k) => location.pathname.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];

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
        Chuyển đến nội dung
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
        width={230}
      >
        <div className="app-shell__brand">
          <TeamOutlined />
          EXE Team Matching
        </div>
        <nav aria-label="Điều hướng chính">{menu}</nav>
      </Sider>
      <Drawer
        title="Điều hướng"
        placement="left"
        width="min(320px, 85vw)"
        open={mobileNavigationOpen}
        onClose={() => setMobileNavigationOpen(false)}
        destroyOnHidden
        styles={{ body: { padding: 0 } }}
      >
        <nav aria-label="Điều hướng chính">{menu}</nav>
      </Drawer>
      <Layout className="app-shell__main">
        <Header className="app-shell__header">
          <Button
            className="app-shell__mobile-toggle"
            type="text"
            icon={<MenuOutlined />}
            aria-label="Mở điều hướng"
            aria-expanded={mobileNavigationOpen}
            aria-haspopup="dialog"
            onClick={() => setMobileNavigationOpen(true)}
          />
          <Dropdown
            trigger={["hover", "click"]}
            menu={{
              items: [{ key: "logout", icon: <LogoutOutlined />, label: "Đăng xuất" }],
              onClick: () => {
                logout();
                navigate("/login");
              },
            }}
          >
            <Button className="app-shell__account" type="text">
              <span className="app-shell__account-content">
                <Avatar size="small" icon={<UserOutlined />} />
                <span className="app-shell__account-name">{user?.fullName}</span>
                {student && (
                  <Typography.Text className="app-shell__account-detail" type="secondary">
                    {student.studentCode} · {student.majorCode}
                  </Typography.Text>
                )}
                {user?.roles.map((r) => (
                  <Tag className="app-shell__account-detail" key={r} color="blue">
                    {roleLabel[r]}
                  </Tag>
                ))}
              </span>
            </Button>
          </Dropdown>
        </Header>
        <Content className="app-shell__content" id="main-content" tabIndex={-1}>
          <Outlet />
        </Content>
        <Footer className="app-footer">
          <div>
            <div className="app-footer__name">EXE Team Matching</div>
            <div className="app-footer__credit">Đồ án PRN232 · Nhóm 6</div>
          </div>
          <nav className="app-footer__nav" aria-label="Điều hướng cuối trang">
            {items.map(({ key, label }) => (
              <NavLink key={key} to={key}>
                {label}
              </NavLink>
            ))}
          </nav>
        </Footer>
      </Layout>
    </Layout>
  );
}
