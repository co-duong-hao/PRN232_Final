import dayjs from "dayjs";

/** 15/11/2026 14:30 */
export const formatDateTime = (iso?: string | null) => (iso ? dayjs(iso).format("DD/MM/YYYY HH:mm") : "—");

/** 15/11/2026 */
export const formatDate = (iso?: string | null) => (iso ? dayjs(iso).format("DD/MM/YYYY") : "—");
