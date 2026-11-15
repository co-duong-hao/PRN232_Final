import { meApi } from "@/api";
import type { MyCourse } from "@/api";

export async function loadAllMyCourses(): Promise<MyCourse[]> {
  const first = await meApi.courses({ page: 1, pageSize: 100 });
  const rest = await Promise.all(Array.from({ length: Math.max(0, first.totalPages - 1) }, (_, i) => meApi.courses({ page: i + 2, pageSize: 100 })));
  return [first, ...rest].flatMap((page) => page.items);
}
