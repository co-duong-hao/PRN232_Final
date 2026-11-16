import dayjs from "dayjs";

// The backend stores UTC but returns some timestamps without a zone suffix ("2026-11-15T08:21:33").
// Treat a value with no "Z" or offset as UTC so it is shown in the viewer's local time.
const HAS_ZONE = /(Z|[+-]\d{2}:?\d{2})$/i;
const parse = (iso: string) => dayjs(HAS_ZONE.test(iso) ? iso : `${iso}Z`);

/** 15/11/2026 14:30 (local time) */
export const formatDateTime = (iso?: string | null) => (iso ? parse(iso).format("DD/MM/YYYY HH:mm") : "—");

/** 15/11/2026 (local time) */
export const formatDate = (iso?: string | null) => (iso ? parse(iso).format("DD/MM/YYYY") : "—");

/** 3.40 or "—" when unset */
export const formatDecimal = (value?: number | null) => (value == null ? "—" : value.toFixed(2));

/** Short Vietnamese deadline status label relative to now. */
export function formatDeadlineRemaining(iso?: string | null): string | null {
  if (!iso) return null;
  const target = parse(iso);
  const diffHours = target.diff(dayjs(), "hour");
  if (diffHours < 0) return "Đã quá hạn";
  if (diffHours < 24) return `Còn ${Math.max(1, diffHours)} giờ`;
  const diffDays = target.diff(dayjs(), "day");
  return `Còn ${diffDays} ngày`;
}
