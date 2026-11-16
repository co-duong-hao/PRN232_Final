import { Button, Modal, Space, Spin } from "antd";
import { useCallback, useState, type ReactNode } from "react";
import { roomsApi, type GroupType, type Room, type RoomSummary } from "@/api";
import { RoomCompositionSummary } from "@/features/student/RoomCompositionSummary";
import { TableSkeleton } from "@/features/WorkspaceSkeletons";
import { StaffLoadError } from "./StaffLoadError";
import { useStaffQuery } from "./useStaffQuery";

export function StaffRoomDetails({
  room,
  groupType,
  renderMembers,
}: {
  room: RoomSummary;
  groupType?: GroupType;
  renderMembers: (members: Room["members"]) => ReactNode;
}) {
  const [showComposition, setShowComposition] = useState(false);
  const loadDetails = useCallback(() => roomsApi.get(room.id), [room.id]);
  const loadComposition = useCallback(() => roomsApi.composition(room.id), [room.id]);
  const details = useStaffQuery(loadDetails);
  const composition = useStaffQuery(showComposition ? loadComposition : null);
  const currentRoom = details.data ?? room;
  const refreshComposition = () => {
    details.reload();
    composition.reload();
  };

  return (
    <>
      {details.failure ? (
        <StaffLoadError
          title="Không tải được thành viên"
          error={details.failure.error}
          onRetry={details.reload}
        />
      ) : details.loading ? (
        <TableSkeleton
          scrollX={480}
          size="small"
          rows={3}
          columns={[
            { title: "Mã SV", kind: "code" },
            { title: "Họ tên", kind: "text" },
            { title: "Ngành", kind: "code" },
            { title: "Vai trò", kind: "text" },
          ]}
        />
      ) : details.data ? (
        renderMembers(details.data.members)
      ) : null}
      <Button
        onClick={() => {
          details.reload();
          setShowComposition(true);
        }}
        style={{ marginTop: 8 }}
      >
        Kiểm tra cơ cấu phòng
      </Button>
      <Modal
        title={`Kiểm tra cơ cấu: ${currentRoom.name || currentRoom.code}`}
        open={showComposition}
        width={560}
        destroyOnHidden
        onCancel={() => setShowComposition(false)}
        footer={
          <Space wrap>
            <Button onClick={refreshComposition} disabled={composition.loading}>
              Kiểm tra lại
            </Button>
            <Button type="primary" onClick={() => setShowComposition(false)}>
              Đóng
            </Button>
          </Space>
        }
      >
        {composition.loading && <Spin aria-label="Đang kiểm tra cơ cấu" />}
        {composition.failure && (
          <StaffLoadError
            title="Không kiểm tra được cơ cấu"
            error={composition.failure.error}
            onRetry={refreshComposition}
          />
        )}
        {composition.data && (
          <RoomCompositionSummary
            composition={composition.data}
            groupType={groupType}
            majorCounts={currentRoom.majors}
          />
        )}
      </Modal>
    </>
  );
}
