import { Button, Modal, Spin, Typography } from "antd";
import { useCallback, useState, type ReactNode } from "react";
import { roomsApi, type Room } from "@/api";
import { StaffLoadError } from "./StaffLoadError";
import { useStaffQuery } from "./useStaffQuery";

export function StaffRoomDetails({
  roomId,
  renderMembers,
}: {
  roomId: string;
  renderMembers: (members: Room["members"]) => ReactNode;
}) {
  const [showComposition, setShowComposition] = useState(false);
  const loadDetails = useCallback(() => roomsApi.get(roomId), [roomId]);
  const loadComposition = useCallback(() => roomsApi.composition(roomId), [roomId]);
  const details = useStaffQuery(loadDetails);
  const composition = useStaffQuery(showComposition ? loadComposition : null);

  return (
    <>
      {details.failure ? (
        <StaffLoadError
          title="Không tải được thành viên"
          error={details.failure.error}
          onRetry={details.reload}
        />
      ) : details.loading ? (
        <Spin aria-label="Đang tải thành viên" />
      ) : details.data ? (
        renderMembers(details.data.members)
      ) : null}
      <Button onClick={() => setShowComposition(true)} style={{ marginTop: 8 }}>
        Kiểm tra cơ cấu
      </Button>
      <Modal
        title="Kiểm tra cơ cấu"
        open={showComposition}
        onCancel={() => setShowComposition(false)}
        footer={<Button onClick={() => setShowComposition(false)}>Đóng</Button>}
      >
        {composition.loading && <Spin aria-label="Đang kiểm tra cơ cấu" />}
        {composition.failure && (
          <StaffLoadError
            title="Không kiểm tra được cơ cấu"
            error={composition.failure.error}
            onRetry={composition.reload}
          />
        )}
        {composition.data && (
          <>
            <Typography.Paragraph>
              {composition.data.satisfied ? "Cơ cấu đạt yêu cầu" : "Cơ cấu chưa đạt yêu cầu"}
            </Typography.Paragraph>
            {composition.data.violations.length > 0 && (
              <ul>
                {composition.data.violations.map((violation, index) => (
                  <li key={index}>{violation}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
