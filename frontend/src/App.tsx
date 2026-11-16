import { Button, Typography } from "antd";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { homePathFor, useAuth } from "@/auth/AuthContext";
import { RequireAuth } from "@/auth/RequireAuth";
import { AppLayout } from "@/components/AppLayout";
import { useI18n } from "@/i18n";
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

        {/* Sinh viên */}
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

        {/* Giảng viên, Trưởng bộ môn, Quản trị viên */}
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
  const { t } = useI18n();
  return (
    <div className="app-status-page">
      <div className="app-status-card">
        <span className="app-status-card__code">{t.notFound.code}</span>
        <Typography.Title level={3} style={{ margin: "0 0 8px" }}>
          {t.notFound.title}
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 20 }}>
          {t.notFound.desc}
        </Typography.Paragraph>
        <Button type="primary" onClick={() => navigate("/")}>
          {t.notFound.backHome}
        </Button>
      </div>
    </div>
  );
}
