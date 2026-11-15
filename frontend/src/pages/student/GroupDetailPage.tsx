import { useEffect, useState } from "react";
import { Card, Empty, Spin, Table, Typography } from "antd";
import { StarFilled } from "@ant-design/icons";
import { useParams } from "react-router-dom";
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
    <Spin spinning={loading}>
      {group ? (
        <>
          <Typography.Title level={2}>Nhóm {group.code}</Typography.Title>
          <Card>
            <p>Course: {group.courseCode}</p>
            <p>Loại nhóm: {group.groupTypeName}</p>
            <p>Ngày thành lập: {formatDateTime(group.createdAt)}</p>
            <p>
              Số thành viên theo ngành:{" "}
              <MajorCounts
                majors={Object.entries(counts).map(([majorCode, count]) => ({ majorCode, count }))}
              />
            </p>
          </Card>
          <Typography.Title level={3}>Thành viên</Typography.Title>
          <Table
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
  );
}
