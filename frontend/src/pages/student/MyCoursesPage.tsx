import { useCallback, useEffect, useState } from "react";
import { Button, Card, Empty, Pagination, Space, Spin, Typography } from "antd";
import { Link } from "react-router-dom";
import { meApi } from "@/api";
import type { MyCourse } from "@/api";
import { CourseStatusTag, RoomStatusTag } from "@/components/StatusTag";
import { formatDateTime } from "@/components/format";
import { useShowError } from "@/components/useApiAction";

export function MyCoursesPage() {
  const [items, setItems] = useState<MyCourse[]>([]); const [page, setPage] = useState(1); const [size, setSize] = useState(20); const [total, setTotal] = useState(0); const [loading, setLoading] = useState(false);
  const showError = useShowError();
  const load = useCallback(async () => { setLoading(true); try { const data = await meApi.courses({ page, pageSize: size }); setItems(data.items); setTotal(data.totalItems); } catch (e) { showError(e); } finally { setLoading(false); } }, [page, size, showError]);
  useEffect(() => { void load(); }, [load]);
  return <><Typography.Title level={2}>Course của tôi</Typography.Title><Spin spinning={loading}><Space direction="vertical" size="middle" style={{ width: "100%" }}>{!loading && items.length === 0 && <Empty description="Chưa có Course" />}{items.map(c => <Card key={c.id} title={c.code} extra={<CourseStatusTag status={c.status} />}><Space direction="vertical"><span>Loại nhóm: {c.groupTypeName}</span><span>Hạn ghép nhóm: {formatDateTime(c.deadline)}</span><span>Số sinh viên: {c.studentCount}</span>{c.status !== "Forming" && <Typography.Text type="secondary">Chưa mở / đã đóng ghép nhóm</Typography.Text>}{c.myGroup ? <><span>Đã có nhóm {c.myGroup.code}</span><Link to={`/student/groups/${c.myGroup.id}`}><Button>Xem nhóm</Button></Link></> : c.myRoom ? <><span>Đang ở phòng {c.myRoom.code} <RoomStatusTag status={c.myRoom.status} /></span><Link to={`/student/rooms/${c.myRoom.id}`}><Button>Vào phòng của tôi</Button></Link></> : <><span>Chưa có phòng</span><Link to={`/student/courses/${c.id}`}><Button>Tìm phòng</Button></Link></>}</Space></Card>)}<Pagination current={page} pageSize={size} total={total} showSizeChanger onChange={(p, s) => { setPage(p); setSize(s); }} /></Space></Spin></>;
}
