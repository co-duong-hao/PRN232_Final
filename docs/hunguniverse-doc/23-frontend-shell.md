# Điều hướng và xác thực trên web

Tài liệu tham chiếu cho PRN232 Final v0.4 tại commit 2e3789f.

[Mục lục bộ tài liệu](01-architecture.md)

## Cách hoạt động

Frontend dùng React Router và AuthContext. Màn hình hiển thị theo vai trò từ token, còn backend xác thực quyền của các thao tác qua API.

Layout chứa các đường dẫn đăng nhập, hồ sơ, học phần và quản trị. Tài khoản có nhiều vai trò có thể có nhiều mục điều hướng.

Khi một request trả 401, HTTP client phát tín hiệu để lớp xác thực xử lý phiên hết hiệu lực.

## Cách kiểm tra

1. Đăng nhập bằng sinh viên, giảng viên, trưởng bộ môn và admin để đối chiếu menu tương ứng.
2. Phân biệt chuyển hướng ở React Router với HTTP 403 khi gọi trực tiếp endpoint bảo vệ.

## Đối chiếu mã nguồn

Các trích đoạn dưới đây hỗ trợ tra cứu. Đường dẫn mở phần tương ứng trong repo.

### App.tsx

Tuyến và quy tắc truy cập từng màn hình.

[frontend/src/App.tsx dòng 1–129](../../frontend/src/App.tsx#L1-L129)

~~~tsx
import { Button, Result } from "antd";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { homePathFor, useAuth } from "@/auth/AuthContext";
import { RequireAuth } from "@/auth/RequireAuth";
import { AppLayout } from "@/components/AppLayout";
import { LoginPage } from "@/pages/LoginPage";
import { UsersPage } from "@/pages/admin/UsersPage";
import { CourseDetailPage } from "@/pages/staff/CourseDetailPage";
import { CoursesPage } from "@/pages/staff/CoursesPage";
import { CourseRoomsPage } from "@/pages/student/CourseRoomsPage";
import { GroupDetailPage } from "@/pages/student/GroupDetailPage";
import { MyAppliesPage } from "@/pages/student/MyAppliesPage";
import { MyCoursesPage } from "@/pages/student/MyCoursesPage";
import { ProfilePage } from "@/pages/student/ProfilePage";
import { RoomDetailPage } from "@/pages/student/RoomDetailPage";

// Route table. Owned by the Manager: tasks F1 and F2 fill in the page components, not this file.
export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<HomeRedirect />} />

        {/* Task F1: student */}
        <Route
          path="student/courses"
          element={
            <RequireAuth roles={["Student"]}>
              <MyCoursesPage />
            </RequireAuth>
          }
        />
        <Route
          path="student/courses/:courseId"
          element={
            <RequireAuth roles={["Student"]}>
              <CourseRoomsPage />
            </RequireAuth>
          }
        />
        <Route
          path="student/rooms/:roomId"
          element={
            <RequireAuth roles={["Student"]}>
              <RoomDetailPage />
            </RequireAuth>
          }
        />
        <Route
          path="student/applies"
          element={
            <RequireAuth roles={["Student"]}>
              <MyAppliesPage />
            </RequireAuth>
          }
        />
        <Route
          path="student/groups/:groupId"
          element={
            <RequireAuth roles={["Student"]}>
              <GroupDetailPage />
            </RequireAuth>
          }
        />

        <Route
          path="student/profile"
          element={
            <RequireAuth roles={["Student"]}>
              <ProfilePage />
            </RequireAuth>
          }
        />

        {/* Task F2: lecturer, head of department, admin */}
        <Route
          path="staff/courses"
          element={
            <RequireAuth roles={["Admin", "HeadOfDepartment", "Lecturer"]}>
              <CoursesPage />
            </RequireAuth>
          }
        />
        <Route
          path="staff/courses/:courseId"
          element={
            <RequireAuth roles={["Admin", "HeadOfDepartment", "Lecturer"]}>
              <CourseDetailPage />
            </RequireAuth>
          }
        />
        <Route
          path="admin/users"
          element={
            <RequireAuth roles={["Admin"]}>
              <UsersPage />
            </RequireAuth>
          }
        />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

function HomeRedirect() {
  const { user } = useAuth();
  return user ? <Navigate to={homePathFor(user)} replace /> : <Navigate to="/login" replace />;
}

function NotFound() {
  const navigate = useNavigate();
  return (
    <Result
      status="404"
      title="404"
      subTitle="Không tìm thấy trang."
      extra={<Button onClick={() => navigate("/")}>Về trang chủ</Button>}
    />
  );
}
~~~

### AuthContext.tsx

Trạng thái xác thực và cách lấy hồ sơ hiện tại.

[frontend/src/auth/AuthContext.tsx dòng 1–90](../../frontend/src/auth/AuthContext.tsx#L1-L90)

~~~tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { authApi, meApi } from "@/api";
import { UNAUTHORIZED_EVENT, readStoredToken, storeToken } from "@/api/client";
import type { LoginUser, Role, Student } from "@/api/types";

interface AuthState {
  /** Null while signed out. */
  user: LoginUser | null;
  /** Student profile for role Student (id is the student id used by rooms); null otherwise. */
  student: Student | null;
  /** True until the stored session has been checked on first load. */
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginUser>;
  logout: () => void;
  hasRole: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<LoginUser | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (u: LoginUser) => {
    setUser(u);
    setStudent(u.roles.includes("Student") ? await meApi.student().catch(() => null) : null);
  }, []);

  const logout = useCallback(() => {
    storeToken(null);
    setUser(null);
    setStudent(null);
  }, []);

  // Restore the session from storage on first load.
  useEffect(() => {
    if (!readStoredToken()) {
      setLoading(false);
      return;
    }
    authApi
      .me()
      .then(loadProfile)
      .catch(logout)
      .finally(() => setLoading(false));
  }, [loadProfile, logout]);

  // Any 401 from the API signs the user out.
  useEffect(() => {
    window.addEventListener(UNAUTHORIZED_EVENT, logout);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, logout);
  }, [logout]);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await authApi.login(email, password);
      storeToken({ accessToken: result.accessToken, expiresAt: result.expiresAt });
      await loadProfile(result.user);
      return result.user;
    },
    [loadProfile],
  );

  const value = useMemo<AuthState>(
    () => ({
      user,
      student,
      loading,
      login,
      logout,
      hasRole: (...roles) => !!user && roles.some((r) => user.roles.includes(r)),
    }),
    [user, student, loading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/** Landing page for a role after login. */
export function homePathFor(user: LoginUser): string {
  if (user.roles.includes("Student")) return "/student/courses";
  return "/staff/courses";
}
~~~

### RequireAuth.tsx

Điều kiện render nhánh được bảo vệ.

[frontend/src/auth/RequireAuth.tsx dòng 1–22](../../frontend/src/auth/RequireAuth.tsx#L1-L22)

~~~tsx
import { Result, Spin } from "antd";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import type { Role } from "@/api/types";
import { useAuth } from "./AuthContext";

/** Renders children only for a signed-in user that has one of `roles` (any role when omitted). */
export function RequireAuth({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { user, loading, hasRole } = useAuth();
  const location = useLocation();

  if (loading) {
    return <Spin size="large" style={{ display: "block", margin: "120px auto" }} />;
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (roles && !hasRole(...roles)) {
    return <Result status="403" title="403" subTitle="Bạn không có quyền truy cập trang này." />;
  }
  return <>{children}</>;
}
~~~

### AppLayout.tsx

Điều hướng theo vai trò.

[frontend/src/components/AppLayout.tsx dòng 26–82](../../frontend/src/components/AppLayout.tsx#L26-L82)

~~~tsx
  // Start collapsed on narrow screens; antd's breakpoint only fires on later resizes.
  const [collapsed, setCollapsed] = useState(isNarrow);

  const items: MenuProps["items"] = [];
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
    .map((i) => String(i?.key))
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
~~~

### LoginPage.tsx

Form đăng nhập.

[frontend/src/pages/LoginPage.tsx dòng 1–73](../../frontend/src/pages/LoginPage.tsx#L1-L73)

~~~tsx
import { LockOutlined, MailOutlined, TeamOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Form, Input, Typography } from "antd";
import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "@/api/client";
import { homePathFor, useAuth } from "@/auth/AuthContext";

interface LoginForm {
  email: string;
  password: string;
}

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to={homePathFor(user)} replace />;

  const onFinish = async (values: LoginForm) => {
    setSubmitting(true);
    setError(null);
    try {
      const u = await login(values.email.trim(), values.password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== "/login" ? from : homePathFor(u), { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Đăng nhập thất bại.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#f5f7fb",
        padding: 16,
      }}
    >
      <Card style={{ width: 380, maxWidth: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <TeamOutlined style={{ fontSize: 40, color: "#EA580C" }} />
          <Typography.Title level={3} style={{ margin: "8px 0 0" }}>
            EXE Team Matching
          </Typography.Title>
          <Typography.Text type="secondary">Hệ thống ghép nhóm EXE101 / EXE201</Typography.Text>
        </div>
        {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}
        <Form<LoginForm> layout="vertical" onFinish={onFinish} requiredMark={false}>
          <Form.Item
            name="email"
            label="Email"
            rules={[{ required: true, type: "email", message: "Nhập email hợp lệ" }]}
          >
            <Input prefix={<MailOutlined />} placeholder="student01@exe.local" autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" label="Mật khẩu" rules={[{ required: true, message: "Nhập mật khẩu" }]}>
            <Input.Password prefix={<LockOutlined />} autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={submitting}>
            Đăng nhập
          </Button>
        </Form>
      </Card>
    </div>
  );
}
~~~

### main.tsx

Provider, router và theme.

[frontend/src/main.tsx dòng 1–26](../../frontend/src/main.tsx#L1-L26)

~~~tsx
import { App as AntApp, ConfigProvider } from "antd";
import viVN from "antd/locale/vi_VN";
import dayjs from "dayjs";
import "dayjs/locale/vi";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./auth/AuthContext";
import "./styles.css";

dayjs.locale("vi");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConfigProvider locale={viVN} theme={{ token: { colorPrimary: "#EA580C", borderRadius: 8 } }}>
      <AntApp>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  </StrictMode>,
);
~~~
