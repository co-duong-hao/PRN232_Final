import { Alert, Button } from "antd";
import { ApiError } from "@/api";

function describe(error: unknown) {
  if (!(error instanceof ApiError)) return "Vui lòng thử lại sau.";
  if (error.status === 503 && error.code === "MATCHING_UNAVAILABLE")
    return "Dịch vụ ghép nhóm không phản hồi.";
  return /^BR\d+$/.test(error.code) ? `[${error.code}] ${error.message}` : error.message;
}

export function StaffLoadError({
  title,
  error,
  onRetry,
}: {
  title: string;
  error: unknown;
  onRetry: () => void;
}) {
  return (
    <Alert
      showIcon
      type="error"
      message={title}
      description={
        <>
          <div>{describe(error)}</div>
          <Button size="small" onClick={onRetry} style={{ marginTop: 8 }}>
            Thử lại
          </Button>
        </>
      }
    />
  );
}
