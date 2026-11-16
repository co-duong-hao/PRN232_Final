import "@/features/workspace.css";
import {
  BookOutlined,
  ClockCircleOutlined,
  HomeOutlined,
  PlusOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { useCallback, useEffect, useState } from "react";
import { Button, Card, Pagination, Space, Statistic, Tag, Tooltip, Typography } from "antd";
import { useNavigate } from "react-router-dom";
import { meApi } from "@/api";
import type { MyCourse } from "@/api";
import { EmptyState } from "@/components/EmptyState";
import { CourseStatusTag, RoomStatusTag } from "@/components/StatusTag";
import { formatDateTime, formatDeadlineRemaining } from "@/components/format";
import { useShowError } from "@/components/useApiAction";
import { CreateRoomModal } from "@/features/student/CreateRoomModal";
import { loadAllMyCourses } from "@/features/student/loadMyCourses";
import { CourseGridSkeleton, MetricsSkeleton } from "@/features/WorkspaceSkeletons";

export function MyCoursesPage() {
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [allCourses, setAllCourses] = useState<MyCourse[]>([]);
  const [pending, setPending] = useState(0);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [items, setItems] = useState<MyCourse[]>([]);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const showError = useShowError();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await meApi.courses({ page, pageSize: size });
      setItems(data.items);
      setTotal(data.totalItems);
    } catch (e) {
      showError(e);
    } finally {
      setLoading(false);
    }
  }, [page, size, showError]);

  useEffect(() => {
    setMetricsLoading(true);
    Promise.all([loadAllMyCourses(), meApi.applies({ status: "Pending", pageSize: 1 })])
      .then(([courses, applies]) => {
        setAllCourses(courses);
        setPending(applies.totalItems);
      })
      .catch(showError)
      .finally(() => setMetricsLoading(false));
  }, [showError]);

  useEffect(() => {
    void load();
  }, [load]);

  const eligibleCourses = allCourses.filter((c) => c.status === "Forming" && !c.myRoom && !c.myGroup);
  const activeRooms = allCourses.filter((c) => c.myRoom && !c.myGroup);
  const formedGroups = allCourses.filter((c) => c.myGroup);
  const canCreateAny = eligibleCourses.length > 0;

  const createButton = (
    <Button
      type="primary"
      icon={<PlusOutlined />}
      disabled={!metricsLoading && !canCreateAny}
      onClick={() => setCreateOpen(true)}
    >
      Tạo nhóm mới
    </Button>
  );

  return (
    <div className="workspace-page">
      <header className="workspace-heading">
        <div>
          <span className="workspace-heading__eyebrow">Sinh viên</span>
          <Typography.Title level={1}>Học phần của tôi</Typography.Title>
          <p>Theo dõi tiến độ ghép nhóm và truy cập nhanh phòng hoặc nhóm trong từng học phần.</p>
        </div>
        {!metricsLoading && !canCreateAny ? (
          <Tooltip title="Bạn đã tham gia phòng hoặc nhóm ở tất cả học phần đang mở.">
            <span>{createButton}</span>
          </Tooltip>
        ) : (
          createButton
        )}
      </header>

      <CreateRoomModal open={createOpen} onClose={() => setCreateOpen(false)} />

      {metricsLoading ? (
        <MetricsSkeleton count={4} />
      ) : (
        <div className="workspace-metrics">
          <Card className="workspace-metric-card">
            <div className="workspace-metric">
              <Statistic title="Tổng học phần" value={allCourses.length} />
              <span className="workspace-metric-icon" aria-hidden="true">
                <BookOutlined />
              </span>
            </div>
          </Card>

          <Card
            className={
              formedGroups.length === 1
                ? "workspace-metric-card workspace-metric-card--clickable"
                : "workspace-metric-card"
            }
            onClick={() => {
              if (formedGroups.length === 1 && formedGroups[0].myGroup) {
                navigate(`/student/groups/${formedGroups[0].myGroup.id}`);
              }
            }}
          >
            <div className="workspace-metric">
              <div>
                <Statistic title="Đã có nhóm" value={formedGroups.length} />
                {formedGroups.length === 1 && <div className="workspace-metric-hint">Mở trang nhóm</div>}
              </div>
              <span className="workspace-metric-icon" aria-hidden="true">
                <TeamOutlined />
              </span>
            </div>
          </Card>

          <Card
            className={
              activeRooms.length === 1
                ? "workspace-metric-card workspace-metric-card--clickable"
                : "workspace-metric-card"
            }
            onClick={() => {
              if (activeRooms.length === 1 && activeRooms[0].myRoom) {
                navigate(`/student/rooms/${activeRooms[0].myRoom.id}`);
              }
            }}
          >
            <div className="workspace-metric">
              <div>
                <Statistic title="Đang ở phòng" value={activeRooms.length} />
                {activeRooms.length === 1 && <div className="workspace-metric-hint">Vào phòng ngay</div>}
              </div>
              <span className="workspace-metric-icon" aria-hidden="true">
                <HomeOutlined />
              </span>
            </div>
          </Card>

          <Card
            className="workspace-metric-card workspace-metric-card--clickable"
            onClick={() => navigate("/student/applies")}
          >
            <div className="workspace-metric">
              <div>
                <Statistic title="Đơn đang chờ" value={pending} />
                <div className="workspace-metric-hint">Xem đơn của tôi</div>
              </div>
              <span className="workspace-metric-icon" aria-hidden="true">
                <ClockCircleOutlined />
              </span>
            </div>
          </Card>
        </div>
      )}

      <Typography.Title level={2}>Danh sách học phần tham gia</Typography.Title>

      {loading ? (
        <CourseGridSkeleton count={3} />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            title="Bạn chưa được ghi danh học phần nào"
            description="Khi được thêm vào học phần EXE101 hoặc EXE201, danh sách sẽ hiển thị tại đây."
          />
        </Card>
      ) : (
        <div className="workspace-course-grid">
          {items.map((c) => {
            const remaining = formatDeadlineRemaining(c.deadline);
            return (
              <Card key={c.id} title={c.code} extra={<CourseStatusTag status={c.status} />}>
                <div className="workspace-course-card__meta">
                  <div>
                    Loại nhóm: <strong>{c.groupTypeName}</strong>
                  </div>
                  <div>
                    Hạn ghép nhóm: <strong>{formatDateTime(c.deadline)}</strong>{" "}
                    {remaining && c.status === "Forming" && <Tag>{remaining}</Tag>}
                  </div>
                  <div>
                    Sĩ số học phần: <strong>{c.studentCount} sinh viên</strong>
                  </div>
                  {c.status !== "Forming" && (
                    <Typography.Text type="secondary">
                      {c.status === "Planned"
                        ? "Học phần chưa mở ghép nhóm."
                        : "Học phần đã kết thúc thời gian ghép nhóm."}
                    </Typography.Text>
                  )}
                </div>

                {c.myGroup ? (
                  <div className="workspace-course-card__status workspace-course-card__status--active">
                    <div>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        Trạng thái của bạn
                      </Typography.Text>
                      <div>
                        <strong>Đã vào nhóm: {c.myGroup.name || c.myGroup.code}</strong>
                      </div>
                    </div>
                    <Button type="primary" onClick={() => navigate(`/student/groups/${c.myGroup!.id}`)}>
                      Xem nhóm
                    </Button>
                  </div>
                ) : c.myRoom ? (
                  <div className="workspace-course-card__status workspace-course-card__status--active">
                    <div>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        Trạng thái của bạn
                      </Typography.Text>
                      <Space wrap size={6} style={{ marginTop: 2 }}>
                        <strong>Phòng: {c.myRoom.name || c.myRoom.code}</strong>
                        <RoomStatusTag status={c.myRoom.status} />
                      </Space>
                    </div>
                    <Space wrap>
                      <Button type="primary" onClick={() => navigate(`/student/rooms/${c.myRoom!.id}`)}>
                        Vào phòng của tôi
                      </Button>
                      <Button onClick={() => navigate(`/student/courses/${c.id}`)}>
                        Xem danh sách phòng
                      </Button>
                    </Space>
                  </div>
                ) : (
                  <div className="workspace-course-card__status">
                    <div>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        Trạng thái của bạn
                      </Typography.Text>
                      <div>
                        <strong>Chưa tham gia phòng nào</strong>
                      </div>
                    </div>
                    <Button
                      type={c.status === "Forming" ? "primary" : "default"}
                      onClick={() => navigate(`/student/courses/${c.id}`)}
                    >
                      {c.status === "Forming" ? "Tìm nhóm ngay" : "Xem danh sách phòng"}
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {total > 0 && (
        <Pagination
          current={page}
          pageSize={size}
          total={total}
          showSizeChanger
          disabled={loading}
          onChange={(p, s) => {
            setPage(p);
            setSize(s);
          }}
        />
      )}
    </div>
  );
}
