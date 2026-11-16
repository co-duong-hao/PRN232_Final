import { Button, Spin, Typography } from "antd";
import type { ReactNode } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import type { Role } from "@/api/types";
import { homePathFor, useAuth } from "./AuthContext";

/** Renders children only for a signed-in user that has one of `roles` (any role when omitted). */
export function RequireAuth({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { user, loading, hasRole } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (loading) {
    return <Spin size="large" style={{ display: "block", margin: "120px auto" }} />;
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (roles && !hasRole(...roles)) {
    return (
      <div className="app-status-page">
        <div className="app-status-card">
          <span className="app-status-card__code">403 · Không đủ quyền</span>
          <Typography.Title level={3} style={{ margin: "0 0 8px" }}>
            Không có quyền truy cập
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 20 }}>
            Bạn không có quyền truy cập trang này. Vui lòng quay về trang chính theo vai trò của bạn.
          </Typography.Paragraph>
          <Button type="primary" onClick={() => navigate(homePathFor(user), { replace: true })}>
            Về trang chính
          </Button>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
