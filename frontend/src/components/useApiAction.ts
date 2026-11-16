import { App } from "antd";
import { useCallback, useState } from "react";
import { ApiError } from "@/api/client";
import { useI18n } from "@/i18n";

/** Shows a backend error as a toast, with the rule code when there is one (e.g. "BR05"). */
export function useShowError() {
  const { message } = App.useApp();
  const { t } = useI18n();
  return useCallback(
    (error: unknown) => {
      if (error instanceof ApiError) {
        const showCode = /^BR\d+$/.test(error.code);
        message.error(showCode ? `[${error.code}] ${error.message}` : error.message, 5);
      } else {
        message.error(t.common.genericError);
      }
    },
    [message, t],
  );
}

/**
 * Wraps a mutation: tracks loading, shows the error toast, and shows `success` when it resolves.
 * Usage: const [join, joining] = useApiAction(() => roomsApi.join(id), "Đã vào phòng");
 */
export function useApiAction<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>,
  success?: string,
): [(...args: TArgs) => Promise<TResult | undefined>, boolean] {
  const { message } = App.useApp();
  const showError = useShowError();
  const [running, setRunning] = useState(false);

  const run = useCallback(
    async (...args: TArgs) => {
      setRunning(true);
      try {
        const result = await action(...args);
        if (success) message.success(success);
        return result;
      } catch (error) {
        showError(error);
        return undefined;
      } finally {
        setRunning(false);
      }
    },
    [action, success, message, showError],
  );

  return [run, running];
}
