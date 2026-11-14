import "@/features/workspace.css";
import {
  ArrowRightOutlined,
  BookOutlined,
  TeamOutlined,
  HomeOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
import { useCallback, useEffect, useState } from "react";
import { Button, Card, Empty, Pagination, Space, Spin, Statistic, Typography } from "antd";
import { loadAllMyCourses } from "@/features/student/loadMyCourses";
import { CreateRoomModal } from "@/features/student/CreateRoomModal";
import { Link } from "react-router-dom";
import { meApi } from "@/api";
import type { MyCourse } from "@/api";
import { CourseStatusTag, RoomStatusTag } from "@/components/StatusTag";
import { formatDateTime } from "@/components/format";
import { useShowError } from "@/components/useApiAction";

export function MyCoursesPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [allCourses, setAllCourses] = useState<MyCourse[]>([]);
  const [pending, setPending] = useState(0);
  const [items, setItems] = useState<MyCourse[]>([]);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
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
    Promise.all([loadAllMyCourses(), meApi.applies({ status: "Pending", pageSize: 1 })])
      .then(([courses, applies]) => {
        setAllCourses(courses);
        setPending(applies.totalItems);
      })
      .catch(showError);
  }, [showError]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <div className="workspace-page">
      <header className="workspace-heading">
        <div>
          <Typography.Title level={1}>Course của tôi</Typography.Title>
          <p>Xem tiến độ ghép nhóm theo từng Course.</p>
        </div>
        <Button type="primary" onClick={() => setCreateOpen(true)}>
          + Tạo nhóm
        </Button>
      </header>
      <CreateRoomModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <div className="workspace-metrics">
        {[
          { title: "Số Course", value: allCourses.length, icon: <BookOutlined /> },
          { title: "Đã có nhóm", value: allCourses.filter((c) => c.myGroup).length, icon: <TeamOutlined /> },
          {
            title: "Đang ở phòng",
            value: allCourses.filter((c) => c.myRoom && !c.myGroup).length,
            icon: <HomeOutlined />,
          },
          { title: "Đơn đang chờ", value: pending, icon: <ClockCircleOutlined /> },
        ].map((item) => (
          <Card key={item.title}>
            <div className="workspace-metric">
              <Statistic title={item.title} value={item.value} />
              <span className="workspace-metric-icon" aria-hidden="true">
                {item.icon}
              </span>
            </div>
          </Card>
        ))}
      </div>
      <Typography.Title level={2}>Nhóm của tôi</Typography.Title>
      <Spin spinning={loading}>
        <div className="workspace-course-grid">
          {!loading && items.length === 0 && <Empty description="Chưa có Course" />}
          {items.map((c) => (
            <Card key={c.id} title={c.code} extra={<CourseStatusTag status={c.status} />}>
              <Space direction="vertical">
                <span>Loại nhóm: {c.groupTypeName}</span>
                <span>Hạn ghép nhóm: {formatDateTime(c.deadline)}</span>
                <span>Số sinh viên: {c.studentCount}</span>
                {c.status !== "Forming" && (
                  <Typography.Text type="secondary">Chưa mở / đã đóng ghép nhóm</Typography.Text>
                )}
                {c.myGroup ? (
                  <>
                    <span>Đã có nhóm {c.myGroup.name || c.myGroup.code}</span>
                    <Link className="workspace-action-link" to={`/student/groups/${c.myGroup.id}`}>
                      Xem nhóm
                    </Link>
                  </>
                ) : c.myRoom ? (
                  <>
                    <span>
                      Đang ở phòng {c.myRoom.name || c.myRoom.code} <RoomStatusTag status={c.myRoom.status} />
                    </span>
                    <Link
                      className="workspace-action-link workspace-action-link-primary"
                      to={`/student/rooms/${c.myRoom.id}`}
                    >
                      Vào phòng của tôi
                      <ArrowRightOutlined aria-hidden="true" />
                    </Link>
                  </>
                ) : (
                  <>
                    <span>Chưa có phòng</span>
                    <Link className="workspace-action-link" to={`/student/courses/${c.id}`}>
                      Tìm phòng
                    </Link>
                  </>
                )}
              </Space>
            </Card>
          ))}
        </div>
        {total > 0 && (
          <Pagination
            current={page}
            pageSize={size}
            total={total}
            showSizeChanger
            onChange={(p, s) => {
              setPage(p);
              setSize(s);
            }}
          />
        )}
      </Spin>
    </div>
  );
}
