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
