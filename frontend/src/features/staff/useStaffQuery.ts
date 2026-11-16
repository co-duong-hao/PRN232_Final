import { useCallback, useEffect, useMemo, useState } from "react";

type QueryResult<T> = { status: "ready"; data: T } | { status: "error"; error: unknown };

export function useStaffQuery<T>(request: (() => Promise<T>) | null) {
  const [revision, setRevision] = useState(0);
  // Reopening a tab creates a fresh query, even if it uses the same request and filters.
  const query = useMemo(() => ({ request, revision }), [request, revision]);
  const [response, setResponse] = useState<{
    query: typeof query;
    result: QueryResult<T>;
  }>();
  const reload = useCallback(() => setRevision((current) => current + 1), []);

  useEffect(() => {
    if (!query.request) return;
    let active = true;
    const finish = (result: QueryResult<T>) => {
      if (active) setResponse({ query, result });
    };
    query.request().then(
      (data) => finish({ status: "ready", data }),
      (error: unknown) => finish({ status: "error", error }),
    );
    return () => {
      active = false;
    };
  }, [query]);

  const result = response?.query === query ? response.result : undefined;
  return {
    loading: request !== null && result === undefined,
    data: result?.status === "ready" ? result.data : undefined,
    failure: result?.status === "error" ? result : undefined,
    reload,
  };
}
