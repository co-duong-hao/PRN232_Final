import { Input, Select, Space, Table, Typography } from "antd";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { coursesApi, referenceApi, type Course, type CourseListParams, type Lookup, type Paged } from "@/api";
import { CourseStatusTag } from "@/components/StatusTag";
import { courseStatusLabel } from "@/components/labels";
import { formatDateTime } from "@/components/format";
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
  const filter = (p: Partial<CourseListParams>) => setParams((x) => ({ ...x, ...p, page: 1 }));
  return (
    <>
      <Typography.Title level={2}>Course</Typography.Title>
      <Space wrap style={{ marginBottom: 16 }}>
        <Input.Search placeholder="Tìm Course" allowClear onSearch={(q) => filter({ q })} />
        <Select
          placeholder="Trạng thái"
          allowClear
          style={{ width: 160 }}
          options={Object.entries(courseStatusLabel).map(([value, v]) => ({ value, label: v.text }))}
          onChange={(status) => filter({ status })}
        />
        <Select
          placeholder="Học kỳ"
          allowClear
          style={{ width: 160 }}
          options={semesters.map((x) => ({ value: x.id, label: x.code }))}
          onChange={(semesterId) => filter({ semesterId })}
        />
        <Select
          placeholder="Môn"
          allowClear
          style={{ width: 160 }}
          options={subjects.map((x) => ({ value: x.id, label: x.code }))}
          onChange={(subjectId) => filter({ subjectId })}
        />
        <CourseActions onChanged={load} />
      </Space>
      <Table
        rowKey="id"
        loading={loading}
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
    </>
  );
}
