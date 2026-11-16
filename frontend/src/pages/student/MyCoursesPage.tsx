import { BookOutlined, TeamOutlined, HomeOutlined, ClockCircleOutlined } from "@ant-design/icons";
import { useCallback, useEffect, useState } from "react";
import { Button, Card, Col, Empty, Pagination, Row, Space, Spin, Statistic, Typography } from "antd";
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
    <>
      <Space style={{ width: "100%", justifyContent: "space-between" }}>
        <Typography.Title level={2}>Course của tôi</Typography.Title>
        <Button type="primary" onClick={() => setCreateOpen(true)}>
          + Tạo nhóm
        </Button>
      </Space>
      <CreateRoomModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
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
          <Col xs={12} md={6} key={item.title}>
            <Card style={{ borderLeft: "4px solid #fa8c16", height: "100%" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <Statistic title={item.title} value={item.value} />
                <span
                  style={{
                    background: "#fff7e6",
                    color: "#fa8c16",
                    borderRadius: 8,
                    padding: 12,
                    height: 44,
                  }}
                >
                  {item.icon}
                </span>
              </div>
            </Card>
          </Col>
        ))}
      </Row>
      <Typography.Title level={3}>Nhóm của tôi</Typography.Title>
      <Spin spinning={loading}>
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
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
                    <Link to={`/student/groups/${c.myGroup.id}`}>
                      <Button>Xem nhóm</Button>
                    </Link>
                  </>
                ) : c.myRoom ? (
                  <>
                    <span>
                      Đang ở phòng {c.myRoom.name || c.myRoom.code} <RoomStatusTag status={c.myRoom.status} />
                    </span>
                    <Link to={`/student/rooms/${c.myRoom.id}`}>
                      <Button>Vào phòng của tôi</Button>
                    </Link>
                  </>
                ) : (
                  <>
                    <span>Chưa có phòng</span>
                    <Link to={`/student/courses/${c.id}`}>
                      <Button>Tìm phòng</Button>
                    </Link>
                  </>
                )}
              </Space>
            </Card>
          ))}
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
        </Space>
      </Spin>
    </>
  );
}
