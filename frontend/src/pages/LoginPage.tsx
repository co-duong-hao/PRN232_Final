import { LockOutlined, MailOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Form, Input, Typography } from "antd";
import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "@/api/client";
import { homePathFor, useAuth } from "@/auth/AuthContext";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { useI18n } from "@/i18n";

interface LoginForm {
  email: string;
  password: string;
}

export function LoginPage() {
  const { user, login } = useAuth();
  const { t } = useI18n();
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
      setError(e instanceof ApiError ? e.message : t.login.loginFailed);
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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 20,
          }}
        >
          <div>
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
              {t.login.title}
            </Typography.Title>
            <Typography.Text type="secondary">{t.login.subtitle}</Typography.Text>
          </div>
          <LanguageSwitch />
        </div>

        {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}

        <Form<LoginForm> layout="vertical" onFinish={onFinish} requiredMark={false}>
          <Form.Item
            name="email"
            label={t.login.emailLabel}
            rules={[
              { required: true, message: t.login.emailRequired },
              { type: "email", message: t.login.emailInvalid },
            ]}
          >
            <Input
              size="large"
              prefix={<MailOutlined />}
              placeholder={t.login.emailPlaceholder}
              autoComplete="username"
            />
          </Form.Item>
          <Form.Item
            name="password"
            label={t.login.passwordLabel}
            rules={[{ required: true, message: t.login.passwordRequired }]}
          >
            <Input.Password
              size="large"
              prefix={<LockOutlined />}
              placeholder={t.login.passwordPlaceholder}
              autoComplete="current-password"
            />
          </Form.Item>
          <Button type="primary" size="large" htmlType="submit" block loading={submitting}>
            {t.login.loginBtn}
          </Button>
        </Form>

        <Typography.Paragraph
          type="secondary"
          style={{ marginTop: 18, marginBottom: 0, fontSize: 13, textAlign: "center" }}
        >
          {t.login.helpText}
        </Typography.Paragraph>
      </Card>
    </div>
  );
}
