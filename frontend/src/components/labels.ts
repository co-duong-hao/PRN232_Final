import type { ApplyStatus, CourseStatus, Role, RoomStatus } from "@/api/types";
import { translations, type Language } from "@/i18n";

export const roleLabel: Record<Role, string> = {
  Admin: "Quản trị viên",
  HeadOfDepartment: "Trưởng bộ môn",
  Lecturer: "Giảng viên",
  Student: "Sinh viên",
};

export const roomStatusLabel: Record<RoomStatus, { text: string; color: string }> = {
  Open: { text: "Đang mở", color: "green" },
  Locked: { text: "Đã khóa", color: "orange" },
  Completed: { text: "Đã thành nhóm", color: "geekblue" },
  Cancelled: { text: "Đã hủy", color: "default" },
};

export const applyStatusLabel: Record<ApplyStatus, { text: string; color: string }> = {
  Pending: { text: "Chờ duyệt", color: "gold" },
  Approved: { text: "Đã chấp nhận", color: "green" },
  Rejected: { text: "Bị từ chối", color: "red" },
  Cancelled: { text: "Đã hủy", color: "default" },
};

export const courseStatusLabel: Record<CourseStatus, { text: string; color: string }> = {
  Planned: { text: "Chưa mở", color: "default" },
  Forming: { text: "Đang ghép nhóm", color: "orange" },
  Closed: { text: "Đã đóng", color: "red" },
};

export function getRoleLabels(lang: Language = "vi"): Record<Role, string> {
  const t = translations[lang].roles;
  return {
    Admin: t.Admin,
    HeadOfDepartment: t.HeadOfDepartment,
    Lecturer: t.Lecturer,
    Student: t.Student,
  };
}

export function getRoomStatusLabels(
  lang: Language = "vi",
): Record<RoomStatus, { text: string; color: string }> {
  const t = translations[lang].roomStatus;
  return {
    Open: { text: t.Open, color: "green" },
    Locked: { text: t.Locked, color: "orange" },
    Completed: { text: t.Completed, color: "geekblue" },
    Cancelled: { text: t.Cancelled, color: "default" },
  };
}

export function getApplyStatusLabels(
  lang: Language = "vi",
): Record<ApplyStatus, { text: string; color: string }> {
  const t = translations[lang].applyStatus;
  return {
    Pending: { text: t.Pending, color: "gold" },
    Approved: { text: t.Approved, color: "green" },
    Rejected: { text: t.Rejected, color: "red" },
    Cancelled: { text: t.Cancelled, color: "default" },
  };
}

export function getCourseStatusLabels(
  lang: Language = "vi",
): Record<CourseStatus, { text: string; color: string }> {
  const t = translations[lang].courseStatus;
  return {
    Planned: { text: t.Planned, color: "default" },
    Forming: { text: t.Forming, color: "orange" },
    Closed: { text: t.Closed, color: "red" },
  };
}
