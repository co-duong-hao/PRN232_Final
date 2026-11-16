import { TableSkeleton } from "@/features/WorkspaceSkeletons";
import "@/features/workspace.css";
import { Empty, Grid, Input, Select, Space, Table, Typography } from "antd";
import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
<<<<<<< Updated upstream
import { coursesApi, referenceApi, type Course, type CourseListParams } from "@/api";
=======
import { coursesApi, referenceApi, type Course, type CourseListParams, type Lookup, type Paged } from "@/api";
import { EmptyState } from "@/components/EmptyState";
>>>>>>> Stashed changes
import { CourseStatusTag } from "@/components/StatusTag";
import { formatDateTime } from "@/components/format";
<<<<<<< Updated upstream
import { CourseActions } from "@/features/staff/CourseActions";
import { StaffLoadError } from "@/features/staff/StaffLoadError";
import { useStaffQuery } from "@/features/staff/useStaffQuery";
import "@/features/staff/staffPages.css";
export function CoursesPage() {
  const [params, setParams] = useState<CourseListParams>({ page: 1, pageSize: 20 });
  const screens = Grid.useBreakpoint();
  const request = useCallback(() => coursesApi.list(params), [params]);
  const { data, loading, failure, reload: load } = useStaffQuery(request);
  const semesters = useStaffQuery(referenceApi.semesters);
  const subjects = useStaffQuery(referenceApi.subjects);
=======
import { courseStatusLabel } from "@/components/labels";
import { useShowError } from "@/components/useApiAction";
import { CourseActions } from "@/features/staff/CourseActions";

export function CoursesPage() {
  const [params, setParams] = useState<CourseListParams>({ page: 1, pageSize: 20 });
  const [data, setData] = useState<Paged<Course>>();
  const [loading, setLoading] = useState(false);
  const [semesters, setSemesters] = useState<Lookup[]>([]);
  const [subjects, setSubjects] = useState<Lookup[]>([]);
  const showError = useShowError();

  const load = useCallback(() => {
    setLoading(true);
    coursesApi
      .list(params)
      .then(setData)
      .catch(showError)
      .finally(() => setLoading(false));
  }, [params, showError]);

  useEffect(load, [load]);

  useEffect(() => {
    Promise.all([referenceApi.semesters(), referenceApi.subjects()])
      .then(([a, b]) => {
        setSemesters(a.items);
        setSubjects(b.items);
      })
      .catch(showError);
  }, [showError]);

>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
      <Space wrap className="workspace-toolbar staff-filters">
=======

      <Space wrap className="workspace-toolbar">
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
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
        <StaffLoadError title="Không tải được danh sách Course" error={failure.error} onRetry={load} />
      ) : loading ? (
        <TableSkeleton
          scrollX="max-content"
          rows={5}
          pagination={{ current: params.page, pageSize: params.pageSize, total: data?.totalItems }}
          columns={[
            { title: "Mã", kind: "code" },
            { title: "Trạng thái", kind: "tag" },
            { title: "Loại nhóm", kind: "text" },
            { title: "Sinh viên", kind: "number" },
            { title: "Bắt đầu", kind: "date" },
            { title: "Hạn", kind: "date" },
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
          pagination={{
            current: params.page,
            pageSize: params.pageSize,
            total: data?.totalItems,
            showSizeChanger: !!screens.sm,
            responsive: true,
            showLessItems: !screens.sm,
          }}
          onChange={(p, _, s) => {
            const sort = Array.isArray(s) ? s[0] : s;
            setParams((x) => ({
              ...x,
              page: p.current,
              pageSize: p.pageSize,
              sortBy: sort?.order ? String(sort.field) : undefined,
              sortDir: sort?.order === "ascend" ? "asc" : sort?.order ? "desc" : undefined,
            }));
          }}
          locale={{
            emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có Course phù hợp" />,
          }}
          columns={[
            {
              title: "Mã",
              dataIndex: "code",
              sorter: true,
              render: (v: string, r: Course) => <Link to={`/staff/courses/${r.id}`}>{v}</Link>,
            },
            {
              title: "Trạng thái",
              dataIndex: "status",
              render: (v: Course["status"]) => <CourseStatusTag status={v} />,
            },
            { title: "Loại nhóm", dataIndex: "groupTypeName" },
            { title: "Sinh viên", dataIndex: "studentCount" },
            { title: "Bắt đầu", dataIndex: "startTime", render: formatDateTime },
            { title: "Hạn", dataIndex: "deadline", sorter: true, render: formatDateTime },
            {
              title: "Thao tác",
              render: (_: unknown, r: Course) => <CourseActions course={r} onChanged={load} />,
            },
          ]}
        />
      )}
=======

      <Table
        rowKey="id"
        scroll={{ x: "max-content" }}
        loading={loading}
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
          showSizeChanger: true,
        }}
        onChange={(p, _, s) => {
          const sort = Array.isArray(s) ? s[0] : s;
          setParams((x) => ({
            ...x,
            page: p.current,
            pageSize: p.pageSize,
            sortBy: sort?.order ? String(sort.field) : undefined,
            sortDir: sort?.order === "ascend" ? "asc" : sort?.order ? "desc" : undefined,
          }));
        }}
        columns={[
          {
            title: "Mã học phần",
            dataIndex: "code",
            sorter: true,
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
          { title: "Hạn ghép nhóm", dataIndex: "deadline", sorter: true, render: formatDateTime },
          {
            title: "Thao tác",
            render: (_: unknown, r: Course) => <CourseActions course={r} onChanged={load} />,
          },
        ]}
      />
>>>>>>> Stashed changes
    </div>
  );
}
