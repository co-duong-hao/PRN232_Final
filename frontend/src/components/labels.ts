import type { ApplyStatus, CourseStatus, Role, RoomStatus } from "@/api/types";

export const roleLabel: Record<Role, string> = {
  Admin: "Admin",
  HeadOfDepartment: "Trưởng bộ môn",
  Lecturer: "Giảng viên",
  Student: "Sinh viên",
};

export const roomStatusLabel: Record<RoomStatus, { text: string; color: string }> = {
  Open: { text: "Đang mở", color: "green" },
  Locked: { text: "Đã khóa", color: "orange" },
  Completed: { text: "Đã thành nhóm", color: "blue" },
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
  Forming: { text: "Đang ghép nhóm", color: "processing" },
  Closed: { text: "Đã đóng", color: "red" },
};
