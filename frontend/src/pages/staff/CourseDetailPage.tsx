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

export function CourseDetailPage() {
  const { courseId = "" } = useParams();
  return <CourseDetail key={courseId} courseId={courseId} />;
}

function CourseDetail({ courseId }: { courseId: string }) {
  const { hasRole } = useAuth();
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
    "Đã cập nhật danh sách sinh viên",
  );
  const [remove, removing] = useApiAction(async (id: string) => {
    await coursesApi.removeStudent(courseId, id);
    return true;
  }, "Đã gỡ sinh viên khỏi học phần");

  const type = groupTypes.data?.items.find((t) => t.id === course?.groupTypeId);

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
              Quay lại Quản lý học phần
            </Link>
            <Typography.Title level={1}>Chi tiết học phần</Typography.Title>
          </div>
        </header>
        {courseQuery.failure && (
          <StaffLoadError
            title="Không tải được học phần"
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
            Quay lại Quản lý học phần
          </Link>
          <div className="workspace-heading__title-row">
            <Typography.Title level={1}>{course.code}</Typography.Title>
            <CourseStatusTag status={course.status} />
          </div>
          <p>Theo dõi sĩ số, các phòng đang hoạt động và nhóm đã hoàn tất trong học phần.</p>
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
            label: "Quy định cơ cấu",
            children: type ? (
              <>
                <div>
                  {type.minMemberCount}–{type.maxMemberCount} thành viên, tối thiểu {type.minMajorCount} ngành
                </div>
                {type.majors.length > 0 && (
                  <div>
                    {type.majors.map((m) => `${m.majorCode}: ${m.minQuantity}–${m.maxQuantity}`).join(", ")}
                  </div>
                )}
              </>
            ) : groupTypes.loading ? (
              "Đang tải quy định..."
            ) : (
              "Chưa có thông tin quy định"
            ),
          },
          { key: "start", label: "Bắt đầu", children: formatDateTime(course.startTime) },
          { key: "end", label: "Hạn ghép nhóm", children: formatDateTime(course.deadline) },
        ]}
      />

      {groupTypes.failure && (
        <StaffLoadError
          title="Không tải được quy định loại nhóm"
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
            label: "Thống kê",
            children: stats.failure ? (
              <StaffLoadError
                title="Không tải được thống kê"
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
                    placeholder="Tìm mã SV, họ tên, email..."
                    key={sp.q ?? ""}
                    defaultValue={sp.q}
                    allowClear
                    onSearch={(q) => setSp((x) => ({ ...x, q, page: 1 }))}
                  />
                  <Select
                    aria-label="Lọc theo ngành"
                    placeholder="Tất cả ngành"
                    value={sp.majorId}
                    loading={majors.loading}
                    disabled={!!majors.failure}
                    allowClear
                    style={{ width: 150 }}
                    options={majors.data?.items.map((m) => ({ value: m.id, label: m.code }))}
                    onChange={(majorId) => setSp((x) => ({ ...x, majorId, page: 1 }))}
                  />
                  <Select
                    aria-label="Lọc theo tình trạng vào phòng"
                    placeholder="Tình trạng phòng"
                    value={sp.hasRoom}
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
                        setSettledStudentSearch("");
                      }}
                    >
                      Thêm sinh viên
                    </Button>
                  )}
                </Space>

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
                    scrollX={860}
                    rows={5}
                    pagination={{ current: sp.page, pageSize: sp.pageSize }}
                    columns={[
                      { title: "Mã SV", kind: "code" },
                      { title: "Họ tên", kind: "text" },
                      { title: "Email", kind: "longText" },
                      { title: "Ngành", kind: "code" },
                      { title: "GPA", kind: "number" },
                      { title: "Vai trò", kind: "tags" },
                      { title: "Trạng thái phòng", kind: "tag" },
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
                    locale={{ emptyText: <EmptyState title="Không có sinh viên nào" /> }}
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
                )}
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
                    aria-label="Tìm phòng"
                    placeholder="Tìm tên nhóm, dự án, mã phòng..."
                    key={rp.q ?? ""}
                    defaultValue={rp.q}
                    allowClear
                    onSearch={(q) => setRp((x) => ({ ...x, q, page: 1 }))}
                  />
                  <Select
                    aria-label="Lọc theo trạng thái phòng"
                    placeholder="Tất cả trạng thái"
                    value={rp.status}
                    allowClear
                    style={{ width: 170 }}
                    options={Object.entries(roomStatusLabel)
                      .filter(([value]) => value !== "Cancelled" || hasRole("Admin"))
                      .map(([value, v]) => ({ value, label: v.text }))}
                    onChange={(status) => setRp((x) => ({ ...x, status, page: 1 }))}
                  />
                </Space>

                {rooms.failure ? (
                  <StaffLoadError
                    title="Không tải được danh sách phòng"
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
                      { title: "Mã phòng", kind: "code" },
                      { title: "Tên nhóm", kind: "text" },
                      { title: "GPA yêu cầu", kind: "number" },
                      { title: "Vai trò cần tuyển", kind: "tags" },
                      { title: "Trạng thái", kind: "tag" },
                      { title: "Số người", kind: "number" },
                      { title: "Phân bố ngành", kind: "tags" },
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
                    locale={{ emptyText: <EmptyState title="Không có phòng nào" /> }}
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
                )}
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
                  placeholder="Tìm mã nhóm..."
                  key={gp.q ?? ""}
                  defaultValue={gp.q}
                  allowClear
                  style={{ maxWidth: 300, marginBottom: 16 }}
                  onSearch={(q) => setGp((x) => ({ ...x, q, page: 1 }))}
                />

                {groups.failure ? (
                  <StaffLoadError
                    title="Không tải được danh sách nhóm"
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
                      { title: "Mã nhóm", kind: "code" },
                      { title: "Tên nhóm", kind: "text" },
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
                    locale={{ emptyText: <EmptyState title="Chưa có nhóm nào được hoàn tất" /> }}
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
                )}
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
          onSearch={setStudentSearch}
          loading={searchingStudents || choices.loading}
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
          />
        )}
      </Modal>
    </div>
  );
}
