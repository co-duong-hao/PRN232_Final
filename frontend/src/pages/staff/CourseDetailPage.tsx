import "@/features/workspace.css";
import {
  App,
  Button,
  Card,
  Descriptions,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Progress,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Tabs,
  Typography,
} from "antd";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ApiError,
  coursesApi,
  referenceApi,
  roomsApi,
  type CompositionAnalysis,
  type Course,
  type CourseStats,
  type CourseStudent,
  type CourseStudentParams,
  type Group,
  type GroupType,
  type Lookup,
  type PageParams,
  type Paged,
  type Room,
  type RoomListParams,
  type RoomSummary,
  type Student,
} from "@/api";
import { useAuth } from "@/auth/AuthContext";
import { formatDateTime } from "@/components/format";
import { roomStatusLabel } from "@/components/labels";
import { CourseStatusTag, MajorCounts, RoomStatusTag } from "@/components/StatusTag";
import { useApiAction, useShowError } from "@/components/useApiAction";
import { CourseActions } from "@/features/staff/CourseActions";
import { CourseDetailSkeleton, CourseStatsSkeleton, TableSkeleton } from "@/features/WorkspaceSkeletons";
export function CourseDetailPage() {
  const { courseId = "" } = useParams();
  const { hasRole } = useAuth();
  const { message } = App.useApp();
  const showError = useShowError();
  const [course, setCourse] = useState<Course>();
  const [stats, setStats] = useState<CourseStats>();
  const [types, setTypes] = useState<GroupType[]>([]);
  const [majors, setMajors] = useState<Lookup[]>([]);
  const [tab, setTab] = useState("students");
  const [headerLoading, setHeaderLoading] = useState(true);
  const [filtersLoading, setFiltersLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [sp, setSp] = useState<CourseStudentParams>({ page: 1, pageSize: 20 });
  const [rp, setRp] = useState<RoomListParams>({ page: 1, pageSize: 20 });
  const [gp, setGp] = useState<PageParams>({ page: 1, pageSize: 20 });
  const [students, setStudents] = useState<Paged<CourseStudent>>();
  const [rooms, setRooms] = useState<Paged<RoomSummary>>();
  const [groups, setGroups] = useState<Paged<Group>>();
  const [details, setDetails] = useState<Record<string, Room>>({});
  const [loadingDetails, setLoadingDetails] = useState<Record<string, boolean>>({});
  const [analysis, setAnalysis] = useState<CompositionAnalysis>();
  const [checking, setChecking] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [choices, setChoices] = useState<Student[]>([]);
  const [searchingStudents, setSearchingStudents] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const loadHeader = useCallback(() => {
    setHeaderLoading(true);
    Promise.all([coursesApi.get(courseId), coursesApi.stats(courseId)])
      .then(([c, s]) => {
        setCourse(c);
        setStats(s);
      })
      .catch(showError)
      .finally(() => setHeaderLoading(false));
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
  useEffect(() => {
    setCourse(undefined);
    setStats(undefined);
    loadHeader();
  }, [loadHeader]);
  useEffect(loadTab, [loadTab]);
  useEffect(() => {
    setFiltersLoading(true);
    Promise.all([referenceApi.majors(), referenceApi.groupTypes()])
      .then(([m, t]) => {
        setMajors(m.items);
        setTypes(t.items);
      })
      .catch(showError)
      .finally(() => setFiltersLoading(false));
  }, [showError]);
  const refresh = () => {
    loadHeader();
    loadTab();
  };
  const [enroll, enrolling] = useApiAction(
    (ids: string[]) => coursesApi.enroll(courseId, ids),
    "Đã xử lý danh sách sinh viên",
  );
  const [remove, removing] = useApiAction(async (id: string) => {
    await coursesApi.removeStudent(courseId, id);
    return true;
  }, "Đã gỡ sinh viên");
  const searchStudents = (q: string) => {
    setSearchingStudents(true);
    return referenceApi
      .students({ q, page: 1, pageSize: 100 })
      .then((x) => setChoices(x.items))
      .catch(showError)
      .finally(() => setSearchingStudents(false));
  };
  const check = async (id: string) => {
    setChecking(true);
    try {
      setAnalysis(await roomsApi.composition(id));
    } catch (e) {
      if (e instanceof ApiError && e.status === 503) message.error("Dịch vụ ghép nhóm không phản hồi");
      else showError(e);
    } finally {
      setChecking(false);
    }
  };
  const type = types.find((t) => t.id === course?.groupTypeId);
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
      scroll={{ x: 480 }}
      size="small"
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
  if (headerLoading && !course) {
    return (
      <CourseDetailSkeleton canManage={hasRole("Admin", "HeadOfDepartment")} isAdmin={hasRole("Admin")} />
    );
  }
  if (!course) {
    return (
      <div className="workspace-page">
        <header className="workspace-heading">
          <div>
            <Link to="/staff/courses">← Quản lý Course</Link>
            <Typography.Title level={1}>Không tìm thấy Course</Typography.Title>
          </div>
        </header>
        <Empty description="Không tìm thấy Course" />
      </div>
    );
  }
  return (
    <div className="workspace-page">
      <header className="workspace-heading">
        <div>
          <Link to="/staff/courses">← Quản lý Course</Link>
          <Typography.Title level={1}>{course.code}</Typography.Title>
          <CourseStatusTag status={course.status} />
        </div>
        <CourseActions course={course} onChanged={refresh} allowDelete={false} />
      </header>
      <Descriptions
        bordered
        size="small"
        className="workspace-course-description"
        column={{ xs: 1, sm: 2, lg: 2, xl: 2, xxl: 2 }}
        items={[
          { key: "type", label: "Loại nhóm", children: course.groupTypeName },
          {
            key: "rule",
            label: "Quy định",
            children: type
              ? `${type.minMemberCount}–${type.maxMemberCount} thành viên, ít nhất ${type.minMajorCount} ngành; ${type.majors.map((m) => `${m.majorCode}: ${m.minQuantity}–${m.maxQuantity}`).join(", ")}`
              : "—",
          },
          { key: "start", label: "Bắt đầu", children: formatDateTime(course.startTime) },
          { key: "end", label: "Hạn", children: formatDateTime(course.deadline) },
        ]}
      />
      {stats ? (
        <Card title="Tiến độ ghép nhóm" className="workspace-section">
          <div className="workspace-metrics">
            <Statistic title="Tổng sinh viên" value={stats.totalStudents} />
            <Statistic title="Đã vào phòng" value={stats.studentsInRoom} />
            <Statistic title="Đã có nhóm" value={stats.studentsInGroup} />
            <Statistic title="Số nhóm" value={stats.groupCount} />
          </div>
          <div className="workspace-section">
            Tỉ lệ đã có nhóm{" "}
            <Progress
              percent={
                stats.totalStudents ? Math.round((stats.studentsInGroup / stats.totalStudents) * 100) : 0
              }
            />
          </div>
          <Space wrap>
            {Object.entries(roomStatusLabel).map(([k, v]) => (
              <Tag key={k} color={v.color}>
                {v.text}: {stats.roomsByStatus[k] ?? 0}
              </Tag>
            ))}
          </Space>
        </Card>
      ) : (
        headerLoading && <CourseStatsSkeleton />
      )}
      <Tabs
        className="workspace-section"
        activeKey={tab}
        onChange={setTab}
        items={[
          {
            key: "students",
            label: "Sinh viên",
            children: (
              <>
                <Space wrap className="workspace-toolbar">
                  <Input.Search
                    aria-label="Tìm sinh viên"
                    placeholder="Tìm sinh viên"
                    allowClear
                    onSearch={(q) => setSp((x) => ({ ...x, q, page: 1 }))}
                  />
                  <Select
                    aria-label="Lọc theo ngành"
                    placeholder="Ngành"
                    allowClear
                    loading={filtersLoading}
                    style={{ width: 150 }}
                    options={majors.map((m) => ({ value: m.id, label: m.code }))}
                    onChange={(majorId) => setSp((x) => ({ ...x, majorId, page: 1 }))}
                  />
                  <Select
                    aria-label="Lọc theo tình trạng vào phòng"
                    placeholder="Phòng"
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
                        void searchStudents("");
                      }}
                    >
                      Thêm sinh viên
                    </Button>
                  )}
                </Space>
                {loading ? (
                  <TableSkeleton
                    scrollX={840}
                    rows={5}
                    pagination={{
                      current: sp.page,
                      pageSize: sp.pageSize,
                      total: students?.totalItems,
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
                    scroll={{ x: 840 }}
                    rowKey="id"
                    dataSource={students?.items ?? []}
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
                <Space wrap className="workspace-toolbar">
                  <Input.Search
                    aria-label="Tìm mã phòng"
                    placeholder="Tìm mã phòng"
                    allowClear
                    onSearch={(q) => setRp((x) => ({ ...x, q, page: 1 }))}
                  />
                  <Select
                    aria-label="Lọc theo trạng thái phòng"
                    placeholder="Trạng thái"
                    allowClear
                    style={{ width: 170 }}
                    options={Object.entries(roomStatusLabel)
                      .filter(([value]) => value !== "Cancelled" || hasRole("Admin"))
                      .map(([value, v]) => ({ value, label: v.text }))}
                    onChange={(status) => setRp((x) => ({ ...x, status, page: 1 }))}
                  />
                </Space>
                {loading ? (
                  <TableSkeleton
                    scrollX={820}
                    rows={5}
                    showExpandColumn
                    pagination={{ current: rp.page, pageSize: rp.pageSize, total: rooms?.totalItems }}
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
                    scroll={{ x: 820 }}
                    rowKey="id"
                    dataSource={rooms?.items ?? []}
                    pagination={{
                      current: rp.page,
                      pageSize: rp.pageSize,
                      total: rooms?.totalItems,
                      showSizeChanger: true,
                      onChange: (page, pageSize) => setRp((x) => ({ ...x, page, pageSize })),
                    }}
                    expandable={{
                      onExpand: (expanded, r) => {
                        if (expanded && !details[r.id]) {
                          setLoadingDetails((x) => ({ ...x, [r.id]: true }));
                          roomsApi
                            .get(r.id)
                            .then((d) => setDetails((x) => ({ ...x, [r.id]: d })))
                            .catch(showError)
                            .finally(() => setLoadingDetails((x) => ({ ...x, [r.id]: false })));
                        }
                      },
                      expandedRowRender: (r) => (
                        <>
                          {details[r.id] ? (
                            memberList(details[r.id].members)
                          ) : loadingDetails[r.id] ? (
                            <TableSkeleton
                              scrollX={480}
                              size="small"
                              rows={3}
                              columns={[
                                { title: "Mã SV", kind: "code" },
                                { title: "Họ tên", kind: "text" },
                                { title: "Ngành", kind: "code" },
                                { title: "Vai trò", kind: "text" },
                              ]}
                            />
                          ) : (
                            <Empty description="Không tải được thành viên" />
                          )}
                          <Button loading={checking} onClick={() => check(r.id)}>
                            Kiểm tra cơ cấu
                          </Button>
                        </>
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
                  aria-label="Tìm mã nhóm"
                  placeholder="Tìm mã nhóm"
                  allowClear
                  style={{ maxWidth: 300, marginBottom: 16 }}
                  onSearch={(q) => setGp((x) => ({ ...x, q, page: 1 }))}
                />
                {loading ? (
                  <TableSkeleton
                    scrollX={580}
                    rows={5}
                    showExpandColumn
                    pagination={{ current: gp.page, pageSize: gp.pageSize, total: groups?.totalItems }}
                    columns={[
                      { title: "Mã", kind: "code" },
                      { title: "Số thành viên", kind: "number" },
                      { title: "Trưởng nhóm", kind: "text" },
                      { title: "Ngày thành lập", kind: "date" },
                    ]}
                  />
                ) : (
                  <Table
                    scroll={{ x: 580 }}
                    rowKey="id"
                    dataSource={groups?.items ?? []}
                    pagination={{
                      current: gp.page,
                      pageSize: gp.pageSize,
                      total: groups?.totalItems,
                      showSizeChanger: true,
                      onChange: (page, pageSize) => setGp((x) => ({ ...x, page, pageSize })),
                    }}
                    expandable={{ expandedRowRender: (g) => memberList(g.members) }}
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
          loading={searchingStudents}
          filterOption={false}
          style={{ width: "100%" }}
          aria-label="Tìm sinh viên"
          placeholder="Tìm sinh viên"
          value={selected}
          onChange={setSelected}
          onSearch={searchStudents}
          options={choices.map((s) => ({ value: s.id, label: `${s.studentCode} - ${s.fullName}` }))}
        />
      </Modal>
      <Modal
        title="Kiểm tra cơ cấu"
        open={!!analysis}
        onCancel={() => setAnalysis(undefined)}
        footer={<Button onClick={() => setAnalysis(undefined)}>Đóng</Button>}
      >
        <p>{analysis?.satisfied ? "Cơ cấu đạt yêu cầu" : "Cơ cấu chưa đạt yêu cầu"}</p>
        {analysis?.violations.map((v, i) => (
          <p key={i}>{v}</p>
        ))}
      </Modal>
    </div>
  );
}
