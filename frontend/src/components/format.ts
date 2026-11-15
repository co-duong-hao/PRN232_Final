import dayjs from "dayjs";

// The backend stores UTC but returns some timestamps without a zone suffix ("2026-11-15T08:21:33").
// Treat a value with no "Z" or offset as UTC so it is shown in the viewer's local time.
const HAS_ZONE = /(Z|[+-]\d{2}:?\d{2})$/i;
const parse = (iso: string) => dayjs(HAS_ZONE.test(iso) ? iso : `${iso}Z`);

/** 15/11/2026 14:30 (local time) */
export const formatDateTime = (iso?: string | null) => (iso ? parse(iso).format("DD/MM/YYYY HH:mm") : "—");

/** 15/11/2026 (local time) */
export const formatDate = (iso?: string | null) => (iso ? parse(iso).format("DD/MM/YYYY") : "—");
