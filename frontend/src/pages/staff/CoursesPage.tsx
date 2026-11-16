import "@/features/staff/staffPages.css";
import "@/features/workspace.css";
import { Button, Grid, Input, Select, Space, Table, Typography } from "antd";
import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { coursesApi, referenceApi, type Course, type CourseListParams, type CourseStatus } from "@/api";
import { EmptyState } from "@/components/EmptyState";
import { formatDateTime } from "@/components/format";
import { courseStatusLabel } from "@/components/labels";
import { CourseStatusTag } from "@/components/StatusTag";
import { CourseActions } from "@/features/staff/CourseActions";
import { StaffLoadError } from "@/features/staff/StaffLoadError";
import { staffSortOrder } from "@/features/staff/staffTableSort";
import { useStaffPageBounds } from "@/features/staff/useStaffPageBounds";
import { useStaffQuery } from "@/features/staff/useStaffQuery";
import { TableSkeleton } from "@/features/WorkspaceSkeletons";
import { translations, useI18n } from "@/i18n";

export function CoursesPage() {
  const { t, language } = useI18n();
  const [params, setParams] = useState<CourseListParams>({ page: 1, pageSize: 20 });
  const [searchText, setSearchText] = useState("");
  const screens = Grid.useBreakpoint();
  const request = useCallback(() => coursesApi.list(params), [params]);
  const { data, loading, failure, reload: load } = useStaffQuery(request);
  useStaffPageBounds(params.page, data?.totalPages, setParams);
  const semesters = useStaffQuery(referenceApi.semesters);
  const subjects = useStaffQuery(referenceApi.subjects);

  const filter = (p: Partial<CourseListParams>) => setParams((x) => ({ ...x, ...p, page: 1 }));

  return (
    <div className="workspace-page staff-page">
      <header className="workspace-heading">
        <div>
          <span className="workspace-heading__eyebrow">{t.staffCourses.eyebrow}</span>
          <Typography.Title level={1}>{t.staffCourses.title}</Typography.Title>
          <p>{t.staffCourses.subtitle}</p>
        </div>
        <CourseActions onChanged={load} />
      </header>

      <Space wrap className="workspace-toolbar staff-filters">
        <Input.Search
          aria-label={t.staffCourses.searchPlaceholder}
          placeholder={t.staffCourses.searchPlaceholder}
          allowClear
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          onSearch={(value) => filter({ q: value.trim() || undefined })}
        />
        <Select
          aria-label={t.staffCourses.allStatus}
          placeholder={t.staffCourses.allStatus}
          allowClear
          style={{ width: 170 }}
          options={Object.entries(courseStatusLabel).map(([value, v]) => ({
            value,
            label: translations[language].courseStatus[value as CourseStatus] ?? v.text,
          }))}
          value={params.status}
          onChange={(status) => filter({ status })}
        />
        <Select
          aria-label={t.staffCourses.allSemesters}
          placeholder={t.staffCourses.allSemesters}
          allowClear
          style={{ width: 160 }}
          loading={semesters.loading}
          disabled={!!semesters.failure}
          options={semesters.data?.items.map((x) => ({ value: x.id, label: x.code }))}
          value={params.semesterId}
          onChange={(semesterId) => filter({ semesterId })}
        />
        <Select
          aria-label={t.staffCourses.allSubjects}
          placeholder={t.staffCourses.allSubjects}
          allowClear
          style={{ width: 160 }}
          loading={subjects.loading}
          disabled={!!subjects.failure}
          options={subjects.data?.items.map((x) => ({ value: x.id, label: x.code }))}
          value={params.subjectId}
          onChange={(subjectId) => filter({ subjectId })}
        />
        <Button
          disabled={!(searchText || params.q || params.status || params.semesterId || params.subjectId)}
          onClick={() => {
            setSearchText("");
            filter({ q: undefined, status: undefined, semesterId: undefined, subjectId: undefined });
          }}
        >
          {language === "en" ? "Reset filters" : "Xóa bộ lọc"}
        </Button>
      </Space>

      {semesters.failure && (
        <StaffLoadError
          title={t.staffCourses.errorLoadSemesters}
          error={semesters.failure.error}
          onRetry={semesters.reload}
        />
      )}
      {subjects.failure && (
        <StaffLoadError
          title={t.staffCourses.errorLoadSubjects}
          error={subjects.failure.error}
          onRetry={subjects.reload}
        />
      )}

      {failure ? (
        <StaffLoadError title={t.staffCourses.errorLoadCourses} error={failure.error} onRetry={load} />
      ) : loading ? (
        <TableSkeleton
          scrollX={820}
          rows={5}
          pagination={{ current: params.page, pageSize: params.pageSize, total: data?.totalItems }}
          columns={[
            { title: t.staffCourses.colCourseCode, kind: "code" },
            { title: t.staffCourses.colStatus, kind: "tag" },
            { title: t.staffCourses.colGroupType, kind: "text" },
            { title: t.staffCourses.colEnrollment, kind: "number" },
            { title: language === "en" ? "Start" : "Bắt đầu", kind: "date" },
            { title: t.staffCourses.colDeadline, kind: "date" },
            { title: t.common.actions, kind: "actions", actionWidths: [112, 58, 56] },
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
                title={t.staffCourses.emptyCoursesTitle}
                description={t.staffCourses.emptyFilterDesc}
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
              title: t.staffCourses.colCourseCode,
              dataIndex: "code",
              sorter: true,
              sortOrder: staffSortOrder(params, "code"),
              render: (v: string, r: Course) => <Link to={`/staff/courses/${r.id}`}>{v}</Link>,
            },
            {
              title: t.staffCourses.colStatus,
              dataIndex: "status",
              render: (v: Course["status"]) => <CourseStatusTag status={v} />,
            },
            { title: t.staffCourses.colGroupType, dataIndex: "groupTypeName" },
            { title: t.staffCourses.colEnrollment, dataIndex: "studentCount" },
            {
              title: language === "en" ? "Start" : "Bắt đầu",
              dataIndex: "startTime",
              render: formatDateTime,
            },
            {
              title: t.staffCourses.colDeadline,
              dataIndex: "deadline",
              sorter: true,
              sortOrder: staffSortOrder(params, "deadline"),
              render: formatDateTime,
            },
            {
              title: t.common.actions,
              render: (_: unknown, r: Course) => <CourseActions course={r} onChanged={load} />,
            },
          ]}
        />
      )}
    </div>
  );
}
