# Bảng quản lý staff và admin

Tài liệu tham chiếu cho PRN232 Final v0.4 tại commit 2e3789f.

[Mục lục bộ tài liệu](01-architecture.md)

## Cách hoạt động

Staff dùng chi tiết Course để kiểm tra danh sách ghi danh, GPA, vai trò mong muốn, phòng và nhóm chính thức.

Admin có màn hình quản lý tài khoản riêng. Các hành động quản trị ở frontend gọi AuthService thông qua Gateway.

Các bộ lọc phân trang UI nối với tham số API. Quyền của tài khoản xem danh sách tách khỏi quyền cập nhật.

## Cách kiểm tra

1. Dùng giảng viên kiểm tra tab Sinh viên và nhóm đã thành lập.
2. Dùng admin tìm tài khoản theo email rồi đối chiếu vai trò hệ thống và trạng thái.

## Đối chiếu mã nguồn

Các trích đoạn dưới đây hỗ trợ tra cứu. Đường dẫn mở phần tương ứng trong repo.

### CourseDetailPage.tsx

Tải dữ liệu Course, tab và xử lý ghi danh.

[frontend/src/pages/staff/CourseDetailPage.tsx dòng 47–126](../../frontend/src/pages/staff/CourseDetailPage.tsx#L47-L126)

~~~tsx
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
  const [loading, setLoading] = useState(false);
  const [sp, setSp] = useState<CourseStudentParams>({ page: 1, pageSize: 20 });
  const [rp, setRp] = useState<RoomListParams>({ page: 1, pageSize: 20 });
  const [gp, setGp] = useState<PageParams>({ page: 1, pageSize: 20 });
  const [students, setStudents] = useState<Paged<CourseStudent>>();
  const [rooms, setRooms] = useState<Paged<RoomSummary>>();
  const [groups, setGroups] = useState<Paged<Group>>();
  const [details, setDetails] = useState<Record<string, Room>>({});
  const [analysis, setAnalysis] = useState<CompositionAnalysis>();
  const [checking, setChecking] = useState(false);
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
  const searchStudents = (q: string) =>
    referenceApi
      .students({ q, page: 1, pageSize: 100 })
      .then((x) => setChoices(x.items))
      .catch(showError);
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
~~~

### CourseDetailPage.tsx

Nội dung các tab sinh viên, phòng và nhóm.

[frontend/src/pages/staff/CourseDetailPage.tsx dòng 202–415](../../frontend/src/pages/staff/CourseDetailPage.tsx#L202-L415)

~~~tsx
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          {
            key: "students",
            label: "Sinh viên",
            children: (
              <>
                <Space wrap style={{ marginBottom: 16 }}>
                  <Input.Search
                    placeholder="Tìm sinh viên"
                    allowClear
                    onSearch={(q) => setSp((x) => ({ ...x, q, page: 1 }))}
                  />
                  <Select
                    placeholder="Ngành"
                    allowClear
                    style={{ width: 150 }}
                    options={majors.map((m) => ({ value: m.id, label: m.code }))}
                    onChange={(majorId) => setSp((x) => ({ ...x, majorId, page: 1 }))}
                  />
                  <Select
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
                        searchStudents("");
                      }}
                    >
                      Thêm sinh viên
                    </Button>
                  )}
                </Space>
                <Table
                  rowKey="id"
                  loading={loading}
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
              </>
            ),
          },
          {
            key: "rooms",
            label: "Phòng",
            children: (
              <>
                <Space wrap style={{ marginBottom: 16 }}>
                  <Input.Search
                    placeholder="Tìm mã phòng"
                    allowClear
                    onSearch={(q) => setRp((x) => ({ ...x, q, page: 1 }))}
                  />
                  <Select
                    placeholder="Trạng thái"
                    allowClear
                    style={{ width: 170 }}
                    options={Object.entries(roomStatusLabel)
                      .filter(([value]) => value !== "Cancelled" || hasRole("Admin"))
                      .map(([value, v]) => ({ value, label: v.text }))}
                    onChange={(status) => setRp((x) => ({ ...x, status, page: 1 }))}
                  />
                </Space>
                <Table
                  rowKey="id"
                  loading={loading}
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
                      if (expanded)
                        roomsApi
                          .get(r.id)
                          .then((d) => setDetails((x) => ({ ...x, [r.id]: d })))
                          .catch(showError);
                    },
                    expandedRowRender: (r) => (
                      <>
                        {details[r.id] ? memberList(details[r.id].members) : <Spin />}
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
                  allowClear
                  style={{ maxWidth: 300, marginBottom: 16 }}
                  onSearch={(q) => setGp((x) => ({ ...x, q, page: 1 }))}
                />
                <Table
                  rowKey="id"
                  loading={loading}
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
              </>
            ),
          },
        ]}
      />
~~~

### UsersPage.tsx

Trang quản trị người dùng.

[frontend/src/pages/admin/UsersPage.tsx dòng 16–122](../../frontend/src/pages/admin/UsersPage.tsx#L16-L122)

~~~tsx
export function UsersPage() {
  const [params, setParams] = useState<UserListParams>({ page: 1, pageSize: 20 });
  const [data, setData] = useState<Paged<User>>();
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [edit, setEdit] = useState<User | null>(null);
  const [mode, setMode] = useState<"create" | "edit" | "password" | null>(null);
  const [form] = Form.useForm<Values>();
  const showError = useShowError();
  const load = useCallback(() => {
    setLoading(true);
    usersApi
      .list(params)
      .then(setData)
      .catch(showError)
      .finally(() => setLoading(false));
  }, [params, showError]);
  useEffect(load, [load]);
  useEffect(() => {
    usersApi.roles().then(setRoles).catch(showError);
  }, [showError]);
  const [save, saving] = useApiAction(async (v: Values) => {
    if (mode === "create")
      return usersApi.create({ email: v.email, fullName: v.fullName, password: v.password, roles: v.roles });
    if (mode === "edit")
      return usersApi.update(edit!.id, { fullName: v.fullName, status: v.status, roles: v.roles });
    await usersApi.resetPassword(edit!.id, v.password);
    return true;
  }, "Đã lưu tài khoản");
  const [deactivate, busy] = useApiAction(async (id: string) => {
    await usersApi.deactivate(id);
    return true;
  }, "Đã vô hiệu hóa tài khoản");
  const show = (m: "create" | "edit" | "password", u?: User) => {
    setEdit(u ?? null);
    setMode(m);
    form.resetFields();
    if (u && m === "edit") form.setFieldsValue({ fullName: u.fullName, status: u.status, roles: u.roles });
  };
  const filter = (p: Partial<UserListParams>) => setParams((x) => ({ ...x, ...p, page: 1 }));
  return (
    <>
      <Typography.Title level={2}>Tài khoản</Typography.Title>
      <Space wrap style={{ marginBottom: 16 }}>
        <Input.Search placeholder="Tìm email hoặc họ tên" allowClear onSearch={(q) => filter({ q })} />
        <Select
          placeholder="Vai trò"
          allowClear
          style={{ width: 170 }}
          options={roles.map((r) => ({ value: r.code, label: roleLabel[r.code] }))}
          onChange={(role) => filter({ role })}
        />
        <Select
          placeholder="Trạng thái"
          allowClear
          style={{ width: 150 }}
          options={[
            { value: "Active", label: "Hoạt động" },
            { value: "Inactive", label: "Vô hiệu hóa" },
          ]}
          onChange={(status) => filter({ status })}
        />
        <Button type="primary" onClick={() => show("create")}>
          Tạo tài khoản
        </Button>
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
          { title: "Email", dataIndex: "email", sorter: true },
          { title: "Họ tên", dataIndex: "fullName", sorter: true },
          {
            title: "Vai trò",
            dataIndex: "roles",
            render: (rs: Role[]) => rs.map((r) => <Tag key={r}>{roleLabel[r]}</Tag>),
          },
          {
            title: "Trạng thái",
            dataIndex: "status",
            render: (s: UserStatus) => (s === "Active" ? "Hoạt động" : "Vô hiệu hóa"),
          },
          { title: "Ngày tạo", dataIndex: "createdAt", sorter: true, render: formatDateTime },
          {
            title: "Thao tác",
            render: (_: unknown, u: User) => (
              <Space wrap>
                <Button onClick={() => show("edit", u)}>Sửa</Button>
                <Button onClick={() => show("password", u)}>Đặt lại mật khẩu</Button>
                {u.status === "Active" && (
~~~
