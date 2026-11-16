import { CourseDetailSkeleton, CourseStatsSkeleton, TableSkeleton } from "@/features/WorkspaceSkeletons";
import "@/features/workspace.css";
import { ArrowLeftOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Descriptions,
  Input,
  Empty,
  Grid,
  Modal,
  Popconfirm,
  Select,
  Space,
<<<<<<< Updated upstream
=======
  Spin,
  Statistic,
>>>>>>> Stashed changes
  Table,
  Tabs,
  Tag,
  Typography,
} from "antd";
import { useCallback, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  coursesApi,
  referenceApi,
  type CourseStudent,
  type CourseStudentParams,
  type Group,
  type PageParams,
  type RoomListParams,
  type RoomSummary,
} from "@/api";
import { useAuth } from "@/auth/AuthContext";
import { EmptyState } from "@/components/EmptyState";
import { formatDateTime, formatDecimal } from "@/components/format";
import { roomStatusLabel } from "@/components/labels";
import { CourseStatusTag, MajorCounts, RoomStatusTag } from "@/components/StatusTag";
import { useApiAction } from "@/components/useApiAction";
import { CourseActions } from "@/features/staff/CourseActions";
<<<<<<< Updated upstream
import { CourseStatistics } from "@/features/staff/CourseStatistics";
import { StaffLoadError } from "@/features/staff/StaffLoadError";
import { StaffRoomDetails } from "@/features/staff/StaffRoomDetails";
import { useStaffQuery } from "@/features/staff/useStaffQuery";
import "@/features/staff/staffPages.css";
=======
import { RoomCompositionSummary } from "@/features/student/RoomCompositionSummary";
import { CourseDetailSkeleton } from "@/features/WorkspaceSkeletons";

>>>>>>> Stashed changes
export function CourseDetailPage() {
  const { courseId = "" } = useParams();
  return <CourseDetail key={courseId} courseId={courseId} />;
}

function CourseDetail({ courseId }: { courseId: string }) {
  const { hasRole } = useAuth();
  const screens = Grid.useBreakpoint();
  const { message } = App.useApp();
<<<<<<< Updated upstream
  const [tab, setTab] = useState("stats");
  const [sp, setSp] = useState<CourseStudentParams>({ page: 1, pageSize: 20 });
  const [rp, setRp] = useState<RoomListParams>({ page: 1, pageSize: 20 });
  const [gp, setGp] = useState<PageParams>({ page: 1, pageSize: 20 });
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
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
  const majors = useStaffQuery(course && tab === "students" ? referenceApi.majors : null);
  const groupTypes = useStaffQuery(course ? referenceApi.groupTypes : null);
  const searchStudents = useCallback(
    () => referenceApi.students({ q: studentSearch, page: 1, pageSize: 100 }),
    [studentSearch],
  );
  const choices = useStaffQuery(enrollOpen ? searchStudents : null);
=======
  const showError = useShowError();

  const [course, setCourse] = useState<Course>();
  const [stats, setStats] = useState<CourseStats>();
  const [types, setTypes] = useState<GroupType[]>([]);
  const [majors, setMajors] = useState<Lookup[]>([]);
  const [tab, setTab] = useState("students");
  const [loading, setLoading] = useState(false);

  const [sp, setSp] = useState<CourseStudentParams>({ page: 1, pageSize: 20 });
  const [rp, setRp] = useState<RoomListParams>({ page: 1, pageSize: 20 });
  const [gp, setGp] = useState<PageParams>({ page: 1, pageSize: 20 });

  const [students, setStudents] = useState<Paged<CourseStudent>>();
  const [rooms, setRooms] = useState<Paged<RoomSummary>>();
  const [groups, setGroups] = useState<Paged<Group>>();
  const [details, setDetails] = useState<Record<string, Room>>({});

  const [analysisTarget, setAnalysisTarget] = useState<RoomSummary>();
  const [analysis, setAnalysis] = useState<CompositionAnalysis>();
  const [checkingRoomId, setCheckingRoomId] = useState<string>();

  const [enrollOpen, setEnrollOpen] = useState(false);
  const [choices, setChoices] = useState<Student[]>([]);
  const [selected, setSelected] = useState<string[]>([]);

  const loadHeader = useCallback(() => {
    Promise.all([coursesApi.get(courseId), coursesApi.stats(courseId)])
      .then(([c, s]) => {
        setCourse(c);
        setStats(s);
      })
      .catch(showError);
  }, [courseId, showError]);

  const loadTab = useCallback(() => {
    setLoading(true);
    const request =
      tab === "students"
        ? coursesApi.students(courseId, sp).then(setStudents)
        : tab === "rooms"
          ? coursesApi.rooms(courseId, rp).then(setRooms)
          : coursesApi.groups(courseId, gp).then(setGroups);
    request.catch(showError).finally(() => setLoading(false));
  }, [courseId, tab, sp, rp, gp, showError]);

  useEffect(loadHeader, [loadHeader]);
  useEffect(loadTab, [loadTab]);

  useEffect(() => {
    Promise.all([referenceApi.majors(), referenceApi.groupTypes()])
      .then(([m, t]) => {
        setMajors(m.items);
        setTypes(t.items);
      })
      .catch(showError);
  }, [showError]);

>>>>>>> Stashed changes
  const refresh = () => {
    courseQuery.reload();
    stats.reload();
    students.reload();
    rooms.reload();
    groups.reload();
  };

  const [enroll, enrolling] = useApiAction(
    (ids: string[]) => coursesApi.enroll(courseId, ids),
    "Đã cập nhật danh sách sinh viên",
  );
  const [remove, removing] = useApiAction(async (id: string) => {
    await coursesApi.removeStudent(courseId, id);
    return true;
<<<<<<< Updated upstream
  }, "Đã gỡ sinh viên");
  const type = groupTypes.data?.items.find((t) => t.id === course?.groupTypeId);
=======
  }, "Đã gỡ sinh viên khỏi học phần");

  const searchStudents = (q: string) =>
    referenceApi
      .students({ q, page: 1, pageSize: 100 })
      .then((x) => setChoices(x.items))
      .catch(showError);

  const checkComposition = async (roomSummary: RoomSummary) => {
    setCheckingRoomId(roomSummary.id);
    try {
      const result = await roomsApi.composition(roomSummary.id);
      setAnalysisTarget(roomSummary);
      setAnalysis(result);
    } catch (e) {
      if (e instanceof ApiError && e.status === 503) {
        message.error("Dịch vụ kiểm tra cơ cấu tạm thời không phản hồi.");
      } else {
        showError(e);
      }
    } finally {
      setCheckingRoomId(undefined);
    }
  };

  const type = types.find((t) => t.id === course?.groupTypeId);

>>>>>>> Stashed changes
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
      locale={{ emptyText: <EmptyState title="Chưa có thành viên" /> }}
      dataSource={members}
      columns={[
        { title: "Mã SV", dataIndex: "studentCode" },
        { title: "Họ tên", dataIndex: "fullName" },
        { title: "Ngành", dataIndex: "majorCode" },
        {
          title: "Vai trò",
          dataIndex: "isLeader",
          render: (v: boolean) => (v ? <Tag color="orange">Trưởng nhóm</Tag> : "Thành viên"),
        },
      ]}
    />
  );
<<<<<<< Updated upstream
  if (courseQuery.loading) {
=======

  if (!course) {
>>>>>>> Stashed changes
    return (
      <CourseDetailSkeleton canManage={hasRole("Admin", "HeadOfDepartment")} isAdmin={hasRole("Admin")} />
    );
  }
<<<<<<< Updated upstream
  if (!course) {
    return (
      <div className="workspace-page staff-page">
        <Link to="/staff/courses">Danh sách Course</Link>
        <Typography.Title level={2}>Chi tiết Course</Typography.Title>
        {courseQuery.failure && (
          <StaffLoadError
            title="Không tải được Course"
            error={courseQuery.failure.error}
            onRetry={courseQuery.reload}
          />
        )}
      </div>
    );
  }
=======

>>>>>>> Stashed changes
  return (
    <div className="workspace-page staff-page">
      <header className="workspace-heading">
        <div>
<<<<<<< Updated upstream
          <Link to="/staff/courses">← Quản lý Course</Link>
          <Typography.Title level={1}>
            {course.code} <CourseStatusTag status={course.status} />
          </Typography.Title>
=======
          <Link className="workspace-heading__back" to="/staff/courses">
            <ArrowLeftOutlined aria-hidden="true" />
            Quay lại Quản lý học phần
          </Link>
          <div className="workspace-heading__title-row">
            <Typography.Title level={1}>{course.code}</Typography.Title>
            <CourseStatusTag status={course.status} />
          </div>
          <p>Theo dõi sĩ số, các phòng đang hoạt động và nhóm đã hoàn tất trong học phần.</p>
>>>>>>> Stashed changes
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
          { key: "type", label: "Loại nhóm", children: course.groupTypeName },
          {
            key: "rule",
<<<<<<< Updated upstream
            label: "Quy định",
            children: type ? (
              <>
                <div>
                  {type.minMemberCount}–{type.maxMemberCount} thành viên, ít nhất {type.minMajorCount} ngành
                </div>
                {type.majors.length > 0 && (
                  <div>
                    {type.majors.map((m) => `${m.majorCode} ${m.minQuantity}–${m.maxQuantity}`).join(", ")}
                  </div>
                )}
              </>
            ) : groupTypes.loading ? (
              "Đang tải quy định…"
            ) : (
              "Không có thông tin quy định"
            ),
=======
            label: "Quy định cơ cấu",
            children: type
              ? `${type.minMemberCount}–${type.maxMemberCount} thành viên, tối thiểu ${type.minMajorCount} ngành; ${type.majors.map((m) => `${m.majorCode}: ${m.minQuantity}–${m.maxQuantity}`).join(", ")}`
              : "—",
>>>>>>> Stashed changes
          },
          { key: "start", label: "Bắt đầu", children: formatDateTime(course.startTime) },
          { key: "end", label: "Hạn ghép nhóm", children: formatDateTime(course.deadline) },
        ]}
      />
<<<<<<< Updated upstream
      {groupTypes.failure && (
        <StaffLoadError
          title="Không tải được quy định loại nhóm"
          error={groupTypes.failure.error}
          onRetry={groupTypes.reload}
        />
=======

      {stats && (
        <Card title="Tiến độ ghép nhóm" className="workspace-section">
          <div className="workspace-metrics">
            <Statistic title="Tổng sinh viên" value={stats.totalStudents} />
            <Statistic title="Đã vào phòng" value={stats.studentsInRoom} />
            <Statistic title="Đã có nhóm" value={stats.studentsInGroup} />
            <Statistic title="Số nhóm" value={stats.groupCount} />
          </div>
          <div className="workspace-section">
            Tỉ lệ sinh viên đã hoàn tất nhóm{" "}
            <Progress
              strokeColor="#c2410c"
              percent={
                stats.totalStudents ? Math.round((stats.studentsInGroup / stats.totalStudents) * 100) : 0
              }
            />
          </div>
          <Space wrap style={{ marginTop: 8 }}>
            {Object.entries(roomStatusLabel)
              .filter(([k]) => k !== "Cancelled" || hasRole("Admin"))
              .map(([k, v]) => (
                <Tag key={k} color={v.color}>
                  {v.text}: {stats.roomsByStatus[k] ?? 0}
                </Tag>
              ))}
          </Space>
        </Card>
>>>>>>> Stashed changes
      )}

      <Tabs
        className="workspace-section"
        activeKey={tab}
        onChange={setTab}
        items={[
          {
            key: "stats",
            label: "Thống kê",
            children: stats.failure ? (
              <StaffLoadError
                title="Không tải được thống kê"
                error={stats.failure.error}
                onRetry={stats.reload}
              />
            ) : stats.data ? (
              <CourseStatistics
                stats={stats.data}
                canSeeCancelled={hasRole("Admin")}
                onRefresh={stats.reload}
                onShowUnassigned={() => {
                  setSp({ page: 1, pageSize: sp.pageSize, hasRoom: false });
                  setTab("students");
                }}
                onShowRooms={(status) => {
                  setRp({ page: 1, pageSize: rp.pageSize, status });
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
            label: "Sinh viên",
            children: (
              <>
                <Space wrap className="workspace-toolbar staff-filters">
                  <Input.Search
                    aria-label="Tìm sinh viên"
<<<<<<< Updated upstream
                    placeholder="Tìm sinh viên"
                    key={sp.q ?? ""}
                    defaultValue={sp.q}
=======
                    placeholder="Tìm mã SV, họ tên, email..."
>>>>>>> Stashed changes
                    allowClear
                    onSearch={(q) => setSp((x) => ({ ...x, q, page: 1 }))}
                  />
                  <Select
                    aria-label="Lọc theo ngành"
<<<<<<< Updated upstream
                    placeholder="Ngành"
                    value={sp.majorId}
                    loading={majors.loading}
                    disabled={!!majors.failure}
=======
                    placeholder="Tất cả ngành"
>>>>>>> Stashed changes
                    allowClear
                    style={{ width: 150 }}
                    options={majors.data?.items.map((m) => ({ value: m.id, label: m.code }))}
                    onChange={(majorId) => setSp((x) => ({ ...x, majorId, page: 1 }))}
                  />
                  <Select
                    aria-label="Lọc theo tình trạng vào phòng"
<<<<<<< Updated upstream
                    placeholder="Phòng"
                    value={sp.hasRoom}
=======
                    placeholder="Tình trạng phòng"
>>>>>>> Stashed changes
                    allowClear
                    style={{ width: 170 }}
                    options={[
                      { value: true, label: "Đã có phòng" },
                      { value: false, label: "Chưa có phòng" },
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
                      }}
                    >
                      Thêm sinh viên
                    </Button>
                  )}
                </Space>
<<<<<<< Updated upstream
                {majors.failure && (
                  <StaffLoadError
                    title="Không tải được bộ lọc ngành"
                    error={majors.failure.error}
                    onRetry={majors.reload}
                  />
                )}
                {students.failure ? (
                  <StaffLoadError
                    title="Không tải được danh sách sinh viên"
                    error={students.failure.error}
                    onRetry={students.reload}
                  />
                ) : students.loading ? (
                  <TableSkeleton
                    scrollX={840}
                    rows={5}
                    pagination={{
                      current: sp.page,
                      pageSize: sp.pageSize,
                    }}
                    columns={[
                      { title: "Mã SV", kind: "code" },
                      { title: "Họ tên", kind: "text" },
                      { title: "Email", kind: "longText" },
                      { title: "Ngành", kind: "code" },
                      { title: "GPA", kind: "number" },
                      { title: "Vai trò", kind: "tags" },
                      { title: "Phòng", kind: "text" },
                      ...(hasRole("Admin")
                        ? [{ title: "Thao tác", kind: "actions" as const, actionWidths: [52] }]
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
                    pagination={{
                      current: sp.page,
                      pageSize: sp.pageSize,
                      total: students.data?.totalItems,
                      showSizeChanger: !!screens.sm,
                      responsive: true,
                      showLessItems: !screens.sm,
                      onChange: (page, pageSize) => setSp((x) => ({ ...x, page, pageSize })),
                    }}
                    locale={{
                      emptyText: (
                        <Empty
                          image={Empty.PRESENTED_IMAGE_SIMPLE}
                          description="Không có sinh viên phù hợp"
                        />
                      ),
                    }}
                    columns={[
                      { title: "Mã SV", dataIndex: "studentCode" },
                      { title: "Họ tên", dataIndex: "fullName" },
                      { title: "Email", dataIndex: "email" },
                      { title: "Ngành", dataIndex: "majorCode" },
                      {
                        title: "GPA",
                        dataIndex: "gpa",
                        render: (v: number | null) => (v == null ? "—" : v.toFixed(2)),
                      },
                      {
                        title: "Vai trò",
                        render: (_: unknown, s: CourseStudent) =>
                          s.roles.length ? s.roles.map((r) => <Tag key={r.id}>{r.name}</Tag>) : "—",
                      },
                      {
                        title: "Phòng",
                        dataIndex: "hasRoom",
                        render: (v: boolean) => (v ? "Đã có phòng" : "Chưa có phòng"),
                      },
                      ...(hasRole("Admin")
                        ? [
                            {
                              title: "Thao tác",
                              render: (_: unknown, s: CourseStudent) => (
                                <Popconfirm
                                  title="Gỡ sinh viên khỏi Course?"
                                  onConfirm={async () => {
                                    if (await remove(s.id)) refresh();
                                  }}
                                >
                                  <Button danger loading={removing}>
                                    Gỡ
                                  </Button>
                                </Popconfirm>
                              ),
                            },
                          ]
                        : []),
                    ]}
                  />
                )}
=======
                <Table
                  scroll={{ x: 860 }}
                  rowKey="id"
                  loading={loading}
                  dataSource={students?.items ?? []}
                  locale={{ emptyText: <EmptyState title="Không có sinh viên nào" /> }}
                  pagination={{
                    current: sp.page,
                    pageSize: sp.pageSize,
                    total: students?.totalItems,
                    showSizeChanger: true,
                    onChange: (page, pageSize) => setSp((x) => ({ ...x, page, pageSize })),
                  }}
                  columns={[
                    { title: "Mã SV", dataIndex: "studentCode" },
                    { title: "Họ tên", dataIndex: "fullName" },
                    { title: "Email", dataIndex: "email" },
                    { title: "Ngành", dataIndex: "majorCode" },
                    {
                      title: "GPA",
                      dataIndex: "gpa",
                      render: (v: number | null) => formatDecimal(v),
                    },
                    {
                      title: "Vai trò",
                      render: (_: unknown, s: CourseStudent) =>
                        s.roles.length ? s.roles.map((r) => <Tag key={r.id}>{r.name}</Tag>) : "—",
                    },
                    {
                      title: "Trạng thái phòng",
                      dataIndex: "hasRoom",
                      render: (v: boolean) =>
                        v ? <Tag color="green">Đã có phòng</Tag> : <Tag>Chưa có phòng</Tag>,
                    },
                    ...(hasRole("Admin")
                      ? [
                          {
                            title: "Thao tác",
                            render: (_: unknown, s: CourseStudent) => (
                              <Popconfirm
                                title="Gỡ sinh viên khỏi học phần này?"
                                okText="Gỡ"
                                cancelText="Hủy"
                                onConfirm={async () => {
                                  if (await remove(s.id)) refresh();
                                }}
                              >
                                <Button danger loading={removing}>
                                  Gỡ
                                </Button>
                              </Popconfirm>
                            ),
                          },
                        ]
                      : []),
                  ]}
                />
>>>>>>> Stashed changes
              </>
            ),
          },
          {
            key: "rooms",
            label: "Phòng",
            children: (
              <>
                <Space wrap className="workspace-toolbar staff-filters">
                  <Input.Search
<<<<<<< Updated upstream
                    aria-label="Tìm mã phòng"
                    placeholder="Tìm mã phòng"
                    key={rp.q ?? ""}
                    defaultValue={rp.q}
=======
                    aria-label="Tìm phòng"
                    placeholder="Tìm tên nhóm, dự án, mã phòng..."
>>>>>>> Stashed changes
                    allowClear
                    onSearch={(q) => setRp((x) => ({ ...x, q, page: 1 }))}
                  />
                  <Select
                    aria-label="Lọc theo trạng thái phòng"
<<<<<<< Updated upstream
                    placeholder="Trạng thái"
                    value={rp.status}
=======
                    placeholder="Tất cả trạng thái"
>>>>>>> Stashed changes
                    allowClear
                    style={{ width: 170 }}
                    options={Object.entries(roomStatusLabel)
                      .filter(([value]) => value !== "Cancelled" || hasRole("Admin"))
                      .map(([value, v]) => ({ value, label: v.text }))}
                    onChange={(status) => setRp((x) => ({ ...x, status, page: 1 }))}
                  />
                </Space>
<<<<<<< Updated upstream
                {rooms.failure ? (
                  <StaffLoadError
                    title="Không tải được danh sách phòng"
                    error={rooms.failure.error}
                    onRetry={rooms.reload}
                  />
                ) : rooms.loading ? (
                  <TableSkeleton
                    scrollX={820}
                    rows={5}
                    showExpandColumn
                    pagination={{ current: rp.page, pageSize: rp.pageSize }}
                    columns={[
                      { title: "Mã", kind: "code" },
                      { title: "Tên nhóm", kind: "text" },
                      { title: "GPA yêu cầu", kind: "number" },
                      { title: "Vai trò cần tuyển", kind: "tags" },
                      { title: "Trạng thái", kind: "tag" },
                      { title: "Số người", kind: "number" },
                      { title: "Ngành", kind: "tags" },
                      { title: "Trưởng phòng", kind: "text" },
                      { title: "Ngày tạo", kind: "date" },
                    ]}
                  />
                ) : (
                  <Table
                    rowKey="id"
                    className="staff-table"
                    scroll={{ x: "max-content" }}
                    size={screens.sm ? "middle" : "small"}
                    dataSource={rooms.data?.items ?? []}
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
                        expanded ? <StaffRoomDetails roomId={r.id} renderMembers={memberList} /> : null,
                    }}
                    locale={{
                      emptyText: (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có phòng phù hợp" />
                      ),
                    }}
                    columns={[
                      { title: "Mã", dataIndex: "code" },
                      { title: "Tên nhóm", render: (_: unknown, r: RoomSummary) => r.name || r.code },
                      { title: "GPA yêu cầu", render: (_: unknown, r: RoomSummary) => r.requiredGpa ?? "—" },
                      {
                        title: "Vai trò cần tuyển",
                        render: (_: unknown, r: RoomSummary) =>
                          r.neededRoles.map((role) => <Tag key={role.id}>{role.name}</Tag>),
                      },
                      {
                        title: "Trạng thái",
                        dataIndex: "status",
                        render: (s: RoomSummary["status"]) => <RoomStatusTag status={s} />,
                      },
                      { title: "Số người", dataIndex: "memberCount" },
                      {
                        title: "Ngành",
                        dataIndex: "majors",
                        render: (m: RoomSummary["majors"]) => <MajorCounts majors={m} />,
                      },
                      { title: "Trưởng phòng", dataIndex: "leaderName" },
                      { title: "Ngày tạo", dataIndex: "createdAt", render: formatDateTime },
                    ]}
                  />
                )}
=======
                <Table
                  scroll={{ x: 860 }}
                  rowKey="id"
                  loading={loading}
                  dataSource={rooms?.items ?? []}
                  locale={{ emptyText: <EmptyState title="Không có phòng nào" /> }}
                  pagination={{
                    current: rp.page,
                    pageSize: rp.pageSize,
                    total: rooms?.totalItems,
                    showSizeChanger: true,
                    onChange: (page, pageSize) => setRp((x) => ({ ...x, page, pageSize })),
                  }}
                  expandable={{
                    onExpand: (expanded, r) => {
                      if (expanded) {
                        roomsApi
                          .get(r.id)
                          .then((d) => setDetails((x) => ({ ...x, [r.id]: d })))
                          .catch(showError);
                      }
                    },
                    expandedRowRender: (r) => (
                      <Space direction="vertical" style={{ width: "100%" }}>
                        {details[r.id] ? memberList(details[r.id].members) : <Spin size="small" />}
                        <Button loading={checkingRoomId === r.id} onClick={() => void checkComposition(r)}>
                          Kiểm tra cơ cấu phòng
                        </Button>
                      </Space>
                    ),
                  }}
                  columns={[
                    { title: "Mã phòng", dataIndex: "code" },
                    { title: "Tên nhóm", render: (_: unknown, r: RoomSummary) => r.name || r.code },
                    {
                      title: "GPA yêu cầu",
                      render: (_: unknown, r: RoomSummary) =>
                        r.requiredGpa != null ? formatDecimal(r.requiredGpa) : "Không yêu cầu",
                    },
                    {
                      title: "Vai trò cần tuyển",
                      render: (_: unknown, r: RoomSummary) =>
                        r.neededRoles.length
                          ? r.neededRoles.map((role) => <Tag key={role.id}>{role.name}</Tag>)
                          : "—",
                    },
                    {
                      title: "Trạng thái",
                      dataIndex: "status",
                      render: (s: RoomSummary["status"]) => <RoomStatusTag status={s} />,
                    },
                    {
                      title: "Số người",
                      render: (_: unknown, r: RoomSummary) =>
                        type ? `${r.memberCount}/${type.maxMemberCount}` : r.memberCount,
                    },
                    {
                      title: "Phân bố ngành",
                      dataIndex: "majors",
                      render: (m: RoomSummary["majors"]) => <MajorCounts majors={m} />,
                    },
                    { title: "Trưởng phòng", dataIndex: "leaderName" },
                    { title: "Ngày tạo", dataIndex: "createdAt", render: formatDateTime },
                  ]}
                />
>>>>>>> Stashed changes
              </>
            ),
          },
          {
            key: "groups",
            label: "Nhóm chính thức",
            children: (
              <>
                <Input.Search
                  aria-label="Tìm mã nhóm"
<<<<<<< Updated upstream
                  placeholder="Tìm mã nhóm"
                  key={gp.q ?? ""}
                  defaultValue={gp.q}
=======
                  placeholder="Tìm mã nhóm..."
>>>>>>> Stashed changes
                  allowClear
                  style={{ maxWidth: 300, marginBottom: 16 }}
                  onSearch={(q) => setGp((x) => ({ ...x, q, page: 1 }))}
                />
<<<<<<< Updated upstream
                {groups.failure ? (
                  <StaffLoadError
                    title="Không tải được danh sách nhóm"
                    error={groups.failure.error}
                    onRetry={groups.reload}
                  />
                ) : groups.loading ? (
                  <TableSkeleton
                    scrollX={580}
                    rows={5}
                    showExpandColumn
                    pagination={{ current: gp.page, pageSize: gp.pageSize }}
                    columns={[
                      { title: "Mã", kind: "code" },
                      { title: "Số thành viên", kind: "number" },
                      { title: "Trưởng nhóm", kind: "text" },
                      { title: "Ngày thành lập", kind: "date" },
                    ]}
                  />
                ) : (
                  <Table
                    rowKey="id"
                    className="staff-table"
                    scroll={{ x: "max-content" }}
                    size={screens.sm ? "middle" : "small"}
                    dataSource={groups.data?.items ?? []}
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
                    locale={{
                      emptyText: (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có nhóm phù hợp" />
                      ),
                    }}
                    columns={[
                      { title: "Mã", dataIndex: "code" },
                      { title: "Số thành viên", render: (_: unknown, g: Group) => g.members.length },
                      {
                        title: "Trưởng nhóm",
                        render: (_: unknown, g: Group) => g.members.find((m) => m.isLeader)?.fullName ?? "—",
                      },
                      { title: "Ngày thành lập", dataIndex: "createdAt", render: formatDateTime },
                    ]}
                  />
                )}
=======
                <Table
                  scroll={{ x: 600 }}
                  rowKey="id"
                  loading={loading}
                  dataSource={groups?.items ?? []}
                  locale={{ emptyText: <EmptyState title="Chưa có nhóm nào được hoàn tất" /> }}
                  pagination={{
                    current: gp.page,
                    pageSize: gp.pageSize,
                    total: groups?.totalItems,
                    showSizeChanger: true,
                    onChange: (page, pageSize) => setGp((x) => ({ ...x, page, pageSize })),
                  }}
                  expandable={{ expandedRowRender: (g) => memberList(g.members) }}
                  columns={[
                    { title: "Mã nhóm", dataIndex: "code" },
                    { title: "Tên nhóm", render: (_: unknown, g: Group) => g.name || g.code },
                    { title: "Số thành viên", render: (_: unknown, g: Group) => g.members.length },
                    {
                      title: "Trưởng nhóm",
                      render: (_: unknown, g: Group) => g.members.find((m) => m.isLeader)?.fullName ?? "—",
                    },
                    { title: "Ngày thành lập", dataIndex: "createdAt", render: formatDateTime },
                  ]}
                />
>>>>>>> Stashed changes
              </>
            ),
          },
        ]}
      />

      <Modal
        title="Thêm sinh viên vào học phần"
        open={enrollOpen}
        destroyOnHidden
        okText="Thêm sinh viên"
        cancelText="Hủy"
        onCancel={() => setEnrollOpen(false)}
        confirmLoading={enrolling}
        okButtonProps={{ disabled: selected.length === 0 }}
        onOk={async () => {
          const result = await enroll(selected);
          if (result) {
            message.info(`Đã thêm mới: ${result.added}; bỏ qua (đã có): ${result.skipped}`);
            setEnrollOpen(false);
            refresh();
          }
        }}
      >
        <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
          Tìm kiếm theo mã sinh viên, họ tên hoặc email để ghi danh vào học phần {course.code}.
        </Typography.Paragraph>
        <Select
          mode="multiple"
          showSearch
          filterOption={false}
          style={{ width: "100%" }}
          aria-label="Tìm sinh viên"
          placeholder="Nhập mã sinh viên hoặc họ tên..."
          value={selected}
          onChange={setSelected}
<<<<<<< Updated upstream
          onSearch={setStudentSearch}
          loading={choices.loading}
          options={choices.data?.items.map((s) => ({
            value: s.id,
            label: `${s.studentCode} - ${s.fullName}`,
          }))}
        />
        {choices.failure && (
          <StaffLoadError
            title="Không tìm được sinh viên"
            error={choices.failure.error}
            onRetry={choices.reload}
=======
          onSearch={(val) => void searchStudents(val)}
          options={choices.map((s) => ({ value: s.id, label: `${s.studentCode} - ${s.fullName}` }))}
        />
      </Modal>

      <Modal
        title={
          analysisTarget
            ? `Kiểm tra cơ cấu: ${analysisTarget.name || analysisTarget.code}`
            : "Kiểm tra cơ cấu phòng"
        }
        open={!!analysis}
        width={560}
        destroyOnHidden
        onCancel={() => {
          setAnalysis(undefined);
          setAnalysisTarget(undefined);
        }}
        footer={
          <Button
            type="primary"
            onClick={() => {
              setAnalysis(undefined);
              setAnalysisTarget(undefined);
            }}
          >
            Đóng
          </Button>
        }
      >
        {analysis && analysisTarget && (
          <RoomCompositionSummary
            composition={analysis}
            groupType={type}
            majorCounts={analysisTarget.majors}
>>>>>>> Stashed changes
          />
        )}
      </Modal>
    </div>
  );
}
