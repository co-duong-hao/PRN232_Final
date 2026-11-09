import { Button, Card, Col, Empty, Progress, Row, Space, Statistic, Typography } from "antd";
import type { CourseStats, RoomStatus } from "@/api";
import { roomStatusLabel } from "@/components/labels";
import { RoomStatusTag } from "@/components/StatusTag";

const roomStatuses: RoomStatus[] = ["Open", "Locked", "Completed", "Cancelled"];

function downloadStatistics(
  courseCode: string,
  stats: CourseStats,
  unassigned: number,
  visibleStatuses: RoomStatus[],
) {
  const rows = [
    ["Chỉ số", "Giá trị"],
    ["Tổng sinh viên", stats.totalStudents],
    ["Chưa có phòng", unassigned],
    ["Đã vào phòng", stats.studentsInRoom],
    ["Đã có nhóm", stats.studentsInGroup],
    ["Số nhóm chính thức", stats.groupCount],
    ...visibleStatuses.map((status) => [
      `Phòng ${roomStatusLabel[status].text.toLowerCase()}`,
      stats.roomsByStatus[status] ?? 0,
    ]),
  ];
  const csv = rows
    .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
  const link = document.createElement("a");
  link.href = `data:text/csv;charset=utf-8,${encodeURIComponent(`\uFEFF${csv}\r\n`)}`;
  link.download = `thong-ke-${courseCode.replace(/[^a-zA-Z0-9_-]/g, "-")}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
}

export function CourseStatistics({
  courseCode,
  stats,
  canSeeCancelled,
  onRefresh,
  onShowUnassigned,
  onShowRooms,
  onShowGroups,
}: {
  courseCode: string;
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
          <Space wrap>
            <Button onClick={() => downloadStatistics(courseCode, stats, unassigned, visibleStatuses)}>
              Tải CSV
            </Button>
            <Button onClick={onRefresh}>Làm mới thống kê</Button>
          </Space>
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
            <Card size="small" style={{ height: "100%" }}>
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
            <Progress percent={progress} status="normal" aria-label="Tỷ lệ sinh viên đã có nhóm" />
            <Typography.Text type="secondary">
              {stats.studentsInGroup}/{stats.totalStudents} sinh viên đã có nhóm. Sinh viên đã có nhóm vẫn
              được tính trong số đã vào phòng.
            </Typography.Text>
          </>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Course chưa có sinh viên" />
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
