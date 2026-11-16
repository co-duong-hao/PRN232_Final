import {
  AppstoreOutlined,
  BookOutlined,
  FileTextOutlined,
  LogoutOutlined,
  TeamOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Avatar, Button, Dropdown, Layout, Menu, Space, Tag, Typography } from "antd";
import type { ReactNode } from "react";
import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { roleLabel } from "./labels";

const { Header, Sider, Content, Footer } = Layout;

/** Below antd's "lg" breakpoint (992px). */
const isNarrow = () => window.matchMedia("(max-width: 991.98px)").matches;

/** Shell for every signed-in page: sidebar menu by role, header with the user, routed content. */
export function AppLayout() {
  const { user, student, hasRole, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Start collapsed on narrow screens; antd's breakpoint only fires on later resizes.
  const [collapsed, setCollapsed] = useState(isNarrow);

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

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider
        breakpoint="lg"
        collapsedWidth={0}
        collapsed={collapsed}
        onCollapse={setCollapsed}
        onBreakpoint={setCollapsed}
        theme="light"
        width={230}
        style={{ borderRight: "1px solid #f0f0f0", whiteSpace: "nowrap" }}
      >
        <div style={{ padding: "18px 20px", fontWeight: 700, fontSize: 16, overflow: "hidden" }}>
          <TeamOutlined style={{ color: "#EA580C", marginRight: 8 }} />
          EXE Team Matching
        </div>
        <Menu
          mode="inline"
          items={items}
          selectedKeys={selected ? [selected] : []}
          onClick={(e) => {
            navigate(e.key);
            if (isNarrow()) setCollapsed(true);
          }}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: "#fff",
            padding: "0 24px",
            display: "flex",
            justifyContent: "flex-end",
            borderBottom: "1px solid #f0f0f0",
          }}
        >
          <Dropdown
            menu={{
              items: [{ key: "logout", icon: <LogoutOutlined />, label: "Đăng xuất" }],
              onClick: () => {
                logout();
                navigate("/login");
              },
            }}
          >
            <Button type="text" style={{ height: "auto" }}>
              <Space>
                <Avatar size="small" icon={<UserOutlined />} />
                <span>{user?.fullName}</span>
                {student && (
                  <Typography.Text type="secondary">
                    {student.studentCode} · {student.majorCode}
                  </Typography.Text>
                )}
                {user?.roles.map((r) => (
                  <Tag key={r} color="blue">
                    {roleLabel[r]}
                  </Tag>
                ))}
              </Space>
            </Button>
          </Dropdown>
        </Header>
        <Content style={{ padding: 24 }}>
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
