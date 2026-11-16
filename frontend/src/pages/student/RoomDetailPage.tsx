import { useCallback, useEffect, useState } from "react";
import { StarFilled } from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Row,
  Col,
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
import { ApiError, appliesApi, roomsApi } from "@/api";
import type { ApplyStatus, CompositionAnalysis, Group, Room, RoomApply } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import { ApplyStatusTag, RoomStatusTag } from "@/components/StatusTag";
import { applyStatusLabel } from "@/components/labels";
import { formatDateTime } from "@/components/format";
import { useApiAction, useShowError } from "@/components/useApiAction";
import { CreateRoomModal } from "@/features/student/CreateRoomModal";
import { loadAllMyCourses } from "@/features/student/loadMyCourses";

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
          <Card>
            <Typography.Title level={4}>{room.name || room.code}</Typography.Title>
            <Typography.Text type="secondary">
              {room.code} · {room.courseCode}
            </Typography.Text>{" "}
            <RoomStatusTag status={room.status} />
            <Row gutter={[12, 12]} style={{ marginTop: 16 }}>
              {[
                ["Dự án", room.projectName || "Chưa có"],
                ["GPA yêu cầu", room.requiredGpa ?? "Không yêu cầu"],
                ["Điểm mục tiêu", room.targetGrade ?? "Chưa có"],
                ["Trưởng phòng", room.leaderName],
                ["Course", room.courseCode],
                ["Số thành viên", room.memberCount],
              ].map(([label, value]) => (
                <Col xs={24} sm={12} lg={8} key={label}>
                  <div style={{ background: "#f5f5f5", borderRadius: 8, padding: 12, height: "100%" }}>
                    <Typography.Text type="secondary" style={{ fontSize: 12, textTransform: "uppercase" }}>
                      {label}
                    </Typography.Text>
                    <div>{value}</div>
                  </div>
                </Col>
              ))}
            </Row>
            <div style={{ background: "#f5f5f5", borderRadius: 8, padding: 16, marginTop: 16 }}>
              <strong>Mô tả ý tưởng</strong>
              <div>{room.ideaDescription || "Chưa có"}</div>
            </div>
            <div style={{ background: "#f5f5f5", borderRadius: 8, padding: 16, marginTop: 16 }}>
              <strong>Vai trò cần tuyển</strong>
              <div>
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
  );
}
