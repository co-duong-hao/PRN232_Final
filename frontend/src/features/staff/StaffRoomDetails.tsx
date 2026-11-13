import { Alert, Button, Descriptions, Modal, Space, Spin, Typography } from "antd";
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
          <Space direction="vertical" size="middle" style={{ display: "flex" }}>
            <Alert
              showIcon
              type={composition.data.satisfied ? "success" : "warning"}
              message={composition.data.satisfied ? "Cơ cấu đạt yêu cầu" : "Cơ cấu chưa đạt yêu cầu"}
            />
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Số thành viên hiện tại">
                {composition.data.memberCount}
                {composition.data.missingMemberCount > 0 &&
                  ` (cần thêm ${composition.data.missingMemberCount})`}
              </Descriptions.Item>
              <Descriptions.Item label="Số ngành hiện tại">
                {composition.data.distinctMajorCount}
                {composition.data.missingMajorCount > 0 &&
                  ` (cần thêm ${composition.data.missingMajorCount} ngành khác)`}
              </Descriptions.Item>
            </Descriptions>
            {composition.data.violations.length > 0 && (
              <div>
                <Typography.Text strong>Quy định chưa đạt</Typography.Text>
                <ul>
                  {composition.data.violations.map((violation, index) => (
                    <li key={index}>{violation}</li>
                  ))}
                </ul>
              </div>
            )}
          </Space>
        )}
      </Modal>
    </>
  );
}
