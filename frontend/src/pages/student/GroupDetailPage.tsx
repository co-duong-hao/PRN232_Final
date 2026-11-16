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
import { useI18n } from "@/i18n";

export function GroupDetailPage() {
  const { groupId = "" } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
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
                {t.groupDetail.backToCourses}
              </Link>
              <div className="workspace-heading__title-row">
                <Typography.Title level={1}>{group.name || group.code}</Typography.Title>
                <Tag color="geekblue">{t.groupDetail.statusBadge}</Tag>
              </div>
              <p>
                {group.code} · {group.courseCode}
              </p>
            </div>
          </header>

          <Card title={t.groupDetail.infoTitle}>
            <dl className="workspace-facts">
              <div className="workspace-fact">
                <dt>{t.groupDetail.factCourse}</dt>
                <dd>{group.courseCode}</dd>
              </div>
              <div className="workspace-fact">
                <dt>{t.groupDetail.factGroupType}</dt>
                <dd>{group.groupTypeName}</dd>
              </div>
              <div className="workspace-fact">
                <dt>{t.groupDetail.factCreatedAt}</dt>
                <dd>{formatDateTime(group.createdAt)}</dd>
              </div>
              <div className="workspace-fact">
                <dt>{t.groupDetail.factTotalMembers}</dt>
                <dd>{t.common.membersCount(group.members.length)}</dd>
              </div>
              <div className="workspace-fact">
                <dt>{t.groupDetail.factMajorsDistribution}</dt>
                <dd>
                  <MajorCounts
                    majors={Object.entries(counts).map(([majorCode, count]) => ({ majorCode, count }))}
                  />
                </dd>
              </div>
            </dl>
          </Card>

          <Card title={t.groupDetail.membersTitle(group.members.length)} className="workspace-section">
            <Table
              scroll={{ x: 420 }}
              rowKey="studentId"
              dataSource={group.members}
              pagination={false}
              locale={{ emptyText: <EmptyState title={t.groupDetail.emptyMembers} /> }}
              columns={[
                { title: t.groupDetail.colStudentCode, dataIndex: "studentCode" },
                {
                  title: t.groupDetail.colFullName,
                  render: (_, m) => (
                    <Space size={6} wrap>
                      <span>{m.fullName}</span>
                      {m.isLeader && <Tag color="orange">{t.groupDetail.leaderBadge}</Tag>}
                    </Space>
                  ),
                },
                { title: t.groupDetail.colMajor, dataIndex: "majorCode" },
              ]}
            />
          </Card>
        </>
      ) : (
        <Card>
          <EmptyState
            title={t.groupDetail.notFoundTitle}
            description={t.groupDetail.notFoundDesc}
            action={
              <Button type="primary" onClick={() => navigate("/student/courses")}>
                {t.common.goToMyCourses}
              </Button>
            }
          />
        </Card>
      )}
    </div>
  );
}
