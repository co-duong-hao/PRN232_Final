import { Button, Modal, Space, Spin } from "antd";
import { useCallback, useState, type ReactNode } from "react";
import { roomsApi, type GroupType, type Room, type RoomSummary } from "@/api";
import { RoomCompositionSummary } from "@/features/student/RoomCompositionSummary";
import { TableSkeleton } from "@/features/WorkspaceSkeletons";
import { useI18n } from "@/i18n";
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
  const { t, language } = useI18n();
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
          title={t.staffRoomDetails.errorLoadMembers}
          error={details.failure.error}
          onRetry={details.reload}
        />
      ) : details.loading ? (
        <TableSkeleton
          scrollX={480}
          size="small"
          rows={3}
          columns={[
            { title: t.staffRoomDetails.colStudentCode, kind: "code" },
            { title: t.staffRoomDetails.colFullName, kind: "text" },
            { title: t.staffRoomDetails.colMajor, kind: "code" },
            { title: t.staffRoomDetails.colRole, kind: "text" },
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
        {t.staffRoomDetails.btnCheckComposition}
      </Button>
      <Modal
        title={t.staffRoomDetails.modalCompositionTitle(currentRoom.name || currentRoom.code)}
        open={showComposition}
        width={560}
        destroyOnHidden
        onCancel={() => setShowComposition(false)}
        footer={
          <Space wrap>
            <Button onClick={refreshComposition} disabled={composition.loading}>
              {language === "en" ? "Recheck" : "Kiểm tra lại"}
            </Button>
            <Button type="primary" onClick={() => setShowComposition(false)}>
              {t.staffRoomDetails.modalClose}
            </Button>
          </Space>
        }
      >
        {composition.loading && (
          <Spin aria-label={language === "en" ? "Checking composition" : "Đang kiểm tra cơ cấu"} />
        )}
        {composition.failure && (
          <StaffLoadError
            title={t.staffRoomDetails.errorCheckComposition}
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
