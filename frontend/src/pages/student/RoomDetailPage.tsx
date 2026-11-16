import "@/features/workspace.css";
import { useCallback, useEffect, useState } from "react";
import { StarFilled } from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from "antd";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, appliesApi, coursesApi, referenceApi, roomsApi } from "@/api";
import type { ApplyStatus, CompositionAnalysis, Group, GroupType, Room, RoomApply } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import { ApplyStatusTag, RoomStatusTag } from "@/components/StatusTag";
import { applyStatusLabel } from "@/components/labels";
import { formatDateTime } from "@/components/format";
import { useApiAction, useShowError } from "@/components/useApiAction";
import { CreateRoomModal } from "@/features/student/CreateRoomModal";
import { loadAllMyCourses } from "@/features/student/loadMyCourses";
import { RoomCompositionSummary } from "@/features/student/RoomCompositionSummary";

export function RoomDetailPage() {
  const { roomId = "" } = useParams();
  const navigate = useNavigate();
  const { student } = useAuth();
  const showError = useShowError();
  const [editOpen, setEditOpen] = useState(false);
  const [room, setRoom] = useState<Room>();
  const [composition, setComposition] = useState<CompositionAnalysis>();
  const [compositionRules, setCompositionRules] = useState<{ courseId: string; groupType: GroupType }>();
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
        if (e instanceof ApiError && e.status === 503 && e.code === "MATCHING_UNAVAILABLE")
          setUnavailable(true);
        else showError(e);
      } finally {
        setCompositionLoading(false);
      }
    },
    [roomId, loadRoom, showError],
  );
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
  const courseId = room?.courseId;
  useEffect(() => {
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
        let page = 1;
        while (current) {
          const types = await referenceApi.groupTypes({ q: course.groupTypeName, page });
          if (!current) return;
          const groupType = types.items.find((type) => type.id === course.groupTypeId);
          if (groupType) {
            setCompositionRules({ courseId: id, groupType });
            return;
          }
          if (page >= types.totalPages) return;
          page++;
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
    <div className="workspace-page">
      <Spin spinning={loading}>
        {room ? (
          <>
            <header className="workspace-heading">
              <div>
                <Link to={`/student/courses/${room.courseId}`}>← Tìm nhóm</Link>
                <Typography.Title level={1}>{room.name || room.code}</Typography.Title>
                <p>
                  {room.code} · {room.courseCode}
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
                  <>
                    Phòng đã thành nhóm{" "}
                    {group && <Link to={`/student/groups/${group.id}`}>Xem nhóm {group.code}</Link>}
                  </>
                }
              />
            )}
            <Card title="Thông tin tuyển" extra={<RoomStatusTag status={room.status} />}>
              <dl className="workspace-facts">
                {[
                  ["Dự án", room.projectName || "Chưa có"],
                  ["GPA yêu cầu", room.requiredGpa ?? "Không yêu cầu"],
                  ["Điểm mục tiêu", room.targetGrade ?? "Chưa có"],
                  ["Trưởng phòng", room.leaderName],
                  ["Course", room.courseCode],
                  ["Số thành viên", room.memberCount],
                ].map(([label, value]) => (
                  <div className="workspace-fact" key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="workspace-section">
                <strong>Mô tả ý tưởng</strong>
                <div className="workspace-room-description">{room.ideaDescription || "Chưa có"}</div>
              </div>
              <div className="workspace-section">
                <strong>Vai trò cần tuyển</strong>
                <div>
                  {room.neededRoles.length
                    ? room.neededRoles.map((r) => <Tag key={r.id}>{r.name}</Tag>)
                    : "Chưa tuyển thêm"}
                </div>
              </div>
            </Card>
            <Typography.Title level={2}>Thành viên</Typography.Title>
            <Table
              scroll={{ x: 650 }}
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
                <Button loading={compositionLoading} onClick={() => void loadComposition(true)}>
                  Làm mới
                </Button>
              }
              style={{ marginTop: 16 }}
            >
              {compositionLoading ? (
                <Typography.Text type="secondary" role="status">
                  Đang kiểm tra cơ cấu nhóm…
                </Typography.Text>
              ) : unavailable ? (
                <Alert type="warning" message="Tạm thời chưa kiểm tra được cơ cấu nhóm. Hãy thử làm mới." />
              ) : composition ? (
                <RoomCompositionSummary
                  composition={composition}
                  groupType={
                    compositionRules?.courseId === room.courseId ? compositionRules.groupType : undefined
                  }
                  majorCounts={room.majors}
                />
              ) : (
                <Empty description="Chưa có dữ liệu cơ cấu" />
              )}
            </Card>
            {isLeader && (
              <>
                <Typography.Title level={2}>Đơn xin vào phòng</Typography.Title>
                <Select
                  className="workspace-toolbar"
                  allowClear
                  aria-label="Lọc theo trạng thái đơn"
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
                  scroll={{ x: 1000 }}
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
                    {
                      title: "Vai trò",
                      render: (_, a) => a.roles.map((r) => <Tag key={r.id}>{r.name}</Tag>),
                    },
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
                    },
                  ]}
                />
              </>
            )}
            <Modal
              title="Gửi đơn xin vào phòng"
              open={applyOpen}
              confirmLoading={applying}
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
              <Input.TextArea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={500}
                showCount
                aria-label="Lời nhắn gửi trưởng phòng"
                placeholder="Lời nhắn"
              />
            </Modal>
            <Modal
              title="Chuyển trưởng phòng"
              open={leaderOpen}
              confirmLoading={changing}
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
              <Select
                style={{ width: "100%" }}
                aria-label="Chọn trưởng phòng mới"
                placeholder="Chọn thành viên"
                value={leaderId}
                onChange={setLeaderId}
                options={room.members
                  .filter((m) => m.studentId !== student?.id)
                  .map((m) => ({ value: m.studentId, label: `${m.fullName} (${m.studentCode})` }))}
              />
            </Modal>
          </>
        ) : (
          !loading && <Empty description="Không tìm thấy phòng" />
        )}
      </Spin>
    </div>
  );
}
