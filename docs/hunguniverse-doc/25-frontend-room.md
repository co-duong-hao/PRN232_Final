# Giao diện chi tiết phòng

Tài liệu tham chiếu cho PRN232 Final v0.4 tại commit 2e3789f.

[Mục lục bộ tài liệu](01-architecture.md)

## Cách hoạt động

Màn hình phòng hiển thị danh sách thành viên và cơ cấu. Trưởng phòng xem đơn chờ và có quyền thay đổi thông tin tuyển hoặc chuyển quyền.

Hoàn tất phòng phụ thuộc kết quả kiểm tra cơ cấu. Khi nút chưa sử dụng được, luồng API có thể được thử trong môi trường demo để minh họa mã BR16.

Giao diện dùng profile của sinh viên để đối chiếu `leaderId` và quyết định phần điều khiển nào hiển thị.

## Cách kiểm tra

1. Xem trạng thái cơ cấu trước và sau khi thêm ngành thứ ba.
2. Đăng nhập lại bằng trưởng phòng mới và kiểm tra các thao tác thay đổi quyền quản lý.

## Đối chiếu mã nguồn

Các trích đoạn dưới đây hỗ trợ tra cứu. Đường dẫn mở phần tương ứng trong repo.

### RoomDetailPage.tsx

Trạng thái, tải cơ cấu và điều kiện hiển thị hành động.

[frontend/src/pages/student/RoomDetailPage.tsx dòng 31–226](../../frontend/src/pages/student/RoomDetailPage.tsx#L31-L226)

~~~tsx
export function RoomDetailPage() {
  const { roomId = "" } = useParams();
  const navigate = useNavigate();
  const { student } = useAuth();
  const showError = useShowError();
  const [editOpen, setEditOpen] = useState(false);
  const [room, setRoom] = useState<Room>();
  const [composition, setComposition] = useState<CompositionAnalysis>();
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [compositionLoading, setCompositionLoading] = useState(false);
  const [group, setGroup] = useState<Group>();
  const [applies, setApplies] = useState<RoomApply[]>([]);
  const [status, setStatus] = useState<ApplyStatus | undefined>("Pending");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [appliesLoading, setAppliesLoading] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [leaderOpen, setLeaderOpen] = useState(false);
  const [leaderId, setLeaderId] = useState<string>();
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
            setApplyOpen(true);
          },
        });
        return undefined;
      }
      throw e;
    }
  });
  const [apply, applying] = useApiAction(roomsApi.apply, "Đã gửi đơn");
  const [leave, leaving] = useApiAction(async (id: string) => {
    await roomsApi.leave(id);
    return true;
  }, "Đã rời phòng");
  const [changeLeader, changing] = useApiAction(roomsApi.changeLeader, "Đã chuyển trưởng phòng");
  const [complete, completing] = useApiAction(roomsApi.complete, "Đã hoàn tất thành nhóm");
  const [approve, approving] = useApiAction(appliesApi.approve, "Đã chấp nhận đơn");
  const [reject, rejecting] = useApiAction(appliesApi.reject, "Đã từ chối đơn");
  const loadRoom = useCallback(async () => {
    try {
      const r = await roomsApi.get(roomId);
      setRoom(r);
      return r;
    } catch (e) {
      showError(e);
      return undefined;
    } finally {
      setLoading(false);
    }
  }, [roomId, showError]);
  const loadComposition = useCallback(async () => {
    setCompositionLoading(true);
    setComposition(undefined);
    try {
      setComposition(await roomsApi.composition(roomId));
      setUnavailable(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 503 && e.code === "MATCHING_UNAVAILABLE")
        setUnavailable(true);
      else showError(e);
    } finally {
      setCompositionLoading(false);
    }
  }, [roomId, showError]);
  const loadApplies = useCallback(async () => {
    setAppliesLoading(true);
    try {
      const data = await roomsApi.applies(roomId, { page, pageSize: size, status });
      setApplies(data.items);
      setTotal(data.totalItems);
    } catch (e) {
      showError(e);
    } finally {
      setAppliesLoading(false);
    }
  }, [roomId, page, size, status, showError]);
  const isMember = !!student && !!room?.members.some((m) => m.studentId === student.id);
  const isLeader = !!student && room?.leaderId === student.id;
  const active = room?.status === "Open" || room?.status === "Locked";
  useEffect(() => {
    void loadRoom();
    void loadComposition();
  }, [loadRoom, loadComposition]);
  useEffect(() => {
    if (isLeader) void loadApplies();
  }, [isLeader, loadApplies]);
  useEffect(() => {
    if (room?.status === "Completed")
      loadAllMyCourses()
        .then((courses) => setGroup(courses.find((c) => c.myGroup?.roomId === roomId)?.myGroup ?? undefined))
        .catch(showError);
  }, [room?.status, roomId, showError]);
  const refresh = async () => {
    const updated = await loadRoom();
    await loadComposition();
    if (updated?.leaderId === student?.id) await loadApplies();
  };
  return (
    <Spin spinning={loading}>
      {room ? (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <Typography.Title level={2}>{room.name || room.code}</Typography.Title>
            <Space wrap>
              {active && !isMember && room.status === "Open" && (
                <Button
                  loading={joining}
                  onClick={async () => {
                    if (await join(roomId)) await refresh();
                  }}
                >
                  Vào phòng
                </Button>
              )}
              {active && !isMember && room.status === "Locked" && (
                <Button
                  onClick={() => {
                    setMessage("");
                    setApplyOpen(true);
                  }}
                >
                  Gửi đơn
                </Button>
              )}
              {active && isMember && (
                <Popconfirm
                  title="Rời phòng này?"
                  okText="Rời phòng"
                  cancelText="Hủy"
                  onConfirm={async () => {
                    if (await leave(roomId)) navigate("/student/courses");
                  }}
                >
                  <Button danger loading={leaving} disabled={isLeader && room.members.length > 1}>
                    Rời phòng
                  </Button>
                </Popconfirm>
              )}
              {active && isLeader && room.members.length > 1 && (
                <Typography.Text type="secondary">Chuyển quyền trưởng phòng trước khi rời</Typography.Text>
              )}
              {active && isLeader && (
                <>
                  <Button onClick={() => setEditOpen(true)}>Sửa thông tin tuyển</Button>
                  <Button
                    disabled={room.members.length < 2}
                    onClick={() => {
                      setLeaderId(undefined);
                      setLeaderOpen(true);
                    }}
                  >
                    Chuyển trưởng phòng
                  </Button>
                  <Popconfirm
                    title="Hoàn tất phòng thành nhóm?"
                    okText="Hoàn tất"
                    cancelText="Hủy"
                    onConfirm={async () => {
                      const result = await complete(roomId);
                      if (result) navigate(`/student/groups/${result.id}`);
                    }}
                  >
                    <Button
                      type="primary"
                      disabled={!composition?.satisfied || compositionLoading}
                      loading={completing}
                    >
                      Hoàn tất thành nhóm
                    </Button>
                  </Popconfirm>
                </>
              )}
            </Space>
          </div>
          <CreateRoomModal
~~~

### RoomDetailPage.tsx

Thông tin tuyển, bảng thành viên, cơ cấu và đơn.

[frontend/src/pages/student/RoomDetailPage.tsx dòng 275–410](../../frontend/src/pages/student/RoomDetailPage.tsx#L275-L410)

~~~tsx
                {room.neededRoles.length
                  ? room.neededRoles.map((r) => <Tag key={r.id}>{r.name}</Tag>)
                  : "Chưa tuyển thêm"}
              </div>
            </div>
          </Card>
          <Typography.Title level={3}>Thành viên</Typography.Title>
          <Table
            rowKey="studentId"
            pagination={false}
            dataSource={room.members}
            columns={[
              { title: "Mã SV", dataIndex: "studentCode" },
              {
                title: "Họ tên",
                render: (_, m) => (
                  <>
                    {m.fullName} {m.isLeader && <StarFilled title="Trưởng phòng" />}
                  </>
                ),
              },
              { title: "Ngành", dataIndex: "majorCode" },
              { title: "GPA", render: (_, m) => m.gpa ?? "—" },
              { title: "Vai trò", render: (_, m) => m.roles.map((r) => <Tag key={r.id}>{r.name}</Tag>) },
              { title: "Ngày vào", render: (_, m) => formatDateTime(m.joinedAt) },
            ]}
          />
          <Card
            title="Cơ cấu nhóm"
            extra={
              <Button loading={compositionLoading} onClick={() => void loadComposition()}>
                Làm mới
              </Button>
            }
            style={{ marginTop: 16 }}
          >
            {unavailable ? (
              <Alert type="warning" message="Dịch vụ gợi ý tạm thời không phản hồi" />
            ) : composition ? (
              <>
                <Alert
                  type={composition.satisfied ? "success" : "warning"}
                  message={composition.satisfied ? "Đạt cơ cấu nhóm" : "Chưa đạt cơ cấu nhóm"}
                />
                {composition.violations.map((v, i) => (
                  <p key={i}>{v}</p>
                ))}
                <p>
                  Ngành còn thiếu:{" "}
                  {composition.missingMajors.length
                    ? composition.missingMajors.map((m) => (
                        <Tag key={m.majorCode} color="orange">
                          {m.majorCode}: {m.current}/{m.required}
                        </Tag>
                      ))
                    : "Không có"}
                </p>
                <p>
                  Ngành vượt:{" "}
                  {composition.exceedingMajors.length
                    ? composition.exceedingMajors.map((m) => (
                        <Tag key={m.majorCode} color="red">
                          {m.majorCode}: {m.current}/{m.required}
                        </Tag>
                      ))
                    : "Không có"}
                </p>
              </>
            ) : (
              !compositionLoading && <Empty description="Chưa có dữ liệu cơ cấu" />
            )}
          </Card>
          {isLeader && (
            <>
              <Typography.Title level={3}>Đơn xin vào phòng</Typography.Title>
              <Select
                allowClear
                placeholder="Tất cả trạng thái"
                style={{ width: 200 }}
                value={status}
                onChange={(v) => {
                  setStatus(v);
                  setPage(1);
                }}
                options={Object.entries(applyStatusLabel).map(([value, label]) => ({
                  value,
                  label: label.text,
                }))}
              />
              <Table
                rowKey="id"
                loading={appliesLoading}
                dataSource={applies}
                pagination={{
                  current: page,
                  pageSize: size,
                  total,
                  showSizeChanger: true,
                  onChange: (p, s) => {
                    setPage(p);
                    setSize(s);
                  },
                }}
                columns={[
                  { title: "Người xin", dataIndex: "fullName" },
                  { title: "Mã SV", dataIndex: "studentCode" },
                  { title: "Ngành", dataIndex: "majorCode" },
                  { title: "GPA", render: (_, a) => a.gpa ?? "—" },
                  { title: "Vai trò", render: (_, a) => a.roles.map((r) => <Tag key={r.id}>{r.name}</Tag>) },
                  { title: "Lời nhắn", dataIndex: "message" },
                  { title: "Ngày gửi", render: (_, a) => formatDateTime(a.createdAt) },
                  { title: "Trạng thái", render: (_, a) => <ApplyStatusTag status={a.status} /> },
                  {
                    title: "Thao tác",
                    render: (_, a) =>
                      active &&
                      a.status === "Pending" && (
                        <Space>
                          <Button
                            loading={approving}
                            onClick={async () => {
                              if (await approve(a.id)) await refresh();
                            }}
                          >
                            Chấp nhận
                          </Button>
                          <Button
                            loading={rejecting}
                            onClick={async () => {
                              if (await reject(a.id)) await refresh();
                            }}
                          >
                            Từ chối
                          </Button>
                        </Space>
                      ),
~~~
