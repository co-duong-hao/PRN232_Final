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
import { useI18n, type Translations } from "@/i18n";
import { formatDecimal } from "./format";
import { getRoleLabels } from "./labels";
import { LanguageSwitch } from "./LanguageSwitch";

const { Header, Sider, Content, Footer } = Layout;

function buildBreadcrumbs(pathname: string, t: Translations): NonNullable<BreadcrumbProps["items"]> {
  if (pathname === "/student/courses") {
    return [{ title: t.appLayout.navMyCourses }];
  }
  if (pathname.startsWith("/student/courses/")) {
    return [
      { title: <Link to="/student/courses">{t.appLayout.navMyCourses}</Link> },
      { title: t.appLayout.navFindTeam },
    ];
  }
  if (pathname.startsWith("/student/rooms/")) {
    return [
      { title: <Link to="/student/courses">{t.appLayout.navMyCourses}</Link> },
      { title: t.appLayout.navRoomDetail },
    ];
  }
  if (pathname.startsWith("/student/groups/")) {
    return [
      { title: <Link to="/student/courses">{t.appLayout.navMyCourses}</Link> },
      { title: t.appLayout.navGroupDetail },
    ];
  }
  if (pathname === "/student/applies") {
    return [{ title: t.appLayout.navApplies }];
  }
  if (pathname === "/student/profile") {
    return [{ title: t.appLayout.navProfile }];
  }
  if (pathname === "/staff/courses") {
    return [{ title: t.appLayout.navStaffCourses }];
  }
  if (pathname.startsWith("/staff/courses/")) {
    return [
      { title: <Link to="/staff/courses">{t.appLayout.navStaffCourses}</Link> },
      { title: t.appLayout.navStaffCourseDetail },
    ];
  }
  if (pathname === "/admin/users") {
    return [{ title: t.appLayout.navAdminUsers }];
  }
  return [{ title: t.appLayout.navHome }];
}

/** Khung giao diện chung: thanh điều hướng theo vai trò, breadcrumb, tài khoản và nhắc hoàn thiện hồ sơ. */
export function AppLayout() {
  const { user, student, hasRole, logout } = useAuth();
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);

  const roleLabels = useMemo(() => getRoleLabels(language), [language]);

  const items: { key: string; icon: ReactNode; label: string }[] = [];
  if (hasRole("Student")) {
    items.push(
      { key: "/student/courses", icon: <BookOutlined />, label: t.appLayout.navMyCourses },
      { key: "/student/applies", icon: <FileTextOutlined />, label: t.appLayout.navApplies },
      { key: "/student/profile", icon: <UserOutlined />, label: t.appLayout.navProfile },
    );
  }
  if (hasRole("Admin", "HeadOfDepartment", "Lecturer")) {
    items.push({ key: "/staff/courses", icon: <AppstoreOutlined />, label: t.appLayout.navStaffCourses });
  }
  if (hasRole("Admin")) {
    items.push({ key: "/admin/users", icon: <TeamOutlined />, label: t.appLayout.navAdminUsers });
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

  const breadcrumbs = useMemo(() => buildBreadcrumbs(location.pathname, t), [location.pathname, t]);

  const missingGpa = student != null && student.gpa == null;
  const missingRoles = student != null && student.roles.length === 0;
  const showOnboardingReminder =
    hasRole("Student") &&
    student != null &&
    (missingGpa || missingRoles) &&
    location.pathname !== "/student/profile";

  const onboardingMessage = useMemo(() => {
    if (missingGpa && missingRoles) {
      return t.appLayout.onboardingBoth;
    }
    if (missingGpa) {
      return t.appLayout.onboardingGpa;
    }
    return t.appLayout.onboardingRoles;
  }, [missingGpa, missingRoles, t]);

  const accountInitial = user?.fullName?.trim().charAt(0).toUpperCase() || "U";

  const accountMenuItems: MenuProps["items"] = [];
  if (student) {
    const roleSummary = student.roles.length
      ? student.roles.map((r) => r.name).join(", ")
      : t.appLayout.noRolesChosen;
    accountMenuItems.push(
      {
        key: "summary",
        disabled: true,
        label: (
          <div style={{ minWidth: 200, cursor: "default", color: "#334155" }}>
            <div style={{ fontWeight: 600 }}>{user?.fullName}</div>
            <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>
              {t.appLayout.gpaLabel}:{" "}
              {student.gpa != null ? formatDecimal(student.gpa) : t.appLayout.gpaNotUpdated}
            </div>
            <div style={{ fontSize: 12, color: "#475569" }}>
              {t.appLayout.roleLabel}: {roleSummary}
            </div>
          </div>
        ),
      },
      { type: "divider" },
      { key: "/student/profile", icon: <UserOutlined />, label: t.appLayout.navProfile },
      { key: "/student/applies", icon: <FileTextOutlined />, label: t.appLayout.navApplies },
      { type: "divider" },
    );
  }
  accountMenuItems.push({ key: "logout", icon: <LogoutOutlined />, label: t.appLayout.logout, danger: true });

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
        {t.common.skipToContent}
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
            <div>{t.common.appName}</div>
            <span className="app-shell__brand-sub">{t.common.appSub}</span>
          </div>
        </div>
        <nav aria-label={t.appLayout.mainNavAria}>{menu}</nav>
      </Sider>
      <Drawer
        title={t.appLayout.mobileNavTitle}
        placement="left"
        width="min(300px, 85vw)"
        open={mobileNavigationOpen}
        onClose={() => setMobileNavigationOpen(false)}
        destroyOnHidden
        styles={{ body: { padding: 8 } }}
      >
        <nav aria-label={t.appLayout.mainNavAria}>{menu}</nav>
      </Drawer>
      <Layout className="app-shell__main">
        <Header className="app-shell__header">
          <div className="app-shell__header-left">
            <Button
              className="app-shell__mobile-toggle"
              type="text"
              icon={<MenuOutlined />}
              aria-label={t.appLayout.mobileNavToggleAria}
              aria-expanded={mobileNavigationOpen}
              aria-haspopup="dialog"
              onClick={() => setMobileNavigationOpen(true)}
            />
            <Breadcrumb className="app-shell__breadcrumb" items={breadcrumbs} />
          </div>
          <div className="app-shell__header-right">
            <LanguageSwitch />
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
                        {student.gpa != null ? `GPA ${formatDecimal(student.gpa)}` : t.appLayout.noGpaYet}
                      </span>
                    )}
                  </span>
                  {!student &&
                    user?.roles.map((r) => (
                      <Tag className="app-shell__account-role-tag" key={r} color="orange">
                        {roleLabels[r]}
                      </Tag>
                    ))}
                </span>
              </Button>
            </Dropdown>
          </div>
        </Header>
        <Content className="app-shell__content" id="main-content" tabIndex={-1}>
          {showOnboardingReminder && (
            <div className="app-shell__onboarding">
              <Alert
                type="info"
                message={t.appLayout.onboardingTitle}
                description={onboardingMessage}
                action={
                  <Button type="primary" size="small" onClick={() => navigate("/student/profile")}>
                    {t.appLayout.onboardingUpdateBtn}
                  </Button>
                }
              />
            </div>
          )}
          <Outlet />
        </Content>
        <Footer className="app-footer">
          <span className="app-footer__name">{t.common.appName}</span>
          <span>{t.common.footerGroup}</span>
        </Footer>
      </Layout>
    </Layout>
  );
}
