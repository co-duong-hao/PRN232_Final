import dayjs from "dayjs";
import { translations, type Language } from "@/i18n";

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

/** Short deadline status label relative to now (localized). */
export function formatDeadlineRemaining(iso?: string | null, lang: Language = "vi"): string | null {
  if (!iso) return null;
  const target = parse(iso);
  const diffHours = target.diff(dayjs(), "hour");
  const t = translations[lang].common;
  if (diffHours < 0) return t.overdue;
  if (diffHours < 24) return t.leftHours(Math.max(1, diffHours));
  const diffDays = target.diff(dayjs(), "day");
  return t.leftDays(diffDays);
}
