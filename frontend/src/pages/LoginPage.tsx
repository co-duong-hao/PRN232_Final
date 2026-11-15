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
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f5f7fb", padding: 16 }}>
      <Card style={{ width: 380, maxWidth: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <TeamOutlined style={{ fontSize: 40, color: "#1677ff" }} />
          <Typography.Title level={3} style={{ margin: "8px 0 0" }}>
            EXE Team Matching
          </Typography.Title>
          <Typography.Text type="secondary">Hệ thống ghép nhóm EXE101 / EXE201</Typography.Text>
        </div>
        {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}
        <Form<LoginForm> layout="vertical" onFinish={onFinish} requiredMark={false}>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: "email", message: "Nhập email hợp lệ" }]}>
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
