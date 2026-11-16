import { useCallback, useEffect, useState } from "react";

type QueryResult<T> = { status: "ready"; data: T } | { status: "error"; error: unknown };

export function useStaffQuery<T>(request: (() => Promise<T>) | null) {
  const [revision, setRevision] = useState(0);
  const [response, setResponse] = useState<{
    request: () => Promise<T>;
    revision: number;
    result: QueryResult<T>;
  }>();
  const reload = useCallback(() => setRevision((current) => current + 1), []);

  useEffect(() => {
    if (!request) return;
    let active = true;
    const finish = (result: QueryResult<T>) => {
      if (active) setResponse({ request, revision, result });
    };
    request().then(
      (data) => finish({ status: "ready", data }),
      (error: unknown) => finish({ status: "error", error }),
    );
    return () => {
      active = false;
    };
  }, [request, revision]);

  const result =
    response?.request === request && response.revision === revision ? response.result : undefined;
  return {
    loading: request !== null && result === undefined,
    data: result?.status === "ready" ? result.data : undefined,
    failure: result?.status === "error" ? result : undefined,
    reload,
  };
}
