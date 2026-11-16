import "@/features/workspace.css";
import { useCallback, useEffect, useState } from "react";
import { Button, Card, Popconfirm, Select, Space, Table, Typography } from "antd";
import { Link, useNavigate } from "react-router-dom";
import { appliesApi, meApi } from "@/api";
import type { ApplyStatus, RoomApply } from "@/api";
import { EmptyState } from "@/components/EmptyState";
import { ApplyStatusTag } from "@/components/StatusTag";
import { applyStatusLabel } from "@/components/labels";
import { formatDateTime } from "@/components/format";
import { useApiAction, useShowError } from "@/components/useApiAction";
import { TableSkeleton } from "@/features/WorkspaceSkeletons";

export function MyAppliesPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<RoomApply[]>([]);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<ApplyStatus>();
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string>();
  const showError = useShowError();
  const [cancel] = useApiAction(appliesApi.cancel, "Đã hủy đơn xin vào phòng");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await meApi.applies({ page, pageSize: size, status });
      setItems(data.items);
      setTotal(data.totalItems);
    } catch (e) {
      showError(e);
    } finally {
      setLoading(false);
    }
  }, [page, size, status, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="workspace-page">
      <header className="workspace-heading">
        <div>
          <span className="workspace-heading__eyebrow">Sinh viên</span>
          <Typography.Title level={1}>Đơn xin vào phòng</Typography.Title>
          <p>Theo dõi trạng thái các đơn bạn đã gửi tới các phòng đang khóa.</p>
        </div>
        <Button onClick={() => navigate("/student/courses")}>Tìm phòng theo học phần</Button>
      </header>

      <Space wrap className="workspace-toolbar">
        <Select
          allowClear
          aria-label="Lọc theo trạng thái đơn"
          placeholder="Tất cả trạng thái"
          style={{ width: 200 }}
          value={status}
          onChange={(s) => {
            setStatus(s);
            setPage(1);
          }}
          options={Object.entries(applyStatusLabel).map(([value, label]) => ({ value, label: label.text }))}
        />
      </Space>

      {loading ? (
        <TableSkeleton
          scrollX={720}
          rows={5}
          pagination={{ current: page, pageSize: size, total }}
          columns={[
            { title: "Phòng", kind: "code" },
            { title: "Trạng thái", kind: "tag" },
            { title: "Lời nhắn", kind: "longText" },
            { title: "Ngày gửi", kind: "date" },
            { title: "Ngày xử lý", kind: "date" },
            { title: "Thao tác", kind: "actions", actionWidths: [84] },
          ]}
        />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            title="Chưa có đơn xin vào phòng"
            description={
              status
                ? "Không có đơn nào ở trạng thái đã chọn."
                : "Khi gửi đơn vào một phòng đang khóa, trạng thái duyệt sẽ hiển thị tại đây."
            }
            action={
              status ? (
                <Button onClick={() => setStatus(undefined)}>Xem tất cả trạng thái</Button>
              ) : (
                <Button type="primary" onClick={() => navigate("/student/courses")}>
                  Đi tới Học phần của tôi
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <Table
          scroll={{ x: 720 }}
          rowKey="id"
          dataSource={items}
          pagination={{
            current: page,
            pageSize: size,
            total,
            showSizeChanger: true,
            onChange: (p, s) => {
              setPage(p);
              setSize(s);
            },
          }}
          columns={[
            {
              title: "Phòng",
              render: (_, a) => <Link to={`/student/rooms/${a.roomId}`}>{a.roomCode}</Link>,
            },
            { title: "Trạng thái", render: (_, a) => <ApplyStatusTag status={a.status} /> },
            { title: "Lời nhắn", dataIndex: "message", render: (v: string) => v || "—" },
            { title: "Ngày gửi", render: (_, a) => formatDateTime(a.createdAt) },
            { title: "Ngày xử lý", render: (_, a) => formatDateTime(a.decidedAt) },
            {
              title: "Thao tác",
              render: (_, a) =>
                a.status === "Pending" && (
                  <Popconfirm
                    title="Hủy đơn xin vào phòng này?"
                    onConfirm={async () => {
                      setCancellingId(a.id);
                      try {
                        if (await cancel(a.id)) await load();
                      } finally {
                        setCancellingId(undefined);
                      }
                    }}
                    okText="Hủy đơn"
                    cancelText="Đóng"
                  >
                    <Button danger loading={cancellingId === a.id}>
                      Hủy đơn
                    </Button>
                  </Popconfirm>
                ),
            },
          ]}
        />
      )}
    </div>
  );
}
