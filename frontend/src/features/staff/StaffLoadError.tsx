import { Alert, Button } from "antd";
import { ApiError } from "@/api";
import { useI18n } from "@/i18n";

export function StaffLoadError({
  title,
  error,
  onRetry,
}: {
  title: string;
  error: unknown;
  onRetry: () => void;
}) {
  const { t, language } = useI18n();

  const describe = (err: unknown) => {
    if (!(err instanceof ApiError)) {
      return language === "en" ? "Please try again later." : "Vui lòng thử lại sau.";
    }
    if (err.status === 503 && err.code === "MATCHING_UNAVAILABLE") {
      return language === "en" ? "Matching service is not responding." : "Dịch vụ ghép nhóm không phản hồi.";
    }
    return /^BR\d+$/.test(err.code) ? `[${err.code}] ${err.message}` : err.message;
  };

  return (
    <Alert
      type="error"
      message={title}
      description={
        <>
          <div>{describe(error)}</div>
          <Button size="small" onClick={onRetry} style={{ marginTop: 8 }}>
            {t.common.retry}
          </Button>
        </>
      }
    />
  );
}
