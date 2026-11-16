import "@/features/workspace.css";
import { Input, Select, Space, Table, Typography } from "antd";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { coursesApi, referenceApi, type Course, type CourseListParams, type Lookup, type Paged } from "@/api";
import { CourseStatusTag } from "@/components/StatusTag";
import { courseStatusLabel } from "@/components/labels";
import { formatDateTime } from "@/components/format";
import { useShowError } from "@/components/useApiAction";
import { CourseActions } from "@/features/staff/CourseActions";
import { TableSkeleton } from "@/features/WorkspaceSkeletons";

export function CoursesPage() {
  const [params, setParams] = useState<CourseListParams>({ page: 1, pageSize: 20 });
  const [data, setData] = useState<Paged<Course>>();
  const [loading, setLoading] = useState(true);
  const [filtersLoading, setFiltersLoading] = useState(true);
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
    setFiltersLoading(true);
    Promise.all([referenceApi.semesters(), referenceApi.subjects()])
      .then(([a, b]) => {
        setSemesters(a.items);
        setSubjects(b.items);
      })
      .catch(showError)
      .finally(() => setFiltersLoading(false));
  }, [showError]);
  const filter = (p: Partial<CourseListParams>) => setParams((x) => ({ ...x, ...p, page: 1 }));
  return (
    <div className="workspace-page">
      <header className="workspace-heading">
        <div>
          <Typography.Title level={1}>Quản lý Course</Typography.Title>
          <p>Theo dõi Course theo học kỳ, môn học và trạng thái ghép nhóm.</p>
        </div>
      </header>
      <Space wrap className="workspace-toolbar">
        <Input.Search
          aria-label="Tìm Course"
          placeholder="Tìm Course"
          allowClear
          onSearch={(q) => filter({ q })}
        />
        <Select
          aria-label="Lọc theo trạng thái Course"
          placeholder="Trạng thái"
          allowClear
          style={{ width: 160 }}
          options={Object.entries(courseStatusLabel).map(([value, v]) => ({ value, label: v.text }))}
          onChange={(status) => filter({ status })}
        />
        <Select
          aria-label="Lọc theo học kỳ"
          placeholder="Học kỳ"
          allowClear
          loading={filtersLoading}
          style={{ width: 160 }}
          options={semesters.map((x) => ({ value: x.id, label: x.code }))}
          onChange={(semesterId) => filter({ semesterId })}
        />
        <Select
          aria-label="Lọc theo môn"
          placeholder="Môn"
          allowClear
          loading={filtersLoading}
          style={{ width: 160 }}
          options={subjects.map((x) => ({ value: x.id, label: x.code }))}
          onChange={(subjectId) => filter({ subjectId })}
        />
        <CourseActions onChanged={load} />
      </Space>
      {loading ? (
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
          rowKey="id"
          scroll={{ x: "max-content" }}
          dataSource={data?.items ?? []}
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
    </div>
  );
}
