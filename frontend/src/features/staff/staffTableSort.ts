import type { PageParams } from "@/api";

export function staffSortOrder(params: PageParams, field: string) {
  if (params.sortBy !== field || !params.sortDir) return null;
  return params.sortDir === "asc" ? "ascend" : "descend";
}
