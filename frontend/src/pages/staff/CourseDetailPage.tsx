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
  Spin,
  Table,
  Tag,
  Tabs,
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
import { formatDateTime } from "@/components/format";
import { roomStatusLabel } from "@/components/labels";
import { CourseStatusTag, MajorCounts, RoomStatusTag } from "@/components/StatusTag";
import { useApiAction } from "@/components/useApiAction";
import { CourseActions } from "@/features/staff/CourseActions";
import { CourseStatistics } from "@/features/staff/CourseStatistics";
import { StaffLoadError } from "@/features/staff/StaffLoadError";
import { StaffRoomDetails } from "@/features/staff/StaffRoomDetails";
import { useStaffQuery } from "@/features/staff/useStaffQuery";
import "@/features/staff/staffPages.css";
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
  const refresh = () => {
    courseQuery.reload();
    stats.reload();
    students.reload();
    rooms.reload();
    groups.reload();
  };
  const [enroll, enrolling] = useApiAction(
    (ids: string[]) => coursesApi.enroll(courseId, ids),
    "Đã xử lý danh sách sinh viên",
  );
  const [remove, removing] = useApiAction(async (id: string) => {
    await coursesApi.removeStudent(courseId, id);
    return true;
  }, "Đã gỡ sinh viên");
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
      dataSource={members}
      columns={[
        { title: "Mã SV", dataIndex: "studentCode" },
        { title: "Họ tên", dataIndex: "fullName" },
        { title: "Ngành", dataIndex: "majorCode" },
        {
          title: "Vai trò",
          dataIndex: "isLeader",
          render: (v: boolean) => (v ? "Trưởng nhóm" : "Thành viên"),
        },
      ]}
    />
  );
  if (!course) {
    return (
      <div className="staff-page">
        <Link to="/staff/courses">Danh sách Course</Link>
        <Typography.Title level={2}>Chi tiết Course</Typography.Title>
        {courseQuery.failure ? (
          <StaffLoadError
            title="Không tải được Course"
            error={courseQuery.failure.error}
            onRetry={courseQuery.reload}
          />
        ) : (
          <Spin aria-label="Đang tải Course" />
        )}
      </div>
    );
  }
  return (
    <div className="staff-page">
      <Link to="/staff/courses">Danh sách Course</Link>
      <Typography.Title level={2}>
        {course.code} <CourseStatusTag status={course.status} />
      </Typography.Title>
      {hasRole("Admin", "HeadOfDepartment") && (
        <CourseActions course={course} onChanged={refresh} allowDelete={false} />
      )}
      <Descriptions
        bordered
        column={{ xs: 1, sm: 2, md: 2, lg: 2, xl: 2, xxl: 2 }}
        size="small"
        style={{ marginTop: 16 }}
        items={[
          { key: "type", label: "Loại nhóm", children: course.groupTypeName },
          {
            key: "rule",
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
          },
          { key: "start", label: "Bắt đầu", children: formatDateTime(course.startTime) },
          { key: "end", label: "Hạn", children: formatDateTime(course.deadline) },
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
              <Spin aria-label="Đang tải thống kê" />
            ),
          },
          {
            key: "students",
            label: "Sinh viên",
            children: (
              <>
                <Space wrap className="staff-filters" style={{ marginBottom: 16 }}>
                  <Input.Search
                    placeholder="Tìm sinh viên"
                    key={sp.q ?? ""}
                    defaultValue={sp.q}
                    allowClear
                    onSearch={(q) => setSp((x) => ({ ...x, q, page: 1 }))}
                  />
                  <Select
                    placeholder="Ngành"
                    value={sp.majorId}
                    loading={majors.loading}
                    disabled={!!majors.failure}
                    allowClear
                    style={{ width: 150 }}
                    options={majors.data?.items.map((m) => ({ value: m.id, label: m.code }))}
                    onChange={(majorId) => setSp((x) => ({ ...x, majorId, page: 1 }))}
                  />
                  <Select
                    placeholder="Phòng"
                    value={sp.hasRoom}
                    allowClear
                    style={{ width: 160 }}
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
                ) : (
                  <Table
                    rowKey="id"
                    className="staff-table"
                    scroll={{ x: "max-content" }}
                    size={screens.sm ? "middle" : "small"}
                    loading={students.loading}
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
                      emptyText: students.loading ? null : (
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
              </>
            ),
          },
          {
            key: "rooms",
            label: "Phòng",
            children: (
              <>
                <Space wrap className="staff-filters" style={{ marginBottom: 16 }}>
                  <Input.Search
                    placeholder="Tìm mã phòng"
                    key={rp.q ?? ""}
                    defaultValue={rp.q}
                    allowClear
                    onSearch={(q) => setRp((x) => ({ ...x, q, page: 1 }))}
                  />
                  <Select
                    placeholder="Trạng thái"
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
                ) : (
                  <Table
                    rowKey="id"
                    className="staff-table"
                    scroll={{ x: "max-content" }}
                    size={screens.sm ? "middle" : "small"}
                    loading={rooms.loading}
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
                      emptyText: rooms.loading ? null : (
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
              </>
            ),
          },
          {
            key: "groups",
            label: "Nhóm",
            children: (
              <>
                <Input.Search
                  placeholder="Tìm mã nhóm"
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
                ) : (
                  <Table
                    rowKey="id"
                    className="staff-table"
                    scroll={{ x: "max-content" }}
                    size={screens.sm ? "middle" : "small"}
                    loading={groups.loading}
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
                      emptyText: groups.loading ? null : (
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
              </>
            ),
          },
        ]}
      />
      <Modal
        title="Thêm sinh viên"
        open={enrollOpen}
        onCancel={() => setEnrollOpen(false)}
        confirmLoading={enrolling}
        okButtonProps={{ disabled: selected.length === 0 }}
        onOk={async () => {
          const result = await enroll(selected);
          if (result) {
            message.info(`Thêm mới: ${result.added}; bỏ qua: ${result.skipped}`);
            setEnrollOpen(false);
            refresh();
          }
        }}
      >
        <Select
          mode="multiple"
          showSearch
          filterOption={false}
          style={{ width: "100%" }}
          placeholder="Tìm sinh viên"
          value={selected}
          onChange={setSelected}
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
          />
        )}
      </Modal>
    </div>
  );
}
