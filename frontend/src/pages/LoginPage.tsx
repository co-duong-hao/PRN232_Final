import { LockOutlined, MailOutlined } from "@ant-design/icons";
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
      setError(e instanceof ApiError ? e.message : "Đăng nhập thất bại. Vui lòng thử lại.");
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
        background: "linear-gradient(180deg, #fff7ed 0%, #f8fafc 48%)",
        padding: 16,
      }}
    >
      <Card
        style={{
          width: 420,
          maxWidth: "100%",
          borderRadius: 14,
          borderColor: "#e2e8f0",
          boxShadow: "0 10px 30px rgb(15 23 42 / 7%)",
        }}
        styles={{ body: { padding: 32 } }}
      >
        <div style={{ marginBottom: 24 }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "#c2410c",
              color: "#fff",
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: "0.04em",
              marginBottom: 14,
            }}
          >
            EXE
          </span>
          <Typography.Title level={3} style={{ margin: "0 0 6px" }}>
            Hệ thống ghép nhóm EXE
          </Typography.Title>
          <Typography.Text type="secondary">
            Đăng nhập dành cho sinh viên, giảng viên, trưởng bộ môn và quản trị viên.
          </Typography.Text>
        </div>

        {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}

        <Form<LoginForm> layout="vertical" onFinish={onFinish} requiredMark={false}>
          <Form.Item
            name="email"
            label="Email"
            rules={[
              { required: true, message: "Vui lòng nhập email" },
              { type: "email", message: "Email không đúng định dạng" },
            ]}
          >
            <Input
              size="large"
              prefix={<MailOutlined />}
              placeholder="Nhập email được cấp"
              autoComplete="username"
            />
          </Form.Item>
          <Form.Item
            name="password"
            label="Mật khẩu"
            rules={[{ required: true, message: "Vui lòng nhập mật khẩu" }]}
          >
            <Input.Password
              size="large"
              prefix={<LockOutlined />}
              placeholder="Nhập mật khẩu"
              autoComplete="current-password"
            />
          </Form.Item>
          <Button type="primary" size="large" htmlType="submit" block loading={submitting}>
            Đăng nhập
          </Button>
        </Form>

        <Typography.Paragraph
          type="secondary"
          style={{ marginTop: 18, marginBottom: 0, fontSize: 13, textAlign: "center" }}
        >
          Chưa có tài khoản hoặc quên mật khẩu? Vui lòng liên hệ Quản trị viên để được cấp lại.
        </Typography.Paragraph>
      </Card>
    </div>
  );
}
