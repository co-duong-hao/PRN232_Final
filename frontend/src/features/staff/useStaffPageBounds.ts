import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { PageParams } from "@/api";

export function useStaffPageBounds<T extends PageParams>(
  requestedPage: number | undefined,
  totalPages: number | undefined,
  setParams: Dispatch<SetStateAction<T>>,
) {
  useEffect(() => {
    if (requestedPage === undefined || totalPages === undefined) return;
    const lastPage = Math.max(1, totalPages);
    if (requestedPage > lastPage) {
      setParams((current) => (current.page === requestedPage ? { ...current, page: lastPage } : current));
    }
  }, [requestedPage, totalPages, setParams]);
}
