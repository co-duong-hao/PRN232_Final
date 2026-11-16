# Giao diện tìm nhóm

Tài liệu tham chiếu cho PRN232 Final v0.4 tại commit 2e3789f.

[Mục lục bộ tài liệu](01-architecture.md)

## Cách hoạt động

Trang Course Rooms hiển thị phòng và thông tin tuyển thành viên. Sinh viên có thể tìm theo tên, vai trò và GPA.

Giao diện xác định hành động dựa trên Course đang ghép nhóm và phòng hiện tại của sinh viên. API vẫn kiểm tra điều kiện thật khi gọi vào hoặc gửi đơn.

Ca BR19 có luồng giao diện mở hộp thoại gửi đơn. Khi phòng đang `Open`, backend hiện trả `ROOM_NOT_LOCKED` cho lời mời gửi đơn đó.

## Cách kiểm tra

1. Đổi GPA lọc và vai trò rồi kiểm tra truy vấn trong Network của trình duyệt.
2. So sánh hành động của cùng sinh viên khi phòng `Open`, `Locked` và `Completed`.

## Đối chiếu mã nguồn

Các trích đoạn dưới đây hỗ trợ tra cứu. Đường dẫn mở phần tương ứng trong repo.

### CourseRoomsPage.tsx

Đọc dữ liệu, luồng BR19 và bộ lọc theo trạng thái.

[frontend/src/pages/student/CourseRoomsPage.tsx dòng 41–178](../../frontend/src/pages/student/CourseRoomsPage.tsx#L41-L178)

~~~tsx
export function CourseRoomsPage() {
  const { courseId = "" } = useParams();
  const navigate = useNavigate();
  const { student } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [gpa, setGpa] = useState<number | null>(student?.gpa ?? null);
  const [eligibleOnly, setEligibleOnly] = useState(false);
  const [roles, setRoles] = useState<TeamRole[]>([]);
  const [roleIds, setRoleIds] = useState<string[]>([]);
  useEffect(() => {
    setGpa(student?.gpa ?? null);
  }, [student?.gpa]);
  const showError = useShowError();
  const [course, setCourse] = useState<Course>();
  const [type, setType] = useState<GroupType>();
  const [mine, setMine] = useState<MyCourse>();
  const [ready, setReady] = useState(false);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [recommendations, setRecommendations] = useState<RoomRecommendation[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const [recommendedRooms, setRecommendedRooms] = useState<Record<string, RoomStatus>>({});
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<RoomStatus>();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Room>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [applyRoom, setApplyRoom] = useState<string>();
  const [message, setMessage] = useState("");
  const [join, joining] = useApiAction(async (id: string) => {
    try {
      return await roomsApi.join(id);
    } catch (e) {
      if (e instanceof ApiError && e.code === "BR19") {
        Modal.confirm({
          title: "Không thể vào phòng trực tiếp",
          content: "GPA của bạn thấp hơn yêu cầu của phòng. Hãy gửi đơn để trưởng phòng xét.",
          okText: "Gửi đơn",
          cancelText: "Đóng",
          onOk: () => {
            setMessage("");
            setApplyRoom(id);
          },
        });
        return undefined;
      }
      throw e;
    }
  });
  const [apply, applying] = useApiAction(roomsApi.apply, "Đã gửi đơn");
  const loadBase = useCallback(async () => {
    try {
      const [c, types, myCourses] = await Promise.all([
        coursesApi.get(courseId),
        referenceApi.groupTypes(),
        loadAllMyCourses(),
      ]);
      setCourse(c);
      setType(types.items.find((t) => t.id === c.groupTypeId));
      setMine(myCourses.find((x) => x.id === courseId));
      setReady(true);
    } catch (e) {
      showError(e);
      setReady(true);
    }
  }, [courseId, showError]);
  const loadRooms = useCallback(async () => {
    setLoading(true);
    try {
      const data = await coursesApi.rooms(courseId, {
        page,
        pageSize: size,
        status,
        q,
        gpa: eligibleOnly ? (gpa ?? undefined) : undefined,
        roleIds,
      });
      setRooms(data.items);
      setTotal(data.totalItems);
    } catch (e) {
      showError(e);
    } finally {
      setLoading(false);
    }
  }, [courseId, page, size, status, q, gpa, eligibleOnly, roleIds, showError]);
  const loadRecommendations = useCallback(async () => {
    try {
      const results = await coursesApi.recommendations(courseId, 3);
      const details = await Promise.all(results.map((r) => roomsApi.get(r.roomId)));
      setRecommendedRooms(Object.fromEntries(details.map((r) => [r.id, r.status])));
      setRecommendations(results);
      setUnavailable(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 503 && e.code === "MATCHING_UNAVAILABLE")
        setUnavailable(true);
      else showError(e);
    }
  }, [courseId, showError]);
  useEffect(() => {
    referenceApi
      .teamRoles()
      .then((r) => setRoles(r.items))
      .catch(showError);
    void loadBase();
    void loadRecommendations();
  }, [loadBase, loadRecommendations, showError]);
  useEffect(() => {
    void loadRooms();
  }, [loadRooms]);
  const canAct = ready && !!mine && !mine.myRoom && !mine.myGroup && course?.status === "Forming";
  const actions = (id: string, state: RoomStatus) => (
    <Space>
      <Link to={`/student/rooms/${id}`}>Xem trang phòng</Link>
      {canAct && state === "Open" && (
        <Button
          loading={joining}
          onClick={async () => {
            const result = await join(id);
            if (result) navigate(`/student/rooms/${result.id}`);
          }}
        >
          Vào phòng
        </Button>
      )}
      {canAct && state === "Locked" && (
        <Button
          onClick={() => {
            setMessage("");
            setApplyRoom(id);
          }}
        >
          Gửi đơn
        </Button>
      )}
    </Space>
  );
~~~

### CourseRoomsPage.tsx

Giao diện tìm kiếm và hồ sơ tuyển của từng phòng.

[frontend/src/pages/student/CourseRoomsPage.tsx dòng 239–385](../../frontend/src/pages/student/CourseRoomsPage.tsx#L239-L385)

~~~tsx
      <CreateRoomModal open={createOpen} course={mine} onClose={() => setCreateOpen(false)} />
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={10}>
          <Card title="Bộ lọc">
            <Space direction="vertical" style={{ width: "100%" }}>
              <span>Tên nhóm</span>
              <Input.Search
                placeholder="Tìm tên nhóm, dự án, mã phòng"
                allowClear
                onSearch={(v) => {
                  setQ(v);
                  setPage(1);
                }}
              />
              <span>GPA của bạn — Tối đa 4</span>
              <InputNumber
                min={0}
                max={4}
                step={0.01}
                precision={2}
                value={gpa}
                onChange={(v) => {
                  setGpa(v);
                  setPage(1);
                }}
                style={{ width: "100%" }}
              />
              <span>
                Chỉ phòng tôi vào được{" "}
                <Switch
                  checked={eligibleOnly}
                  disabled={gpa == null}
                  onChange={(v) => {
                    setEligibleOnly(v);
                    setPage(1);
                  }}
                />
              </span>
              <span>Vai trò cần tuyển</span>
              <Select
                mode="multiple"
                placeholder="Tất cả vai trò"
                style={{ width: "100%" }}
                value={roleIds}
                options={roles.map((r) => ({ value: r.id, label: r.name }))}
                onChange={(v) => {
                  setRoleIds(v);
                  setPage(1);
                }}
              />
              <span>Trạng thái</span>
              <Select
                allowClear
                placeholder="Tất cả trạng thái"
                style={{ width: "100%" }}
                value={status}
                onChange={(v) => {
                  setStatus(v);
                  setPage(1);
                }}
                options={Object.entries(roomStatusLabel)
                  .filter(([value]) => value !== "Cancelled")
                  .map(([value, label]) => ({ value, label: label.text }))}
              />
            </Space>
          </Card>
          {unavailable && <Alert type="warning" message="Dịch vụ gợi ý tạm thời không phản hồi" />}
          {recommendations.length > 0 && (
            <Card title="Gợi ý cho bạn" style={{ marginTop: 16 }}>
              <Space direction="vertical">
                {recommendations.map((r) => (
                  <div key={r.roomId}>
                    <strong>{r.roomCode}</strong> · Điểm: {r.score} · {r.reasons.join(", ")}{" "}
                    {actions(r.roomId, recommendedRooms[r.roomId])}
                  </div>
                ))}
              </Space>
            </Card>
          )}
          <Typography.Title level={3}>Danh sách phòng</Typography.Title>
          <Spin spinning={loading}>
            <div style={{ maxHeight: 650, overflowY: "auto", padding: "8px 4px" }}>
              {!loading && rooms.length === 0 && <Empty description="Không có phòng" />}
              <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                {rooms.map((r) => {
                  const card = (
                    <Card
                      hoverable
                      style={{ borderColor: selected?.id === r.id ? "#fa8c16" : undefined }}
                      onClick={async () => {
                        setDetailLoading(true);
                        setSelected(undefined);
                        try {
                          setSelected(await roomsApi.get(r.id));
                        } catch (e) {
                          showError(e);
                        } finally {
                          setDetailLoading(false);
                        }
                      }}
                    >
                      <Typography.Title level={4}>{r.name || r.code}</Typography.Title>
                      <Typography.Text type="secondary">
                        {course?.code} · {r.code}
                      </Typography.Text>
                      <p>
                        Trưởng phòng: {r.leaderName} · {r.memberCount}/{type?.maxMemberCount ?? "—"}
                      </p>
                      <p>
                        {r.neededRoles.length
                          ? r.neededRoles.map((role) => <Tag key={role.id}>{role.name}</Tag>)
                          : "Chưa tuyển thêm"}
                      </p>
                      <span>GPA yêu cầu: {r.requiredGpa ?? "Không yêu cầu"}</span>
                    </Card>
                  );
                  return (
                    <div key={r.id}>
                      {(r.status === "Open" || r.status === "Locked") && r.neededRoles.length > 0 ? (
                        <Badge.Ribbon text="Đang tuyển" color="orange">
                          {card}
                        </Badge.Ribbon>
                      ) : (
                        card
                      )}
                    </div>
                  );
                })}
              </Space>
            </div>
            <Pagination
              style={{ marginTop: 16 }}
              current={page}
              pageSize={size}
              total={total}
              showSizeChanger
              onChange={(p, s) => {
                setPage(p);
                setSize(s);
              }}
            />
          </Spin>
        </Col>
        <Col xs={24} lg={14}>
          <Card>
            <Spin spinning={detailLoading}>
              {selected ? (
~~~
