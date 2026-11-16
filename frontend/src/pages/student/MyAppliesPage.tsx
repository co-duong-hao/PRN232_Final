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
import { translations, useI18n } from "@/i18n";

export function MyAppliesPage() {
  const navigate = useNavigate();
  const { t, language } = useI18n();
  const [items, setItems] = useState<RoomApply[]>([]);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<ApplyStatus>();
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string>();
  const showError = useShowError();
  const [cancel] = useApiAction(
    appliesApi.cancel,
    language === "en" ? "Application cancelled successfully" : "Đã hủy đơn xin vào phòng",
  );

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
          <span className="workspace-heading__eyebrow">{t.myApplies.eyebrow}</span>
          <Typography.Title level={1}>{t.myApplies.title}</Typography.Title>
          <p>{t.myApplies.subtitle}</p>
        </div>
        <Button onClick={() => navigate("/student/courses")}>{t.myApplies.btnFindRooms}</Button>
      </header>

      <Space wrap className="workspace-toolbar">
        <Select
          allowClear
          aria-label={t.myApplies.filterStatusAria}
          placeholder={t.myApplies.allStatuses}
          style={{ width: 200 }}
          value={status}
          onChange={(s) => {
            setStatus(s);
            setPage(1);
          }}
          options={Object.entries(applyStatusLabel).map(([value, label]) => ({
            value,
            label: translations[language].applyStatus[value as ApplyStatus] ?? label.text,
          }))}
        />
      </Space>

      {loading ? (
        <TableSkeleton
          scrollX={720}
          rows={5}
          pagination={{ current: page, pageSize: size, total }}
          columns={[
            { title: t.myApplies.colRoom, kind: "code" },
            { title: t.myApplies.colStatus, kind: "tag" },
            { title: t.myApplies.colMessage, kind: "longText" },
            { title: t.myApplies.colSubmittedAt, kind: "date" },
            { title: t.myApplies.colProcessedAt, kind: "date" },
            { title: t.myApplies.colActions, kind: "actions", actionWidths: [84] },
          ]}
        />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            title={t.myApplies.emptyTitle}
            description={status ? t.myApplies.emptyDescSelected : t.myApplies.emptyDescDefault}
            action={
              status ? (
                <Button onClick={() => setStatus(undefined)}>{t.myApplies.btnViewAllStatus}</Button>
              ) : (
                <Button type="primary" onClick={() => navigate("/student/courses")}>
                  {t.common.goToMyCourses}
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
              title: t.myApplies.colRoom,
              render: (_, a) => <Link to={`/student/rooms/${a.roomId}`}>{a.roomCode}</Link>,
            },
            { title: t.myApplies.colStatus, render: (_, a) => <ApplyStatusTag status={a.status} /> },
            { title: t.myApplies.colMessage, dataIndex: "message", render: (v: string) => v || "—" },
            { title: t.myApplies.colSubmittedAt, render: (_, a) => formatDateTime(a.createdAt) },
            { title: t.myApplies.colProcessedAt, render: (_, a) => formatDateTime(a.decidedAt) },
            {
              title: t.myApplies.colActions,
              render: (_, a) =>
                a.status === "Pending" && (
                  <Popconfirm
                    title={t.myApplies.cancelConfirmTitle}
                    onConfirm={async () => {
                      setCancellingId(a.id);
                      try {
                        if (await cancel(a.id)) await load();
                      } finally {
                        setCancellingId(undefined);
                      }
                    }}
                    okText={t.myApplies.cancelConfirmOk}
                    cancelText={t.common.close}
                  >
                    <Button danger loading={cancellingId === a.id}>
                      {t.myApplies.cancelApplyBtn}
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
