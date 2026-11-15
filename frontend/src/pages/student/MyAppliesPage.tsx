import { useCallback, useEffect, useState } from "react";
import { Button, Empty, Popconfirm, Select, Space, Table, Typography } from "antd";
import { Link } from "react-router-dom";
import { appliesApi, meApi } from "@/api";
import type { ApplyStatus, RoomApply } from "@/api";
import { ApplyStatusTag } from "@/components/StatusTag";
import { applyStatusLabel } from "@/components/labels";
import { formatDateTime } from "@/components/format";
import { useApiAction, useShowError } from "@/components/useApiAction";

export function MyAppliesPage() {
  const [items, setItems] = useState<RoomApply[]>([]);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<ApplyStatus>();
  const [loading, setLoading] = useState(false);
  const showError = useShowError();
  const [cancel, cancelling] = useApiAction(appliesApi.cancel, "Đã hủy đơn");
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
    <>
      <Typography.Title level={2}>Đơn của tôi</Typography.Title>
      <Space direction="vertical" style={{ width: "100%" }}>
        <Select
          allowClear
          placeholder="Tất cả trạng thái"
          style={{ width: 200 }}
          value={status}
          onChange={(s) => {
            setStatus(s);
            setPage(1);
          }}
          options={Object.entries(applyStatusLabel).map(([value, label]) => ({ value, label: label.text }))}
        />
        <Table
          rowKey="id"
          loading={loading}
          dataSource={items}
          locale={{ emptyText: <Empty description="Không có đơn" /> }}
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
            { title: "Phòng", render: (_, a) => <Link to={`/student/rooms/${a.roomId}`}>{a.roomCode}</Link> },
            { title: "Trạng thái", render: (_, a) => <ApplyStatusTag status={a.status} /> },
            { title: "Lời nhắn", dataIndex: "message" },
            { title: "Ngày gửi", render: (_, a) => formatDateTime(a.createdAt) },
            { title: "Ngày xử lý", render: (_, a) => formatDateTime(a.decidedAt) },
            {
              title: "Thao tác",
              render: (_, a) =>
                a.status === "Pending" && (
                  <Popconfirm
                    title="Hủy đơn này?"
                    onConfirm={async () => {
                      if (await cancel(a.id)) await load();
                    }}
                    okText="Hủy đơn"
                    cancelText="Đóng"
                  >
                    <Button loading={cancelling}>Hủy đơn</Button>
                  </Popconfirm>
                ),
            },
          ]}
        />
      </Space>
    </>
  );
}
