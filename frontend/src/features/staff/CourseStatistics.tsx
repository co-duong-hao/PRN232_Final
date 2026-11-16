import { Button, Card, Col, Progress, Row, Space, Statistic, Typography } from "antd";
import type { CourseStats, RoomStatus } from "@/api";
import { EmptyState } from "@/components/EmptyState";
import { getRoomStatusLabels } from "@/components/labels";
import { RoomStatusTag } from "@/components/StatusTag";
import { useI18n, type Language } from "@/i18n";

const roomStatuses: RoomStatus[] = ["Open", "Locked", "Completed", "Cancelled"];

function downloadStatistics(
  courseCode: string,
  stats: CourseStats,
  unassigned: number,
  visibleStatuses: RoomStatus[],
  lang: Language,
) {
  const labels = getRoomStatusLabels(lang);
  const isEn = lang === "en";
  const rows = [
    [isEn ? "Metric" : "Chỉ số", isEn ? "Value" : "Giá trị"],
    [isEn ? "Total Students" : "Tổng sinh viên", stats.totalStudents],
    [isEn ? "Unassigned" : "Chưa có phòng", unassigned],
    [isEn ? "In Room" : "Đã vào phòng", stats.studentsInRoom],
    [isEn ? "In Group" : "Đã có nhóm", stats.studentsInGroup],
    [isEn ? "Official Groups Count" : "Số nhóm chính thức", stats.groupCount],
    ...visibleStatuses.map((status) => [
      `${isEn ? "Room" : "Phòng"} ${labels[status].text.toLowerCase()}`,
      stats.roomsByStatus[status] ?? 0,
    ]),
  ];
  const csv = rows
    .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
  const link = document.createElement("a");
  link.href = `data:text/csv;charset=utf-8,${encodeURIComponent(`\uFEFF${csv}\r\n`)}`;
  link.download = `${isEn ? "stats" : "thong-ke"}-${courseCode.replace(/[^a-zA-Z0-9_-]/g, "-")}.csv`;
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
  const { t, language } = useI18n();
  const unassigned = Math.max(0, stats.totalStudents - stats.studentsInRoom);
  const progress =
    stats.totalStudents > 0 ? Math.round((stats.studentsInGroup / stats.totalStudents) * 100) : 0;
  const visibleStatuses = roomStatuses.filter((status) => status !== "Cancelled" || canSeeCancelled);

  return (
    <Space direction="vertical" size={16} style={{ display: "flex" }}>
      <Row align="middle" justify="space-between" gutter={[12, 12]}>
        <Col>
          <Typography.Title level={3} style={{ margin: 0 }}>
            {language === "en" ? "Matching Progress" : "Tiến độ ghép nhóm"}
          </Typography.Title>
        </Col>
        <Col>
          <Space wrap>
            <Button
              onClick={() => downloadStatistics(courseCode, stats, unassigned, visibleStatuses, language)}
            >
              {language === "en" ? "Export CSV" : "Tải CSV"}
            </Button>
            <Button onClick={onRefresh}>
              {language === "en" ? "Refresh Statistics" : "Làm mới thống kê"}
            </Button>
          </Space>
        </Col>
      </Row>
      <Row gutter={[12, 12]}>
        {[
          { label: t.courseStats.statTotalStudents, value: stats.totalStudents },
          {
            label: t.courseStats.statUnassigned,
            value: unassigned,
            link: language === "en" ? "View students" : "Xem sinh viên",
            action: onShowUnassigned,
          },
          { label: t.courseStats.statInRoom, value: stats.studentsInRoom },
          { label: t.courseStats.statInGroup, value: stats.studentsInGroup },
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
      <Card size="small" title={language === "en" ? "Formed Team Ratio" : "Tỷ lệ sinh viên đã có nhóm"}>
        {stats.totalStudents > 0 ? (
          <>
            <Progress
              percent={progress}
              status="normal"
              strokeColor="#c2410c"
              aria-label={language === "en" ? "Formed team ratio" : "Tỷ lệ sinh viên đã có nhóm"}
            />
            <Typography.Text type="secondary">
              {language === "en"
                ? `${stats.studentsInGroup}/${stats.totalStudents} students are in groups. Students in official groups are also counted in room enrollments.`
                : `${stats.studentsInGroup}/${stats.totalStudents} sinh viên đã có nhóm. Sinh viên đã có nhóm vẫn được tính trong số đã vào phòng.`}
            </Typography.Text>
          </>
        ) : (
          <EmptyState
            title={language === "en" ? "No students enrolled in this course" : "Học phần chưa có sinh viên"}
          />
        )}
      </Card>
      <Row gutter={[12, 12]}>
        <Col xs={24} md={15}>
          <Card size="small" title={t.courseStats.roomsByStatusTitle}>
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
          <Card
            size="small"
            title={language === "en" ? "Official Groups" : "Nhóm chính thức"}
            style={{ height: "100%" }}
          >
            <Space wrap>
              <Statistic value={stats.groupCount} />
              <Button type="link" onClick={onShowGroups}>
                {language === "en" ? "View groups" : "Xem nhóm"}
              </Button>
            </Space>
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
