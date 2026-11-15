import {
  AppstoreOutlined,
  BookOutlined,
  FileTextOutlined,
  LogoutOutlined,
  TeamOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Avatar, Button, Dropdown, Layout, Menu, Space, Tag, Typography } from "antd";
import type { MenuProps } from "antd";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { roleLabel } from "./labels";

const { Header, Sider, Content } = Layout;

/** Shell for every signed-in page: sidebar menu by role, header with the user, routed content. */
export function AppLayout() {
  const { user, student, hasRole, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const items: MenuProps["items"] = [];
  if (hasRole("Student")) {
    items.push(
      { key: "/student/courses", icon: <BookOutlined />, label: "Course của tôi" },
      { key: "/student/applies", icon: <FileTextOutlined />, label: "Đơn xin vào phòng" },
    );
  }
  if (hasRole("Admin", "HeadOfDepartment", "Lecturer")) {
    items.push({ key: "/staff/courses", icon: <AppstoreOutlined />, label: "Quản lý Course" });
  }
  if (hasRole("Admin")) {
    items.push({ key: "/admin/users", icon: <TeamOutlined />, label: "Tài khoản" });
  }

  const selected = items
    .map((i) => String(i?.key))
    .filter((k) => location.pathname.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider
        breakpoint="lg"
        collapsedWidth={0}
        theme="light"
        width={230}
        style={{ borderRight: "1px solid #f0f0f0" }}
      >
        <div style={{ padding: "18px 20px", fontWeight: 700, fontSize: 16 }}>
          <TeamOutlined style={{ color: "#1677ff", marginRight: 8 }} />
          EXE Team Matching
        </div>
        <Menu
          mode="inline"
          items={items}
          selectedKeys={selected ? [selected] : []}
          onClick={(e) => navigate(e.key)}
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
      </Layout>
    </Layout>
  );
}
