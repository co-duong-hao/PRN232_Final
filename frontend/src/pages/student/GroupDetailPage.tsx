import "@/features/workspace.css";
import { useEffect, useState } from "react";
import { Card, Empty, Spin, Table, Typography } from "antd";
import { StarFilled } from "@ant-design/icons";
import { Link, useParams } from "react-router-dom";
import { groupsApi } from "@/api";
import type { Group } from "@/api";
import { MajorCounts } from "@/components/StatusTag";
import { formatDateTime } from "@/components/format";
import { useShowError } from "@/components/useApiAction";

export function GroupDetailPage() {
  const { groupId = "" } = useParams();
  const [group, setGroup] = useState<Group>();
  const [loading, setLoading] = useState(true);
  const showError = useShowError();
  useEffect(() => {
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
      <Spin spinning={loading}>
        {group ? (
          <>
            <header className="workspace-heading">
              <div>
                <Link to="/student/courses">← Course của tôi</Link>
                <Typography.Title level={1}>{group.name || group.code}</Typography.Title>
                <p>
                  {group.code} · {group.courseCode}
                </p>
              </div>
            </header>
            <Card>
              <dl className="workspace-facts">
                <div className="workspace-fact">
                  <dt>Loại nhóm</dt>
                  <dd>{group.groupTypeName}</dd>
                </div>
                <div className="workspace-fact">
                  <dt>Ngày thành lập</dt>
                  <dd>{formatDateTime(group.createdAt)}</dd>
                </div>
                <div className="workspace-fact">
                  <dt>Số thành viên theo ngành</dt>
                  <dd>
                    <MajorCounts
                      majors={Object.entries(counts).map(([majorCode, count]) => ({ majorCode, count }))}
                    />
                  </dd>
                </div>
              </dl>
            </Card>
            <Typography.Title level={2}>Thành viên</Typography.Title>
            <Table
              scroll={{ x: 390 }}
              rowKey="studentId"
              dataSource={group.members}
              pagination={false}
              columns={[
                { title: "Mã SV", dataIndex: "studentCode" },
                {
                  title: "Họ tên",
                  render: (_, m) => (
                    <>
                      {m.fullName} {m.isLeader && <StarFilled title="Trưởng nhóm" />}
                    </>
                  ),
                },
                { title: "Ngành", dataIndex: "majorCode" },
              ]}
            />
          </>
        ) : (
          !loading && <Empty description="Không tìm thấy nhóm" />
        )}
      </Spin>
    </div>
  );
}
