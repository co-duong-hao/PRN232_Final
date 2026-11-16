import { Button, Card, Col, Progress, Row, Space, Statistic, Typography } from "antd";
import type { CourseStats, RoomStatus } from "@/api";
import { EmptyState } from "@/components/EmptyState";
import { RoomStatusTag } from "@/components/StatusTag";

const roomStatuses: RoomStatus[] = ["Open", "Locked", "Completed", "Cancelled"];

export function CourseStatistics({
  stats,
  canSeeCancelled,
  onRefresh,
  onShowUnassigned,
  onShowRooms,
  onShowGroups,
}: {
  stats: CourseStats;
  canSeeCancelled: boolean;
  onRefresh: () => void;
  onShowUnassigned: () => void;
  onShowRooms: (status: RoomStatus) => void;
  onShowGroups: () => void;
}) {
  const unassigned = Math.max(0, stats.totalStudents - stats.studentsInRoom);
  const progress =
    stats.totalStudents > 0 ? Math.round((stats.studentsInGroup / stats.totalStudents) * 100) : 0;
  const visibleStatuses = roomStatuses.filter((status) => status !== "Cancelled" || canSeeCancelled);

  return (
    <Space direction="vertical" size={16} style={{ display: "flex" }}>
      <Row align="middle" justify="space-between" gutter={[12, 12]}>
        <Col>
          <Typography.Title level={3} style={{ margin: 0 }}>
            Tiến độ ghép nhóm
          </Typography.Title>
        </Col>
        <Col>
          <Button onClick={onRefresh}>Làm mới thống kê</Button>
        </Col>
      </Row>
      <Row gutter={[12, 12]}>
        {[
          { label: "Tổng sinh viên", value: stats.totalStudents },
          { label: "Chưa có phòng", value: unassigned, link: "Xem sinh viên", action: onShowUnassigned },
          { label: "Đã vào phòng", value: stats.studentsInRoom },
          { label: "Đã có nhóm", value: stats.studentsInGroup },
        ].map(({ label, value, link, action }) => (
          <Col xs={12} lg={6} key={label}>
            <Card size="small" className="workspace-metric-card">
              <Statistic title={label} value={value} />
              {action && (
                <Button type="link" onClick={action} style={{ paddingInline: 0, whiteSpace: "normal" }}>
                  {link}
                </Button>
              )}
            </Card>
          </Col>
        ))}
      </Row>
      <Card size="small" title="Tỷ lệ sinh viên đã có nhóm">
        {stats.totalStudents > 0 ? (
          <>
            <Progress
              percent={progress}
              status="normal"
              strokeColor="#c2410c"
              aria-label="Tỷ lệ sinh viên đã có nhóm"
            />
            <Typography.Text type="secondary">
              {stats.studentsInGroup}/{stats.totalStudents} sinh viên đã có nhóm. Sinh viên đã có nhóm vẫn
              được tính trong số đã vào phòng.
            </Typography.Text>
          </>
        ) : (
          <EmptyState title="Học phần chưa có sinh viên" />
        )}
      </Card>
      <Row gutter={[12, 12]}>
        <Col xs={24} md={15}>
          <Card size="small" title="Phòng theo trạng thái">
            <Row gutter={[8, 8]}>
              {visibleStatuses.map((status) => (
                <Col xs={12} key={status}>
                  <Button
                    type="text"
                    onClick={() => onShowRooms(status)}
                    style={{ height: "auto", whiteSpace: "normal", paddingInline: 4 }}
                  >
                    <RoomStatusTag status={status} />
                    <strong>{stats.roomsByStatus[status] ?? 0}</strong>
                  </Button>
                </Col>
              ))}
            </Row>
          </Card>
        </Col>
        <Col xs={24} md={9}>
          <Card size="small" title="Nhóm chính thức" style={{ height: "100%" }}>
            <Space wrap>
              <Statistic value={stats.groupCount} />
              <Button type="link" onClick={onShowGroups}>
                Xem nhóm
              </Button>
            </Space>
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
