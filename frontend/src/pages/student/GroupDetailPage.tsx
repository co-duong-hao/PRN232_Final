import "@/features/workspace.css";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useEffect, useState } from "react";
import { Button, Card, Space, Table, Tag, Typography } from "antd";
import { Link, useNavigate, useParams } from "react-router-dom";
import { groupsApi } from "@/api";
import type { Group } from "@/api";
import { EmptyState } from "@/components/EmptyState";
import { MajorCounts } from "@/components/StatusTag";
import { formatDateTime } from "@/components/format";
import { useShowError } from "@/components/useApiAction";
import { GroupDetailSkeleton } from "@/features/WorkspaceSkeletons";

export function GroupDetailPage() {
  const { groupId = "" } = useParams();
  const navigate = useNavigate();
  const [group, setGroup] = useState<Group>();
  const [loading, setLoading] = useState(true);
  const showError = useShowError();

  useEffect(() => {
    setGroup(undefined);
    setLoading(true);
    groupsApi
      .get(groupId)
      .then(setGroup)
      .catch(showError)
      .finally(() => setLoading(false));
  }, [groupId, showError]);

  const counts =
    group?.members.reduce<Record<string, number>>((a, m) => {
      a[m.majorCode] = (a[m.majorCode] ?? 0) + 1;
      return a;
    }, {}) ?? {};

  return (
    <div className="workspace-page">
      {loading && !group ? (
        <GroupDetailSkeleton />
      ) : group ? (
        <>
          <header className="workspace-heading">
            <div>
              <Link className="workspace-heading__back" to="/student/courses">
                <ArrowLeftOutlined aria-hidden="true" />
                Quay lại Học phần của tôi
              </Link>
              <div className="workspace-heading__title-row">
                <Typography.Title level={1}>{group.name || group.code}</Typography.Title>
                <Tag color="geekblue">Đã thành nhóm</Tag>
              </div>
              <p>
                {group.code} · {group.courseCode}
              </p>
            </div>
          </header>

          <Card title="Thông tin nhóm chính thức">
            <dl className="workspace-facts">
              <div className="workspace-fact">
                <dt>Học phần</dt>
                <dd>{group.courseCode}</dd>
              </div>
              <div className="workspace-fact">
                <dt>Loại nhóm</dt>
                <dd>{group.groupTypeName}</dd>
              </div>
              <div className="workspace-fact">
                <dt>Ngày thành lập</dt>
                <dd>{formatDateTime(group.createdAt)}</dd>
              </div>
              <div className="workspace-fact">
                <dt>Tổng thành viên</dt>
                <dd>{group.members.length} thành viên</dd>
              </div>
              <div className="workspace-fact">
                <dt>Phân bố theo ngành</dt>
                <dd>
                  <MajorCounts
                    majors={Object.entries(counts).map(([majorCode, count]) => ({ majorCode, count }))}
                  />
                </dd>
              </div>
            </dl>
          </Card>

          <Card title={`Danh sách thành viên (${group.members.length})`} className="workspace-section">
            <Table
              scroll={{ x: 420 }}
              rowKey="studentId"
              dataSource={group.members}
              pagination={false}
              locale={{ emptyText: <EmptyState title="Chưa có thành viên" /> }}
              columns={[
                { title: "Mã SV", dataIndex: "studentCode" },
                {
                  title: "Họ tên",
                  render: (_, m) => (
                    <Space size={6} wrap>
                      <span>{m.fullName}</span>
                      {m.isLeader && <Tag color="orange">Trưởng nhóm</Tag>}
                    </Space>
                  ),
                },
                { title: "Ngành", dataIndex: "majorCode" },
              ]}
            />
          </Card>
        </>
      ) : (
        <Card>
          <EmptyState
            title="Không tìm thấy nhóm"
            description="Nhóm này không tồn tại hoặc bạn không có quyền xem."
            action={
              <Button type="primary" onClick={() => navigate("/student/courses")}>
                Về Học phần của tôi
              </Button>
            }
          />
        </Card>
      )}
    </div>
  );
}
