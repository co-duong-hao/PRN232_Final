import "@/features/staff/staffPages.css";
import "@/features/workspace.css";
import { Grid, Input, Select, Space, Table, Typography } from "antd";
import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { coursesApi, referenceApi, type Course, type CourseListParams } from "@/api";
import { EmptyState } from "@/components/EmptyState";
import { formatDateTime } from "@/components/format";
import { courseStatusLabel } from "@/components/labels";
import { CourseStatusTag } from "@/components/StatusTag";
import { CourseActions } from "@/features/staff/CourseActions";
import { StaffLoadError } from "@/features/staff/StaffLoadError";
import { staffSortOrder } from "@/features/staff/staffTableSort";
import { useStaffQuery } from "@/features/staff/useStaffQuery";
import { TableSkeleton } from "@/features/WorkspaceSkeletons";

export function CoursesPage() {
  const [params, setParams] = useState<CourseListParams>({ page: 1, pageSize: 20 });
  const screens = Grid.useBreakpoint();
  const request = useCallback(() => coursesApi.list(params), [params]);
  const { data, loading, failure, reload: load } = useStaffQuery(request);
  const semesters = useStaffQuery(referenceApi.semesters);
  const subjects = useStaffQuery(referenceApi.subjects);

  const filter = (p: Partial<CourseListParams>) => setParams((x) => ({ ...x, ...p, page: 1 }));

  return (
    <div className="workspace-page staff-page">
      <header className="workspace-heading">
        <div>
          <span className="workspace-heading__eyebrow">Giảng viên & Quản lý</span>
          <Typography.Title level={1}>Quản lý học phần</Typography.Title>
          <p>Theo dõi tiến độ ghép nhóm theo học kỳ, môn học và trạng thái mở phòng.</p>
        </div>
        <CourseActions onChanged={load} />
      </header>

      <Space wrap className="workspace-toolbar staff-filters">
        <Input.Search
          aria-label="Tìm học phần"
          placeholder="Tìm mã học phần..."
          allowClear
          onSearch={(q) => filter({ q })}
        />
        <Select
          aria-label="Lọc theo trạng thái học phần"
          placeholder="Tất cả trạng thái"
          allowClear
          style={{ width: 170 }}
          options={Object.entries(courseStatusLabel).map(([value, v]) => ({ value, label: v.text }))}
          onChange={(status) => filter({ status })}
        />
        <Select
          aria-label="Lọc theo học kỳ"
          placeholder="Tất cả học kỳ"
          allowClear
          style={{ width: 160 }}
          loading={semesters.loading}
          disabled={!!semesters.failure}
          options={semesters.data?.items.map((x) => ({ value: x.id, label: x.code }))}
          onChange={(semesterId) => filter({ semesterId })}
        />
        <Select
          aria-label="Lọc theo môn học"
          placeholder="Tất cả môn"
          allowClear
          style={{ width: 160 }}
          loading={subjects.loading}
          disabled={!!subjects.failure}
          options={subjects.data?.items.map((x) => ({ value: x.id, label: x.code }))}
          onChange={(subjectId) => filter({ subjectId })}
        />
      </Space>

      {semesters.failure && (
        <StaffLoadError
          title="Không tải được học kỳ"
          error={semesters.failure.error}
          onRetry={semesters.reload}
        />
      )}
      {subjects.failure && (
        <StaffLoadError
          title="Không tải được môn học"
          error={subjects.failure.error}
          onRetry={subjects.reload}
        />
      )}

      {failure ? (
        <StaffLoadError title="Không tải được danh sách học phần" error={failure.error} onRetry={load} />
      ) : loading ? (
        <TableSkeleton
          scrollX={820}
          rows={5}
          pagination={{ current: params.page, pageSize: params.pageSize, total: data?.totalItems }}
          columns={[
            { title: "Mã học phần", kind: "code" },
            { title: "Trạng thái", kind: "tag" },
            { title: "Loại nhóm", kind: "text" },
            { title: "Sĩ số", kind: "number" },
            { title: "Bắt đầu", kind: "date" },
            { title: "Hạn ghép nhóm", kind: "date" },
            { title: "Thao tác", kind: "actions", actionWidths: [112, 58, 56] },
          ]}
        />
      ) : (
        <Table
          className="staff-table"
          scroll={{ x: "max-content" }}
          size={screens.sm ? "middle" : "small"}
          rowKey="id"
          dataSource={data?.items ?? []}
          locale={{
            emptyText: (
              <EmptyState
                title="Không có học phần nào"
                description="Không tìm thấy học phần khớp với bộ lọc hiện tại."
              />
            ),
          }}
          pagination={{
            current: params.page,
            pageSize: params.pageSize,
            total: data?.totalItems,
            showSizeChanger: !!screens.sm,
            responsive: true,
            showLessItems: !screens.sm,
          }}
          onChange={(p, _, s, { action }) => {
            const sort = Array.isArray(s) ? s[0] : s;
            setParams((x) => ({
              ...x,
              page: action === "sort" ? 1 : p.current,
              pageSize: p.pageSize,
              ...(action === "sort" && {
                sortBy: sort?.order ? String(sort.field) : undefined,
                sortDir: sort?.order === "ascend" ? "asc" : sort?.order ? "desc" : undefined,
              }),
            }));
          }}
          columns={[
            {
              title: "Mã học phần",
              dataIndex: "code",
              sorter: true,
              sortOrder: staffSortOrder(params, "code"),
              render: (v: string, r: Course) => <Link to={`/staff/courses/${r.id}`}>{v}</Link>,
            },
            {
              title: "Trạng thái",
              dataIndex: "status",
              render: (v: Course["status"]) => <CourseStatusTag status={v} />,
            },
            { title: "Loại nhóm", dataIndex: "groupTypeName" },
            { title: "Sĩ số", dataIndex: "studentCount" },
            { title: "Bắt đầu", dataIndex: "startTime", render: formatDateTime },
            {
              title: "Hạn ghép nhóm",
              dataIndex: "deadline",
              sorter: true,
              sortOrder: staffSortOrder(params, "deadline"),
              render: formatDateTime,
            },
            {
              title: "Thao tác",
              render: (_: unknown, r: Course) => <CourseActions course={r} onChanged={load} />,
            },
          ]}
        />
      )}
    </div>
  );
}
