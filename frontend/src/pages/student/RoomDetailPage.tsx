import "@/features/workspace.css";
import { ArrowLeftOutlined, ReloadOutlined } from "@ant-design/icons";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, appliesApi, coursesApi, referenceApi, roomsApi } from "@/api";
import type { ApplyStatus, CompositionAnalysis, Group, GroupType, Room, RoomApply } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import { EmptyState } from "@/components/EmptyState";
import { formatDateTime, formatDecimal } from "@/components/format";
import { applyStatusLabel } from "@/components/labels";
import { ApplyStatusTag, RoomStatusTag } from "@/components/StatusTag";
import { useApiAction, useShowError } from "@/components/useApiAction";
import { CreateRoomModal } from "@/features/student/CreateRoomModal";
import { loadAllMyCourses } from "@/features/student/loadMyCourses";
import { RoomCompositionSummary } from "@/features/student/RoomCompositionSummary";
import { RoomCompositionSkeleton, RoomDetailSkeleton, TableSkeleton } from "@/features/WorkspaceSkeletons";

export function RoomDetailPage() {
  const { roomId = "" } = useParams();
  const navigate = useNavigate();
  const { student } = useAuth();
  const showError = useShowError();
  const appliesSectionRef = useRef<HTMLDivElement>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [room, setRoom] = useState<Room>();
  const [composition, setComposition] = useState<CompositionAnalysis>();
  const [compositionRules, setCompositionRules] = useState<{ courseId: string; groupType: GroupType }>();
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [compositionLoading, setCompositionLoading] = useState(false);
  const [group, setGroup] = useState<Group>();

  const [applies, setApplies] = useState<RoomApply[]>([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [status, setStatus] = useState<ApplyStatus | undefined>("Pending");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [appliesLoading, setAppliesLoading] = useState(false);
  const [busyApplyId, setBusyApplyId] = useState<string>();

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
          title: "Chưa đủ GPA để vào trực tiếp",
          content:
            "GPA hiện tại của bạn thấp hơn yêu cầu của phòng (hoặc chưa khai báo trong hồ sơ). Hãy cập nhật hồ sơ hoặc gửi đơn khi phòng chuyển sang trạng thái Đã khóa.",
          okText: "Cập nhật hồ sơ",
          cancelText: "Đóng",
          onOk: () => navigate("/student/profile"),
        });
        return undefined;
      }
      throw e;
    }
  }, "Đã tham gia phòng");
  const [apply, applying] = useApiAction(roomsApi.apply, "Đã gửi đơn xin vào phòng");
  const [leave, leaving] = useApiAction(async (id: string) => {
    await roomsApi.leave(id);
    return true;
  }, "Đã rời phòng");
  const [changeLeader, changing] = useApiAction(roomsApi.changeLeader, "Đã chuyển quyền trưởng phòng");
  const [complete, completing] = useApiAction(roomsApi.complete, "Đã hoàn tất thành nhóm chính thức");
  const [approve] = useApiAction(appliesApi.approve, "Đã chấp nhận đơn");
  const [reject] = useApiAction(appliesApi.reject, "Đã từ chối đơn");

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

  const loadComposition = useCallback(
    async (refreshRoom = false) => {
      setCompositionLoading(true);
      setComposition(undefined);
      setUnavailable(false);
      try {
        const [analysis] = await Promise.all([
          roomsApi.composition(roomId),
          refreshRoom ? loadRoom() : undefined,
        ]);
        setComposition(analysis);
      } catch (e) {
        if (e instanceof ApiError && e.status === 503 && e.code === "MATCHING_UNAVAILABLE") {
          setUnavailable(true);
        } else {
          showError(e);
        }
      } finally {
        setCompositionLoading(false);
      }
    },
    [roomId, loadRoom, showError],
  );

  const loadApplies = useCallback(async () => {
    setAppliesLoading(true);
    try {
      const [data, pendingCountData] = await Promise.all([
        roomsApi.applies(roomId, { page, pageSize: size, status }),
        status === "Pending"
          ? Promise.resolve(undefined)
          : roomsApi.applies(roomId, { status: "Pending", pageSize: 1 }),
      ]);
      setApplies(data.items);
      setTotal(data.totalItems);
      setPendingTotal(pendingCountData ? pendingCountData.totalItems : data.totalItems);
    } catch (e) {
      showError(e);
    } finally {
      setAppliesLoading(false);
    }
  }, [roomId, page, size, status, showError]);

  const isMember = !!student && !!room?.members.some((m) => m.studentId === student.id);
  const isLeader = !!student && room?.leaderId === student.id;
  const active = room?.status === "Open" || room?.status === "Locked";
  const courseId = room?.courseId;

  useEffect(() => {
    setRoom(undefined);
    setLoading(true);
    void loadRoom();
    void loadComposition();
  }, [loadRoom, loadComposition]);

  useEffect(() => {
    if (!courseId) return;
    let current = true;
    async function loadRules(id: string) {
      try {
        const course = await coursesApi.get(id);
        if (!current) return;
        let p = 1;
        while (current) {
          const types = await referenceApi.groupTypes({ q: course.groupTypeName, page: p });
          if (!current) return;
          const groupType = types.items.find((type) => type.id === course.groupTypeId);
          if (groupType) {
            setCompositionRules({ courseId: id, groupType });
            return;
          }
          if (p >= types.totalPages) return;
          p++;
        }
      } catch (e) {
        if (current) showError(e);
      }
    }
    void loadRules(courseId);
    return () => {
      current = false;
    };
  }, [courseId, showError]);

  useEffect(() => {
    if (isLeader) void loadApplies();
  }, [isLeader, loadApplies]);

  useEffect(() => {
    if (room?.status === "Completed") {
      loadAllMyCourses()
        .then((courses) => setGroup(courses.find((c) => c.myGroup?.roomId === roomId)?.myGroup ?? undefined))
        .catch(showError);
    }
  }, [room?.status, roomId, showError]);

  const refresh = async () => {
    const updated = await loadRoom();
    await loadComposition();
    if (updated?.leaderId === student?.id) await loadApplies();
  };

  const maxMembers =
    compositionRules?.courseId === room?.courseId ? compositionRules?.groupType.maxMemberCount : undefined;
  const completeDisabled = !composition?.satisfied || compositionLoading;
  const leaveBlocked = isLeader && (room?.members.length ?? 0) > 1;
  const gpaTooLowForJoin = !!room?.requiredGpa && (student?.gpa == null || student.gpa < room.requiredGpa);

  return (
    <div className="workspace-page">
      {loading && !room ? (
        <RoomDetailSkeleton />
      ) : room ? (
        <>
          <header className="workspace-heading">
            <div>
              <Link className="workspace-heading__back" to={`/student/courses/${room.courseId}`}>
                <ArrowLeftOutlined aria-hidden="true" />
                Quay lại Tìm nhóm
              </Link>
              <div className="workspace-heading__title-row">
                <Typography.Title level={1}>{room.name || room.code}</Typography.Title>
                <RoomStatusTag status={room.status} />
              </div>
              <p>
                {room.code} · {room.courseCode} · {room.memberCount}
                {maxMembers ? `/${maxMembers}` : ""} thành viên
              </p>
            </div>

            <Space wrap>
              {active && !isMember && room.status === "Open" && (
                <Button
                  type="primary"
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
                  type="primary"
                  onClick={() => {
                    setMessage("");
                    setApplyOpen(true);
                  }}
                >
                  Gửi đơn xin vào
                </Button>
              )}

              {active && isLeader && (
                <>
                  <Button onClick={() => setEditOpen(true)}>Sửa thông tin tuyển</Button>
                  <Tooltip title={room.members.length < 2 ? "Cần ít nhất 2 thành viên để chuyển quyền" : ""}>
                    <Button
                      disabled={room.members.length < 2}
                      onClick={() => {
                        setLeaderId(undefined);
                        setLeaderOpen(true);
                      }}
                    >
                      Chuyển trưởng phòng
                    </Button>
                  </Tooltip>
                  <Tooltip
                    title={
                      completeDisabled
                        ? "Cần đạt đủ tất cả tiêu chí ở mục Cơ cấu nhóm trước khi hoàn tất."
                        : ""
                    }
                  >
                    <span>
                      <Popconfirm
                        title="Hoàn tất phòng thành nhóm chính thức?"
                        description="Sau khi hoàn tất, thành viên không thể rời phòng và các đơn chờ duyệt sẽ tự hủy."
                        okText="Hoàn tất"
                        cancelText="Hủy"
                        disabled={completeDisabled}
                        onConfirm={async () => {
                          const result = await complete(roomId);
                          if (result) navigate(`/student/groups/${result.id}`);
                        }}
                      >
                        <Button type="primary" disabled={completeDisabled} loading={completing}>
                          Hoàn tất thành nhóm
                        </Button>
                      </Popconfirm>
                    </span>
                  </Tooltip>
                </>
              )}

              {active && isMember && (
                <Tooltip
                  title={
                    leaveBlocked ? "Bạn cần chuyển quyền trưởng phòng cho thành viên khác trước khi rời." : ""
                  }
                >
                  <span>
                    <Popconfirm
                      title="Rời phòng này?"
                      description="Bạn có thể tham gia phòng khác trong học phần sau khi rời."
                      okText="Rời phòng"
                      cancelText="Hủy"
                      disabled={leaveBlocked}
                      onConfirm={async () => {
                        if (await leave(roomId)) navigate("/student/courses");
                      }}
                    >
                      <Button danger loading={leaving} disabled={leaveBlocked}>
                        Rời phòng
                      </Button>
                    </Popconfirm>
                  </span>
                </Tooltip>
              )}
            </Space>
          </header>

          <CreateRoomModal
            open={editOpen}
            room={room}
            onClose={() => setEditOpen(false)}
            onSaved={() => void refresh()}
          />

          {room.status === "Completed" && (
            <Alert
              type="success"
              message={
                <Space wrap>
                  <span>Phòng đã hoàn tất và chuyển thành nhóm chính thức.</span>
                  {group && (
                    <Button
                      type="primary"
                      size="small"
                      onClick={() => navigate(`/student/groups/${group.id}`)}
                    >
                      Xem nhóm {group.code}
                    </Button>
                  )}
                </Space>
              }
            />
          )}

          {active && !isMember && room.status === "Open" && gpaTooLowForJoin && (
            <Alert
              type="warning"
              message={`Phòng yêu cầu GPA tối thiểu ${formatDecimal(room.requiredGpa)}`}
              description={
                student?.gpa == null
                  ? "Bạn chưa khai báo GPA trong hồ sơ nên chưa thể vào trực tiếp phòng này."
                  : `GPA hiện tại của bạn (${formatDecimal(student.gpa)}) thấp hơn yêu cầu nên không thể vào trực tiếp.`
              }
              action={
                <Button size="small" onClick={() => navigate("/student/profile")}>
                  Cập nhật hồ sơ
                </Button>
              }
            />
          )}

          {active && isLeader && pendingTotal > 0 && (
            <Alert
              type="info"
              message={`Bạn có ${pendingTotal} đơn xin vào phòng đang chờ duyệt`}
              description="Xem hồ sơ GPA, ngành và vai trò của ứng viên để quyết định chấp nhận hoặc từ chối."
              action={
                <Button
                  type="primary"
                  size="small"
                  onClick={() => appliesSectionRef.current?.scrollIntoView({ behavior: "smooth" })}
                >
                  Xem đơn chờ duyệt
                </Button>
              }
            />
          )}

          <Row gutter={[16, 16]}>
            <Col xs={24} xl={15}>
              <Card title="Thông tin tuyển và dự án" extra={<RoomStatusTag status={room.status} />}>
                <dl className="workspace-facts">
                  {[
                    ["Dự án", room.projectName || "Chưa có"],
                    [
                      "GPA yêu cầu",
                      room.requiredGpa != null ? formatDecimal(room.requiredGpa) : "Không yêu cầu",
                    ],
                    [
                      "Điểm mục tiêu",
                      room.targetGrade != null ? formatDecimal(room.targetGrade) : "Chưa đặt",
                    ],
                    ["Trưởng phòng", room.leaderName],
                    ["Học phần", room.courseCode],
                    ["Số thành viên", maxMembers ? `${room.memberCount}/${maxMembers}` : room.memberCount],
                  ].map(([label, value]) => (
                    <div className="workspace-fact" key={String(label)}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>

                <div className="workspace-section">
                  <strong>Mô tả ý tưởng</strong>
                  <div className="workspace-room-description">
                    {room.ideaDescription || "Chưa có mô tả ý tưởng."}
                  </div>
                </div>

                <div className="workspace-section">
                  <strong>Vai trò cần tuyển: </strong>
                  {room.neededRoles.length
                    ? room.neededRoles.map((r) => <Tag key={r.id}>{r.name}</Tag>)
                    : "Chưa tuyển thêm"}
                </div>
              </Card>

              <Card title={`Thành viên hiện tại (${room.members.length})`} className="workspace-section">
                <Table
                  scroll={{ x: 640 }}
                  rowKey="studentId"
                  pagination={false}
                  locale={{ emptyText: <EmptyState title="Chưa có thành viên" /> }}
                  dataSource={room.members}
                  columns={[
                    { title: "Mã SV", dataIndex: "studentCode" },
                    {
                      title: "Họ tên",
                      render: (_, m) => (
                        <Space size={6} wrap>
                          <span>{m.fullName}</span>
                          {m.isLeader && <Tag color="orange">Trưởng phòng</Tag>}
                        </Space>
                      ),
                    },
                    { title: "Ngành", dataIndex: "majorCode" },
                    { title: "GPA", render: (_, m) => formatDecimal(m.gpa) },
                    {
                      title: "Vai trò",
                      render: (_, m) =>
                        m.roles.length ? m.roles.map((r) => <Tag key={r.id}>{r.name}</Tag>) : "—",
                    },
                    { title: "Ngày vào", render: (_, m) => formatDateTime(m.joinedAt) },
                  ]}
                />
              </Card>
            </Col>

            <Col xs={24} xl={9}>
              <Card
                title="Cơ cấu nhóm"
                className="workspace-room-preview"
                extra={
                  <Button
                    size="small"
                    icon={<ReloadOutlined />}
                    loading={compositionLoading}
                    onClick={() => void loadComposition(true)}
                  >
                    Làm mới
                  </Button>
                }
              >
                {compositionLoading ? (
                  <RoomCompositionSkeleton />
                ) : unavailable ? (
                  <Alert
                    type="warning"
                    message="Tạm thời chưa kiểm tra được cơ cấu nhóm. Hãy thử bấm Làm mới."
                  />
                ) : composition ? (
                  <RoomCompositionSummary
                    composition={composition}
                    groupType={
                      compositionRules?.courseId === room.courseId ? compositionRules.groupType : undefined
                    }
                    majorCounts={room.majors}
                  />
                ) : (
                  <EmptyState title="Chưa có dữ liệu cơ cấu" />
                )}
              </Card>
            </Col>
          </Row>

          {isLeader && (
            <div ref={appliesSectionRef}>
              <Card
                className="workspace-section"
                title={
                  <Space wrap>
                    <span>Đơn xin vào phòng</span>
                    {pendingTotal > 0 && <Tag color="gold">{pendingTotal} chờ duyệt</Tag>}
                  </Space>
                }
                extra={
                  <Select
                    allowClear
                    aria-label="Lọc theo trạng thái đơn"
                    placeholder="Tất cả trạng thái"
                    style={{ width: 180 }}
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
                }
              >
                {appliesLoading ? (
                  <TableSkeleton
                    scrollX={980}
                    rows={4}
                    pagination={{ current: page, pageSize: size, total }}
                    columns={[
                      { title: "Người xin", kind: "text" },
                      { title: "Mã SV", kind: "code" },
                      { title: "Ngành", kind: "code" },
                      { title: "GPA", kind: "number" },
                      { title: "Vai trò", kind: "tags" },
                      { title: "Lời nhắn", kind: "longText" },
                      { title: "Ngày gửi", kind: "date" },
                      { title: "Trạng thái", kind: "tag" },
                      { title: "Thao tác", kind: "actions", actionWidths: [92, 74] },
                    ]}
                  />
                ) : (
                  <Table
                    scroll={{ x: 980 }}
                    rowKey="id"
                    dataSource={applies}
                    locale={{
                      emptyText: (
                        <EmptyState
                          title="Chưa có đơn xin vào phòng nào"
                          description={
                            status === "Pending"
                              ? "Hiện không còn đơn nào đang chờ duyệt."
                              : "Không có đơn nào khớp với bộ lọc hiện tại."
                          }
                        />
                      ),
                    }}
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
                      {
                        title: "GPA",
                        render: (_, a) => {
                          const belowReq =
                            room.requiredGpa != null && (a.gpa == null || a.gpa < room.requiredGpa);
                          return (
                            <Space direction="vertical" size={2}>
                              <span>{formatDecimal(a.gpa)}</span>
                              {belowReq && <Tag color="warning">Thấp hơn yêu cầu</Tag>}
                            </Space>
                          );
                        },
                      },
                      {
                        title: "Vai trò",
                        render: (_, a) =>
                          a.roles.length ? a.roles.map((r) => <Tag key={r.id}>{r.name}</Tag>) : "—",
                      },
                      { title: "Lời nhắn", dataIndex: "message", render: (v: string) => v || "—" },
                      { title: "Ngày gửi", render: (_, a) => formatDateTime(a.createdAt) },
                      { title: "Trạng thái", render: (_, a) => <ApplyStatusTag status={a.status} /> },
                      {
                        title: "Thao tác",
                        render: (_, a) =>
                          active &&
                          a.status === "Pending" && (
                            <Space>
                              <Button
                                type="primary"
                                loading={busyApplyId === a.id}
                                disabled={!!busyApplyId && busyApplyId !== a.id}
                                onClick={async () => {
                                  setBusyApplyId(a.id);
                                  try {
                                    if (await approve(a.id)) await refresh();
                                  } finally {
                                    setBusyApplyId(undefined);
                                  }
                                }}
                              >
                                Chấp nhận
                              </Button>
                              <Button
                                danger
                                loading={busyApplyId === a.id}
                                disabled={!!busyApplyId && busyApplyId !== a.id}
                                onClick={async () => {
                                  setBusyApplyId(a.id);
                                  try {
                                    if (await reject(a.id)) await refresh();
                                  } finally {
                                    setBusyApplyId(undefined);
                                  }
                                }}
                              >
                                Từ chối
                              </Button>
                            </Space>
                          ),
                      },
                    ]}
                  />
                )}
              </Card>
            </div>
          )}

          <Modal
            title="Gửi đơn xin vào phòng"
            open={applyOpen}
            confirmLoading={applying}
            destroyOnHidden
            okText="Gửi đơn"
            cancelText="Hủy"
            onCancel={() => setApplyOpen(false)}
            onOk={async () => {
              if (await apply(roomId, message)) {
                setApplyOpen(false);
                await refresh();
              }
            }}
          >
            <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
              Giới thiệu ngắn gọn về kỹ năng, vai trò bạn đảm nhận để trưởng phòng cân nhắc duyệt.
            </Typography.Paragraph>
            <Input.TextArea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={500}
              showCount
              rows={4}
              aria-label="Lời nhắn gửi trưởng phòng"
              placeholder="Nhập lời nhắn gửi trưởng phòng..."
            />
          </Modal>

          <Modal
            title="Chuyển quyền trưởng phòng"
            open={leaderOpen}
            confirmLoading={changing}
            destroyOnHidden
            okText="Chuyển quyền"
            cancelText="Hủy"
            okButtonProps={{ disabled: !leaderId }}
            onCancel={() => setLeaderOpen(false)}
            onOk={async () => {
              if (leaderId && (await changeLeader(roomId, leaderId))) {
                setLeaderOpen(false);
                await refresh();
              }
            }}
          >
            <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
              Trưởng phòng mới sẽ có quyền chỉnh sửa thông tin tuyển, duyệt đơn và hoàn tất nhóm.
            </Typography.Paragraph>
            <Select
              style={{ width: "100%" }}
              aria-label="Chọn trưởng phòng mới"
              placeholder="Chọn thành viên trong phòng"
              value={leaderId}
              onChange={setLeaderId}
              options={room.members
                .filter((m) => m.studentId !== student?.id)
                .map((m) => ({ value: m.studentId, label: `${m.fullName} (${m.studentCode})` }))}
            />
          </Modal>
        </>
      ) : (
        <Card>
          <EmptyState
            title="Không tìm thấy phòng"
            description="Phòng này không tồn tại hoặc đã bị hủy."
            action={
              <Button type="primary" onClick={() => navigate("/student/courses")}>
                Về Học phần của tôi
              </Button>
            }
          />
        </Card>
      )}
    </div>
  );
}
