import "@/features/staff/staffPages.css";
import "@/features/workspace.css";
import { ArrowLeftOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Descriptions,
  Grid,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from "antd";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  coursesApi,
  referenceApi,
  type CourseStudent,
  type CourseStudentParams,
  type Group,
  type PageParams,
  type RoomListParams,
  type RoomStatus,
  type RoomSummary,
} from "@/api";
import { useAuth } from "@/auth/AuthContext";
import { EmptyState } from "@/components/EmptyState";
import { formatDateTime, formatDecimal } from "@/components/format";
import { roomStatusLabel } from "@/components/labels";
import { CourseStatusTag, MajorCounts, RoomStatusTag } from "@/components/StatusTag";
import { useApiAction } from "@/components/useApiAction";
import { CourseActions } from "@/features/staff/CourseActions";
import { CourseStatistics } from "@/features/staff/CourseStatistics";
import { StaffLoadError } from "@/features/staff/StaffLoadError";
import { StaffRoomDetails } from "@/features/staff/StaffRoomDetails";
import { useStaffPageBounds } from "@/features/staff/useStaffPageBounds";
import { useStaffQuery } from "@/features/staff/useStaffQuery";
import { CourseDetailSkeleton, CourseStatsSkeleton, TableSkeleton } from "@/features/WorkspaceSkeletons";
import { translations, useI18n } from "@/i18n";

export function CourseDetailPage() {
  const { courseId = "" } = useParams();
  return <CourseDetail key={courseId} courseId={courseId} />;
}

function CourseDetail({ courseId }: { courseId: string }) {
  const { hasRole } = useAuth();
  const { t, language } = useI18n();
  const screens = Grid.useBreakpoint();
  const { message } = App.useApp();

  const [tab, setTab] = useState("stats");
  const [sp, setSp] = useState<CourseStudentParams>({ page: 1, pageSize: 20 });
  const [rp, setRp] = useState<RoomListParams>({ page: 1, pageSize: 20 });
  const [gp, setGp] = useState<PageParams>({ page: 1, pageSize: 20 });
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [settledStudentSearch, setSettledStudentSearch] = useState("");
  const searchingStudents = studentSearch.trim() !== settledStudentSearch;

  useEffect(() => {
    if (!enrollOpen || !searchingStudents) return;
    const timer = window.setTimeout(() => setSettledStudentSearch(studentSearch.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [enrollOpen, searchingStudents, studentSearch]);
  const [selected, setSelected] = useState<string[]>([]);

  const loadCourse = useCallback(() => coursesApi.get(courseId), [courseId]);
  const courseQuery = useStaffQuery(loadCourse);
  const course = courseQuery.data;
  const loadStats = useCallback(() => coursesApi.stats(courseId), [courseId]);
  const stats = useStaffQuery(course ? loadStats : null);

  const loadStudents = useCallback(() => coursesApi.students(courseId, sp), [courseId, sp]);
  const loadRooms = useCallback(() => coursesApi.rooms(courseId, rp), [courseId, rp]);
  const loadGroups = useCallback(() => coursesApi.groups(courseId, gp), [courseId, gp]);
  const students = useStaffQuery(course && tab === "students" ? loadStudents : null);
  const rooms = useStaffQuery(course && tab === "rooms" ? loadRooms : null);
  const groups = useStaffQuery(course && tab === "groups" ? loadGroups : null);
  useStaffPageBounds(sp.page, students.data?.totalPages, setSp);
  useStaffPageBounds(rp.page, rooms.data?.totalPages, setRp);
  useStaffPageBounds(gp.page, groups.data?.totalPages, setGp);
  const majors = useStaffQuery(course && tab === "students" ? referenceApi.majors : null);
  const groupTypes = useStaffQuery(course ? referenceApi.groupTypes : null);
  const searchStudents = useCallback(
    () => referenceApi.students({ q: settledStudentSearch, page: 1, pageSize: 100 }),
    [settledStudentSearch],
  );
  const choices = useStaffQuery(enrollOpen && !searchingStudents ? searchStudents : null);

  const refresh = () => {
    courseQuery.reload();
    stats.reload();
    students.reload();
    rooms.reload();
    groups.reload();
  };

  const [enroll, enrolling] = useApiAction(
    (ids: string[]) => coursesApi.enroll(courseId, ids),
    t.staffCourseDetail.enrollSuccess,
  );
  const [remove, removing] = useApiAction(async (id: string) => {
    await coursesApi.removeStudent(courseId, id);
    return true;
  }, t.staffCourseDetail.removeSuccess);

  const type = groupTypes.data?.items.find((gt) => gt.id === course?.groupTypeId);

  const memberList = (
    members: {
      studentId: string;
      studentCode: string;
      fullName: string;
      majorCode: string;
      isLeader: boolean;
    }[],
  ) => (
    <Table
      size="small"
      scroll={{ x: "max-content" }}
      rowKey="studentId"
      pagination={false}
      locale={{
        emptyText: <EmptyState title={language === "en" ? "No members" : "Chưa có thành viên"} />,
      }}
      dataSource={members}
      columns={[
        { title: t.staffRoomDetails.colStudentCode, dataIndex: "studentCode" },
        { title: t.staffRoomDetails.colFullName, dataIndex: "fullName" },
        { title: t.staffRoomDetails.colMajor, dataIndex: "majorCode" },
        {
          title: t.staffRoomDetails.colRole,
          dataIndex: "isLeader",
          render: (v: boolean) =>
            v ? (
              <Tag color="orange">{language === "en" ? "Leader" : "Trưởng nhóm"}</Tag>
            ) : language === "en" ? (
              "Member"
            ) : (
              "Thành viên"
            ),
        },
      ]}
    />
  );

  if (courseQuery.loading) {
    return (
      <CourseDetailSkeleton canManage={hasRole("Admin", "HeadOfDepartment")} isAdmin={hasRole("Admin")} />
    );
  }

  if (!course) {
    return (
      <div className="workspace-page staff-page">
        <header className="workspace-heading">
          <div>
            <Link className="workspace-heading__back" to="/staff/courses">
              <ArrowLeftOutlined aria-hidden="true" />
              {t.staffCourseDetail.backToCourses}
            </Link>
            <Typography.Title level={1}>
              {language === "en" ? "Course Details" : "Chi tiết học phần"}
            </Typography.Title>
          </div>
        </header>
        {courseQuery.failure && (
          <StaffLoadError
            title={language === "en" ? "Failed to load course" : "Không tải được học phần"}
            error={courseQuery.failure.error}
            onRetry={courseQuery.reload}
          />
        )}
      </div>
    );
  }

  return (
    <div className="workspace-page staff-page">
      <header className="workspace-heading">
        <div>
          <Link className="workspace-heading__back" to="/staff/courses">
            <ArrowLeftOutlined aria-hidden="true" />
            {t.staffCourseDetail.backToCourses}
          </Link>
          <div className="workspace-heading__title-row">
            <Typography.Title level={1}>{course.code}</Typography.Title>
            <CourseStatusTag status={course.status} />
          </div>
          <p>
            {language === "en"
              ? "Monitor enrollments, active rooms, and formed groups in this course."
              : "Theo dõi sĩ số, các phòng đang hoạt động và nhóm đã hoàn tất trong học phần."}
          </p>
        </div>
        {hasRole("Admin", "HeadOfDepartment") && (
          <CourseActions course={course} onChanged={refresh} allowDelete={false} />
        )}
      </header>

      <Descriptions
        bordered
        column={{ xs: 1, sm: 2, md: 2, lg: 2, xl: 2, xxl: 2 }}
        size="small"
        className="workspace-course-description"
        items={[
          {
            key: "type",
            label: t.myCourses.cardGroupType,
            children: course.groupTypeName,
          },
          {
            key: "rule",
            label: language === "en" ? "Composition Rules" : "Quy định cơ cấu",
            children: type ? (
              <>
                <div>
                  {type.minMemberCount}–{type.maxMemberCount} {t.composition.memberUnit},{" "}
                  {language === "en" ? "minimum" : "tối thiểu"} {type.minMajorCount} {t.composition.majorUnit}
                </div>
                {type.majors.length > 0 && (
                  <div>
                    {type.majors.map((m) => `${m.majorCode}: ${m.minQuantity}–${m.maxQuantity}`).join(", ")}
                  </div>
                )}
              </>
            ) : groupTypes.loading ? (
              language === "en" ? (
                "Loading rules..."
              ) : (
                "Đang tải quy định..."
              )
            ) : language === "en" ? (
              "No rule information available"
            ) : (
              "Chưa có thông tin quy định"
            ),
          },
          {
            key: "start",
            label: language === "en" ? "Start" : "Bắt đầu",
            children: formatDateTime(course.startTime),
          },
          {
            key: "end",
            label: t.staffCourses.colDeadline,
            children: formatDateTime(course.deadline),
          },
        ]}
      />

      {groupTypes.failure && (
        <StaffLoadError
          title={language === "en" ? "Failed to load group type rules" : "Không tải được quy định loại nhóm"}
          error={groupTypes.failure.error}
          onRetry={groupTypes.reload}
        />
      )}

      <Tabs
        className="workspace-section"
        activeKey={tab}
        onChange={setTab}
        items={[
          {
            key: "stats",
            label: t.staffCourseDetail.tabStats,
            children: stats.failure ? (
              <StaffLoadError
                title={language === "en" ? "Failed to load statistics" : "Không tải được thống kê"}
                error={stats.failure.error}
                onRetry={stats.reload}
              />
            ) : stats.data ? (
              <CourseStatistics
                courseCode={course.code}
                stats={stats.data}
                canSeeCancelled={hasRole("Admin")}
                onRefresh={stats.reload}
                onShowUnassigned={() => {
                  setSp({ page: 1, pageSize: sp.pageSize, hasRoom: false });
                  setTab("students");
                }}
                onShowRooms={(roomStatus) => {
                  setRp({ page: 1, pageSize: rp.pageSize, status: roomStatus });
                  setTab("rooms");
                }}
                onShowGroups={() => {
                  setGp({ page: 1, pageSize: gp.pageSize });
                  setTab("groups");
                }}
              />
            ) : (
              <CourseStatsSkeleton />
            ),
          },
          {
            key: "students",
            label: t.staffCourseDetail.tabStudents,
            children: (
              <>
                <Space wrap className="workspace-toolbar staff-filters">
                  <Input.Search
                    aria-label={t.staffCourseDetail.studentsSearchPlaceholder}
                    placeholder={t.staffCourseDetail.studentsSearchPlaceholder}
                    key={sp.q ?? ""}
                    defaultValue={sp.q}
                    allowClear
                    onSearch={(q) => setSp((x) => ({ ...x, q, page: 1 }))}
                  />
                  <Select
                    aria-label={t.staffCourseDetail.studentsAllMajors}
                    placeholder={t.staffCourseDetail.studentsAllMajors}
                    value={sp.majorId}
                    loading={majors.loading}
                    disabled={!!majors.failure}
                    allowClear
                    style={{ width: 150 }}
                    options={majors.data?.items.map((m) => ({ value: m.id, label: m.code }))}
                    onChange={(majorId) => setSp((x) => ({ ...x, majorId, page: 1 }))}
                  />
                  <Select
                    aria-label={language === "en" ? "Filter by room status" : "Lọc theo tình trạng vào phòng"}
                    placeholder={language === "en" ? "Room status" : "Tình trạng phòng"}
                    value={sp.hasRoom}
                    allowClear
                    style={{ width: 170 }}
                    options={[
                      { value: true, label: language === "en" ? "In room" : "Đã có phòng" },
                      { value: false, label: language === "en" ? "No room" : "Chưa có phòng" },
                    ]}
                    onChange={(hasRoom) => setSp((x) => ({ ...x, hasRoom, page: 1 }))}
                  />
                  {hasRole("Admin") && (
                    <Button
                      type="primary"
                      onClick={() => {
                        setSelected([]);
                        setEnrollOpen(true);
                        setStudentSearch("");
                        setSettledStudentSearch("");
                      }}
                    >
                      {t.staffCourseDetail.btnEnrollStudents}
                    </Button>
                  )}
                </Space>

                {majors.failure && (
                  <StaffLoadError
                    title={language === "en" ? "Failed to load major filters" : "Không tải được bộ lọc ngành"}
                    error={majors.failure.error}
                    onRetry={majors.reload}
                  />
                )}

                {students.failure ? (
                  <StaffLoadError
                    title={
                      language === "en" ? "Failed to load student list" : "Không tải được danh sách sinh viên"
                    }
                    error={students.failure.error}
                    onRetry={students.reload}
                  />
                ) : students.loading ? (
                  <TableSkeleton
                    scrollX={860}
                    rows={5}
                    pagination={{ current: sp.page, pageSize: sp.pageSize }}
                    columns={[
                      { title: t.staffCourseDetail.colStudentCode, kind: "code" },
                      { title: t.staffCourseDetail.colFullName, kind: "text" },
                      { title: "Email", kind: "longText" },
                      { title: t.staffCourseDetail.colMajor, kind: "code" },
                      { title: "GPA", kind: "number" },
                      { title: language === "en" ? "Role" : "Vai trò", kind: "tags" },
                      { title: language === "en" ? "Room Status" : "Trạng thái phòng", kind: "tag" },
                      ...(hasRole("Admin")
                        ? [{ title: t.common.actions, kind: "actions" as const, actionWidths: [52] }]
                        : []),
                    ]}
                  />
                ) : (
                  <Table
                    rowKey="id"
                    className="staff-table"
                    scroll={{ x: "max-content" }}
                    size={screens.sm ? "middle" : "small"}
                    dataSource={students.data?.items ?? []}
                    locale={{
                      emptyText: (
                        <EmptyState
                          title={language === "en" ? "No students enrolled" : "Không có sinh viên nào"}
                        />
                      ),
                    }}
                    pagination={{
                      current: sp.page,
                      pageSize: sp.pageSize,
                      total: students.data?.totalItems,
                      showSizeChanger: !!screens.sm,
                      responsive: true,
                      showLessItems: !screens.sm,
                      onChange: (page, pageSize) => setSp((x) => ({ ...x, page, pageSize })),
                    }}
                    columns={[
                      { title: t.staffCourseDetail.colStudentCode, dataIndex: "studentCode" },
                      { title: t.staffCourseDetail.colFullName, dataIndex: "fullName" },
                      { title: "Email", dataIndex: "email" },
                      { title: t.staffCourseDetail.colMajor, dataIndex: "majorCode" },
                      {
                        title: "GPA",
                        dataIndex: "gpa",
                        render: (v: number | null) => formatDecimal(v),
                      },
                      {
                        title: language === "en" ? "Role" : "Vai trò",
                        render: (_: unknown, s: CourseStudent) =>
                          s.roles.length ? s.roles.map((r) => <Tag key={r.id}>{r.name}</Tag>) : "—",
                      },
                      {
                        title: language === "en" ? "Room Status" : "Trạng thái phòng",
                        dataIndex: "hasRoom",
                        render: (v: boolean) =>
                          v ? (
                            <Tag color="green">{language === "en" ? "In room" : "Đã có phòng"}</Tag>
                          ) : (
                            <Tag>{language === "en" ? "No room" : "Chưa có phòng"}</Tag>
                          ),
                      },
                      ...(hasRole("Admin")
                        ? [
                            {
                              title: t.common.actions,
                              render: (_: unknown, s: CourseStudent) => (
                                <Popconfirm
                                  title={t.staffCourseDetail.confirmRemoveStudent}
                                  okText={t.staffCourseDetail.btnRemoveStudent}
                                  cancelText={t.common.cancel}
                                  onConfirm={async () => {
                                    if (await remove(s.id)) refresh();
                                  }}
                                >
                                  <Button danger loading={removing}>
                                    {t.staffCourseDetail.btnRemoveStudent}
                                  </Button>
                                </Popconfirm>
                              ),
                            },
                          ]
                        : []),
                    ]}
                  />
                )}
              </>
            ),
          },
          {
            key: "rooms",
            label: t.staffCourseDetail.tabRooms,
            children: (
              <>
                <Space wrap className="workspace-toolbar staff-filters">
                  <Input.Search
                    aria-label={t.staffCourseDetail.roomsSearchPlaceholder}
                    placeholder={t.staffCourseDetail.roomsSearchPlaceholder}
                    key={rp.q ?? ""}
                    defaultValue={rp.q}
                    allowClear
                    onSearch={(q) => setRp((x) => ({ ...x, q, page: 1 }))}
                  />
                  <Select
                    aria-label={language === "en" ? "Filter by room status" : "Lọc theo trạng thái phòng"}
                    placeholder={t.staffCourses.allStatus}
                    value={rp.status}
                    allowClear
                    style={{ width: 170 }}
                    options={Object.entries(roomStatusLabel)
                      .filter(([value]) => value !== "Cancelled" || hasRole("Admin"))
                      .map(([value, v]) => ({
                        value,
                        label: translations[language].roomStatus[value as RoomStatus] ?? v.text,
                      }))}
                    onChange={(roomStatus) => setRp((x) => ({ ...x, status: roomStatus, page: 1 }))}
                  />
                </Space>

                {rooms.failure ? (
                  <StaffLoadError
                    title={language === "en" ? "Failed to load room list" : "Không tải được danh sách phòng"}
                    error={rooms.failure.error}
                    onRetry={rooms.reload}
                  />
                ) : rooms.loading ? (
                  <TableSkeleton
                    scrollX={860}
                    rows={5}
                    showExpandColumn
                    pagination={{ current: rp.page, pageSize: rp.pageSize }}
                    columns={[
                      { title: t.staffCourseDetail.colRoomCode, kind: "code" },
                      { title: t.staffCourseDetail.colRoomName, kind: "text" },
                      { title: language === "en" ? "Required GPA" : "GPA yêu cầu", kind: "number" },
                      { title: language === "en" ? "Needed Roles" : "Vai trò cần tuyển", kind: "tags" },
                      { title: t.staffCourseDetail.colRoomStatus, kind: "tag" },
                      { title: t.staffCourseDetail.colMemberCount, kind: "number" },
                      { title: language === "en" ? "Major Mix" : "Phân bố ngành", kind: "tags" },
                      { title: t.staffCourseDetail.colLeader, kind: "text" },
                      { title: language === "en" ? "Created At" : "Ngày tạo", kind: "date" },
                    ]}
                  />
                ) : (
                  <Table
                    rowKey="id"
                    className="staff-table"
                    scroll={{ x: "max-content" }}
                    size={screens.sm ? "middle" : "small"}
                    dataSource={rooms.data?.items ?? []}
                    locale={{
                      emptyText: (
                        <EmptyState title={language === "en" ? "No rooms found" : "Không có phòng nào"} />
                      ),
                    }}
                    pagination={{
                      current: rp.page,
                      pageSize: rp.pageSize,
                      total: rooms.data?.totalItems,
                      showSizeChanger: !!screens.sm,
                      responsive: true,
                      showLessItems: !screens.sm,
                      onChange: (page, pageSize) => setRp((x) => ({ ...x, page, pageSize })),
                    }}
                    expandable={{
                      expandedRowRender: (r, _index, _indent, expanded) =>
                        expanded ? (
                          <StaffRoomDetails room={r} groupType={type} renderMembers={memberList} />
                        ) : null,
                    }}
                    columns={[
                      { title: t.staffCourseDetail.colRoomCode, dataIndex: "code" },
                      {
                        title: t.staffCourseDetail.colRoomName,
                        render: (_: unknown, r: RoomSummary) => r.name || r.code,
                      },
                      {
                        title: language === "en" ? "Required GPA" : "GPA yêu cầu",
                        render: (_: unknown, r: RoomSummary) =>
                          r.requiredGpa != null
                            ? formatDecimal(r.requiredGpa)
                            : language === "en"
                              ? "None"
                              : "Không yêu cầu",
                      },
                      {
                        title: language === "en" ? "Needed Roles" : "Vai trò cần tuyển",
                        render: (_: unknown, r: RoomSummary) =>
                          r.neededRoles.length
                            ? r.neededRoles.map((role) => <Tag key={role.id}>{role.name}</Tag>)
                            : "—",
                      },
                      {
                        title: t.staffCourseDetail.colRoomStatus,
                        dataIndex: "status",
                        render: (s: RoomSummary["status"]) => <RoomStatusTag status={s} />,
                      },
                      {
                        title: t.staffCourseDetail.colMemberCount,
                        render: (_: unknown, r: RoomSummary) =>
                          type ? `${r.memberCount}/${type.maxMemberCount}` : r.memberCount,
                      },
                      {
                        title: language === "en" ? "Major Mix" : "Phân bố ngành",
                        dataIndex: "majors",
                        render: (m: RoomSummary["majors"]) => <MajorCounts majors={m} />,
                      },
                      { title: t.staffCourseDetail.colLeader, dataIndex: "leaderName" },
                      {
                        title: language === "en" ? "Created At" : "Ngày tạo",
                        dataIndex: "createdAt",
                        render: formatDateTime,
                      },
                    ]}
                  />
                )}
              </>
            ),
          },
          {
            key: "groups",
            label: t.staffCourseDetail.tabGroups,
            children: (
              <>
                <Input.Search
                  aria-label={t.staffCourseDetail.groupsSearchPlaceholder}
                  placeholder={t.staffCourseDetail.groupsSearchPlaceholder}
                  key={gp.q ?? ""}
                  defaultValue={gp.q}
                  allowClear
                  style={{ maxWidth: 300, marginBottom: 16 }}
                  onSearch={(q) => setGp((x) => ({ ...x, q, page: 1 }))}
                />

                {groups.failure ? (
                  <StaffLoadError
                    title={language === "en" ? "Failed to load team list" : "Không tải được danh sách nhóm"}
                    error={groups.failure.error}
                    onRetry={groups.reload}
                  />
                ) : groups.loading ? (
                  <TableSkeleton
                    scrollX={600}
                    rows={5}
                    showExpandColumn
                    pagination={{ current: gp.page, pageSize: gp.pageSize }}
                    columns={[
                      { title: t.staffCourseDetail.colGroupCode, kind: "code" },
                      { title: t.staffCourseDetail.colGroupName, kind: "text" },
                      { title: language === "en" ? "Members" : "Số thành viên", kind: "number" },
                      { title: language === "en" ? "Leader" : "Trưởng nhóm", kind: "text" },
                      { title: language === "en" ? "Created At" : "Ngày thành lập", kind: "date" },
                    ]}
                  />
                ) : (
                  <Table
                    rowKey="id"
                    className="staff-table"
                    scroll={{ x: "max-content" }}
                    size={screens.sm ? "middle" : "small"}
                    dataSource={groups.data?.items ?? []}
                    locale={{
                      emptyText: (
                        <EmptyState
                          title={
                            language === "en"
                              ? "No official teams formed yet"
                              : "Chưa có nhóm nào được hoàn tất"
                          }
                        />
                      ),
                    }}
                    pagination={{
                      current: gp.page,
                      pageSize: gp.pageSize,
                      total: groups.data?.totalItems,
                      showSizeChanger: !!screens.sm,
                      responsive: true,
                      showLessItems: !screens.sm,
                      onChange: (page, pageSize) => setGp((x) => ({ ...x, page, pageSize })),
                    }}
                    expandable={{ expandedRowRender: (g) => memberList(g.members) }}
                    columns={[
                      { title: t.staffCourseDetail.colGroupCode, dataIndex: "code" },
                      {
                        title: t.staffCourseDetail.colGroupName,
                        render: (_: unknown, g: Group) => g.name || g.code,
                      },
                      {
                        title: language === "en" ? "Members" : "Số thành viên",
                        render: (_: unknown, g: Group) => g.members.length,
                      },
                      {
                        title: language === "en" ? "Leader" : "Trưởng nhóm",
                        render: (_: unknown, g: Group) => g.members.find((m) => m.isLeader)?.fullName ?? "—",
                      },
                      {
                        title: language === "en" ? "Created At" : "Ngày thành lập",
                        dataIndex: "createdAt",
                        render: formatDateTime,
                      },
                    ]}
                  />
                )}
              </>
            ),
          },
        ]}
      />

      <Modal
        title={t.staffCourseDetail.enrollModalTitle}
        open={enrollOpen}
        destroyOnHidden
        okText={t.staffCourseDetail.enrollModalOk}
        cancelText={t.common.cancel}
        onCancel={() => setEnrollOpen(false)}
        confirmLoading={enrolling}
        okButtonProps={{ disabled: selected.length === 0 }}
        onOk={async () => {
          const result = await enroll(selected);
          if (result) {
            message.info(
              language === "en"
                ? `Enrolled: ${result.added}; skipped (already in course): ${result.skipped}`
                : `Đã thêm mới: ${result.added}; bỏ qua (đã có): ${result.skipped}`,
            );
            setEnrollOpen(false);
            refresh();
          }
        }}
      >
        <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
          {language === "en"
            ? `Search by student ID, name, or email to enroll into course ${course.code}.`
            : `Tìm kiếm theo mã sinh viên, họ tên hoặc email để ghi danh vào học phần ${course.code}.`}
        </Typography.Paragraph>
        <Select
          mode="multiple"
          showSearch
          filterOption={false}
          style={{ width: "100%" }}
          aria-label={t.staffCourseDetail.enrollModalSearchPlaceholder}
          placeholder={t.staffCourseDetail.enrollModalSearchPlaceholder}
          value={selected}
          onChange={setSelected}
          onSearch={setStudentSearch}
          loading={searchingStudents || choices.loading}
          options={choices.data?.items.map((s) => ({
            value: s.id,
            label: `${s.studentCode} - ${s.fullName}`,
          }))}
        />
        {choices.failure && (
          <StaffLoadError
            title={language === "en" ? "Failed to find students" : "Không tìm được sinh viên"}
            error={choices.failure.error}
            onRetry={choices.reload}
          />
        )}
      </Modal>
    </div>
  );
}
