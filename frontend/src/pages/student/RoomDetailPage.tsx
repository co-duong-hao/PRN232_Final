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
import { getApplyStatusLabels } from "@/components/labels";
import { ApplyStatusTag, RoomStatusTag } from "@/components/StatusTag";
import { useApiAction, useShowError } from "@/components/useApiAction";
import { CreateRoomModal } from "@/features/student/CreateRoomModal";
import { loadAllMyCourses } from "@/features/student/loadMyCourses";
import { RoomCompositionSummary } from "@/features/student/RoomCompositionSummary";
import { RoomCompositionSkeleton, RoomDetailSkeleton, TableSkeleton } from "@/features/WorkspaceSkeletons";
import { useI18n } from "@/i18n";

export function RoomDetailPage() {
  const { roomId = "" } = useParams();
  const navigate = useNavigate();
  const { student } = useAuth();
  const { t, language } = useI18n();
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

  const [join, joining] = useApiAction(
    async (id: string) => {
      try {
        return await roomsApi.join(id);
      } catch (e) {
        if (e instanceof ApiError && e.code === "BR19") {
          Modal.confirm({
            title: t.roomDetail.br19ModalTitle,
            content:
              language === "en"
                ? "Your current GPA does not meet the requirement for direct joining. You can update your profile or apply when the room is locked."
                : "GPA hiện tại của bạn thấp hơn yêu cầu của phòng (hoặc chưa khai báo trong hồ sơ). Hãy cập nhật hồ sơ hoặc gửi đơn khi phòng chuyển sang trạng thái Đã khóa.",
            okText: t.appLayout.onboardingUpdateBtn,
            cancelText: t.common.close,
            onOk: () => navigate("/student/profile"),
          });
          return undefined;
        }
        throw e;
      }
    },
    language === "en" ? "Joined room successfully" : "Đã tham gia phòng",
  );
  const [apply, applying] = useApiAction(
    roomsApi.apply,
    language === "en" ? "Application sent successfully" : "Đã gửi đơn xin vào phòng",
  );
  const [leave, leaving] = useApiAction(
    async (id: string) => {
      await roomsApi.leave(id);
      return true;
    },
    language === "en" ? "Left room successfully" : "Đã rời phòng",
  );
  const [changeLeader, changing] = useApiAction(
    roomsApi.changeLeader,
    language === "en" ? "Leadership transferred successfully" : "Đã chuyển quyền trưởng phòng",
  );
  const [complete, completing] = useApiAction(
    roomsApi.complete,
    language === "en" ? "Finalized into official team" : "Đã hoàn tất thành nhóm chính thức",
  );
  const [approve] = useApiAction(
    appliesApi.approve,
    language === "en" ? "Application approved" : "Đã chấp nhận đơn",
  );
  const [reject] = useApiAction(
    appliesApi.reject,
    language === "en" ? "Application rejected" : "Đã từ chối đơn",
  );

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
    async (manual = false) => {
      setCompositionLoading(true);
      try {
        const c = await roomsApi.composition(roomId);
        setComposition(c);
        setUnavailable(false);
      } catch (e) {
        if (e instanceof ApiError && e.status === 503 && e.code === "MATCHING_UNAVAILABLE") {
          setUnavailable(true);
        } else if (manual) {
          showError(e);
        }
      } finally {
        setCompositionLoading(false);
      }
    },
    [roomId, showError],
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

  const loadPendingCount = useCallback(async () => {
    try {
      const data = await roomsApi.applies(roomId, { page: 1, pageSize: 1, status: "Pending" });
      setPendingTotal(data.totalItems);
    } catch {
      // Background count
    }
  }, [roomId]);

  useEffect(() => {
    setLoading(true);
    void loadRoom();
    void loadComposition();
  }, [loadRoom, loadComposition]);

  useEffect(() => {
    if (room?.courseId) {
      loadAllMyCourses()
        .then((courses) => {
          const matched = courses.find((c) => c.id === room.courseId);
          if (matched?.myGroup) {
            setGroup(matched.myGroup);
          }
        })
        .catch(() => {});
    }
  }, [room?.courseId]);

  useEffect(() => {
    if (!room?.courseId) return;
    let cancelled = false;

    Promise.all([coursesApi.get(room.courseId), referenceApi.groupTypes()])
      .then(([course, groupTypes]) => {
        if (cancelled) return;
        const matched = groupTypes.items.find((gt) => gt.id === course.groupTypeId);
        if (matched) {
          setCompositionRules({ courseId: room.courseId, groupType: matched });
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [room?.courseId]);

  const isLeader = room?.leaderId === student?.id;
  const isMember = !!room?.members.some((m) => m.studentId === student?.id);
  const active = room?.status === "Open" || room?.status === "Locked";

  useEffect(() => {
    if (isLeader) {
      void loadApplies();
      void loadPendingCount();
    }
  }, [isLeader, loadApplies, loadPendingCount]);

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
                {t.roomDetail.backToFindTeam}
              </Link>
              <div className="workspace-heading__title-row">
                <Typography.Title level={1}>{room.name || room.code}</Typography.Title>
                <RoomStatusTag status={room.status} />
              </div>
              <p>
                {room.code} · {room.courseCode} · {t.roomDetail.membersMeta(room.memberCount, maxMembers)}
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
                  {t.roomDetail.joinRoom}
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
                  {t.roomDetail.applyToJoin}
                </Button>
              )}

              {active && isLeader && (
                <>
                  <Button onClick={() => setEditOpen(true)}>{t.roomDetail.editRecruitment}</Button>
                  <Tooltip title={room.members.length < 2 ? t.roomDetail.transferLeaderTooltip : ""}>
                    <Button
                      disabled={room.members.length < 2}
                      onClick={() => {
                        setLeaderId(undefined);
                        setLeaderOpen(true);
                      }}
                    >
                      {t.roomDetail.transferLeader}
                    </Button>
                  </Tooltip>
                  <Tooltip title={completeDisabled ? t.roomDetail.completeDisabledTooltip : ""}>
                    <span>
                      <Popconfirm
                        title={t.roomDetail.completeConfirmTitle}
                        description={t.roomDetail.completeConfirmDesc}
                        okText={t.roomDetail.completeConfirmOk}
                        cancelText={t.common.cancel}
                        disabled={completeDisabled}
                        onConfirm={async () => {
                          const result = await complete(roomId);
                          if (result) navigate(`/student/groups/${result.id}`);
                        }}
                      >
                        <Button type="primary" disabled={completeDisabled} loading={completing}>
                          {t.roomDetail.completeButton}
                        </Button>
                      </Popconfirm>
                    </span>
                  </Tooltip>
                </>
              )}

              {active && isMember && (
                <Tooltip title={leaveBlocked ? t.roomDetail.leaveBlockedTooltip : ""}>
                  <span>
                    <Popconfirm
                      title={t.roomDetail.leaveConfirmTitle}
                      description={t.roomDetail.leaveConfirmDesc}
                      okText={t.roomDetail.leaveConfirmOk}
                      cancelText={t.common.cancel}
                      disabled={leaveBlocked}
                      onConfirm={async () => {
                        if (await leave(roomId)) navigate("/student/courses");
                      }}
                    >
                      <Button danger loading={leaving} disabled={leaveBlocked}>
                        {t.roomDetail.leaveRoom}
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
                  <span>
                    {language === "en"
                      ? "Room has been finalized and converted into an official team."
                      : "Phòng đã hoàn tất và chuyển thành nhóm chính thức."}
                  </span>
                  {group && (
                    <Button
                      type="primary"
                      size="small"
                      onClick={() => navigate(`/student/groups/${group.id}`)}
                    >
                      {language === "en" ? `View Team ${group.code}` : `Xem nhóm ${group.code}`}
                    </Button>
                  )}
                </Space>
              }
            />
          )}

          {active && !isMember && room.status === "Open" && gpaTooLowForJoin && (
            <Alert
              type="warning"
              message={
                language === "en"
                  ? `Room requires minimum GPA ${formatDecimal(room.requiredGpa)}`
                  : `Phòng yêu cầu GPA tối thiểu ${formatDecimal(room.requiredGpa)}`
              }
              description={
                student?.gpa == null
                  ? language === "en"
                    ? "You haven't updated your GPA in your profile yet, so you cannot join directly."
                    : "Bạn chưa khai báo GPA trong hồ sơ nên chưa thể vào trực tiếp phòng này."
                  : language === "en"
                    ? `Your current GPA (${formatDecimal(student.gpa)}) is lower than required so you cannot join directly.`
                    : `GPA hiện tại của bạn (${formatDecimal(student.gpa)}) thấp hơn yêu cầu nên không thể vào trực tiếp.`
              }
              action={
                <Button size="small" onClick={() => navigate("/student/profile")}>
                  {t.appLayout.onboardingUpdateBtn}
                </Button>
              }
            />
          )}

          {active && isLeader && pendingTotal > 0 && (
            <Alert
              type="info"
              message={
                language === "en"
                  ? `You have ${pendingTotal} room application${pendingTotal > 1 ? "s" : ""} pending review`
                  : `Bạn có ${pendingTotal} đơn xin vào phòng đang chờ duyệt`
              }
              description={
                language === "en"
                  ? "Review applicant GPA, major, and role to accept or reject candidates."
                  : "Xem hồ sơ GPA, ngành và vai trò của ứng viên để quyết định chấp nhận hoặc từ chối."
              }
              action={
                <Button
                  type="primary"
                  size="small"
                  onClick={() => appliesSectionRef.current?.scrollIntoView({ behavior: "smooth" })}
                >
                  {language === "en" ? "View Pending Applications" : "Xem đơn chờ duyệt"}
                </Button>
              }
            />
          )}

          <Row gutter={[16, 16]}>
            <Col xs={24} xl={15}>
              <Card
                title={language === "en" ? "Recruitment & Project Details" : "Thông tin tuyển và dự án"}
                extra={<RoomStatusTag status={room.status} />}
              >
                <dl className="workspace-facts">
                  {[
                    [
                      language === "en" ? "Project" : "Dự án",
                      room.projectName || (language === "en" ? "None" : "Chưa có"),
                    ],
                    [
                      language === "en" ? "Required GPA" : "GPA yêu cầu",
                      room.requiredGpa != null
                        ? formatDecimal(room.requiredGpa)
                        : language === "en"
                          ? "None"
                          : "Không yêu cầu",
                    ],
                    [
                      language === "en" ? "Target Grade" : "Điểm mục tiêu",
                      room.targetGrade != null
                        ? formatDecimal(room.targetGrade)
                        : language === "en"
                          ? "Not set"
                          : "Chưa đặt",
                    ],
                    [language === "en" ? "Leader" : "Trưởng phòng", room.leaderName],
                    [language === "en" ? "Course" : "Học phần", room.courseCode],
                    [
                      language === "en" ? "Member Count" : "Số thành viên",
                      maxMembers ? `${room.memberCount}/${maxMembers}` : room.memberCount,
                    ],
                  ].map(([label, value]) => (
                    <div className="workspace-fact" key={String(label)}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>

                <div className="workspace-section">
                  <strong>{language === "en" ? "Idea description" : "Mô tả ý tưởng"}</strong>
                  <div className="workspace-room-description">
                    {room.ideaDescription ||
                      (language === "en" ? "No idea description provided." : "Chưa có mô tả ý tưởng.")}
                  </div>
                </div>

                <div className="workspace-section">
                  <strong>{language === "en" ? "Roles recruiting: " : "Vai trò cần tuyển: "}</strong>
                  {room.neededRoles.length
                    ? room.neededRoles.map((r) => <Tag key={r.id}>{r.name}</Tag>)
                    : language === "en"
                      ? "None"
                      : "Chưa tuyển thêm"}
                </div>
              </Card>

              <Card
                title={
                  language === "en"
                    ? `Current Members (${room.members.length})`
                    : `Thành viên hiện tại (${room.members.length})`
                }
                className="workspace-section"
              >
                <Table
                  scroll={{ x: 640 }}
                  rowKey="studentId"
                  pagination={false}
                  locale={{
                    emptyText: <EmptyState title={language === "en" ? "No members" : "Chưa có thành viên"} />,
                  }}
                  dataSource={room.members}
                  columns={[
                    { title: language === "en" ? "Student ID" : "Mã SV", dataIndex: "studentCode" },
                    {
                      title: language === "en" ? "Full Name" : "Họ tên",
                      render: (_, m) => (
                        <Space size={6} wrap>
                          <span>{m.fullName}</span>
                          {m.isLeader && (
                            <Tag color="orange">{language === "en" ? "Leader" : "Trưởng phòng"}</Tag>
                          )}
                        </Space>
                      ),
                    },
                    { title: language === "en" ? "Major" : "Ngành", dataIndex: "majorCode" },
                    { title: "GPA", render: (_, m) => formatDecimal(m.gpa) },
                    {
                      title: language === "en" ? "Role" : "Vai trò",
                      render: (_, m) =>
                        m.roles.length ? m.roles.map((r) => <Tag key={r.id}>{r.name}</Tag>) : "—",
                    },
                    {
                      title: language === "en" ? "Joined Date" : "Ngày vào",
                      render: (_, m) => formatDateTime(m.joinedAt),
                    },
                  ]}
                />
              </Card>
            </Col>

            <Col xs={24} xl={9}>
              <Card
                title={t.roomDetail.compositionTitle}
                className="workspace-room-preview"
                extra={
                  <Button
                    size="small"
                    icon={<ReloadOutlined />}
                    loading={compositionLoading}
                    onClick={() => void loadComposition(true)}
                  >
                    {language === "en" ? "Refresh" : "Làm mới"}
                  </Button>
                }
              >
                {compositionLoading ? (
                  <RoomCompositionSkeleton />
                ) : unavailable ? (
                  <Alert
                    type="warning"
                    message={
                      language === "en"
                        ? "Temporary error checking team composition. Please click Refresh."
                        : "Tạm thời chưa kiểm tra được cơ cấu nhóm. Hãy thử bấm Làm mới."
                    }
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
                  <EmptyState title={language === "en" ? "No composition data" : "Chưa có dữ liệu cơ cấu"} />
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
                    <span>{language === "en" ? "Room Applications" : "Đơn xin vào phòng"}</span>
                    {pendingTotal > 0 && (
                      <Tag color="gold">
                        {language === "en" ? `${pendingTotal} pending` : `${pendingTotal} chờ duyệt`}
                      </Tag>
                    )}
                  </Space>
                }
                extra={
                  <Select
                    allowClear
                    aria-label={t.roomDetail.appliesFilterStatus}
                    placeholder={language === "en" ? "All statuses" : "Tất cả trạng thái"}
                    style={{ width: 180 }}
                    value={status}
                    onChange={(v) => {
                      setStatus(v);
                      setPage(1);
                    }}
                    options={Object.entries(getApplyStatusLabels(language)).map(([value, label]) => ({
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
                      { title: language === "en" ? "Applicant" : "Người xin", kind: "text" },
                      { title: language === "en" ? "Student ID" : "Mã SV", kind: "code" },
                      { title: language === "en" ? "Major" : "Ngành", kind: "code" },
                      { title: "GPA", kind: "number" },
                      { title: language === "en" ? "Role" : "Vai trò", kind: "tags" },
                      { title: language === "en" ? "Message" : "Lời nhắn", kind: "longText" },
                      { title: language === "en" ? "Date" : "Ngày gửi", kind: "date" },
                      { title: language === "en" ? "Status" : "Trạng thái", kind: "tag" },
                      {
                        title: language === "en" ? "Actions" : "Thao tác",
                        kind: "actions",
                        actionWidths: [92, 74],
                      },
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
                          title={
                            language === "en" ? "No room applications yet" : "Chưa có đơn xin vào phòng nào"
                          }
                          description={
                            status === "Pending"
                              ? language === "en"
                                ? "No applications are currently awaiting review."
                                : "Hiện không còn đơn nào đang chờ duyệt."
                              : language === "en"
                                ? "No applications match your active filter."
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
                      { title: language === "en" ? "Applicant" : "Người xin", dataIndex: "fullName" },
                      { title: language === "en" ? "Student ID" : "Mã SV", dataIndex: "studentCode" },
                      { title: language === "en" ? "Major" : "Ngành", dataIndex: "majorCode" },
                      {
                        title: "GPA",
                        render: (_, a) => {
                          const belowReq =
                            room.requiredGpa != null && (a.gpa == null || a.gpa < room.requiredGpa);
                          return (
                            <Space direction="vertical" size={2}>
                              <span>{formatDecimal(a.gpa)}</span>
                              {belowReq && (
                                <Tag color="warning">
                                  {language === "en" ? "Below requirement" : "Thấp hơn yêu cầu"}
                                </Tag>
                              )}
                            </Space>
                          );
                        },
                      },
                      {
                        title: language === "en" ? "Role" : "Vai trò",
                        render: (_, a) =>
                          a.roles.length ? a.roles.map((r) => <Tag key={r.id}>{r.name}</Tag>) : "—",
                      },
                      {
                        title: t.roomDetail.colMessage,
                        dataIndex: "message",
                        render: (v: string) => v || "—",
                      },
                      {
                        title: t.roomDetail.colSubmittedAt,
                        render: (_, a) => formatDateTime(a.createdAt),
                      },
                      {
                        title: t.common.status,
                        render: (_, a) => <ApplyStatusTag status={a.status} />,
                      },
                      {
                        title: t.common.actions,
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
                                {t.roomDetail.approve}
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
                                {t.roomDetail.reject}
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
            title={t.courseRooms.applyModalTitle}
            open={applyOpen}
            confirmLoading={applying}
            destroyOnHidden
            okText={t.courseRooms.applyModalOk}
            cancelText={t.common.cancel}
            onCancel={() => setApplyOpen(false)}
            onOk={async () => {
              if (await apply(roomId, message)) {
                setApplyOpen(false);
                await refresh();
              }
            }}
          >
            <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
              {t.roomDetail.applyModalHint}
            </Typography.Paragraph>
            <Input.TextArea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={500}
              showCount
              rows={4}
              aria-label={t.courseRooms.applyMessageAria}
              placeholder={t.courseRooms.applyMessagePlaceholder}
            />
          </Modal>

          <Modal
            title={t.roomDetail.changeLeaderTitle}
            open={leaderOpen}
            confirmLoading={changing}
            destroyOnHidden
            okText={t.roomDetail.changeLeaderOk}
            cancelText={t.common.cancel}
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
              {t.roomDetail.changeLeaderHint}
            </Typography.Paragraph>
            <Select
              style={{ width: "100%" }}
              aria-label={t.roomDetail.changeLeaderSelectAria}
              placeholder={t.roomDetail.changeLeaderPlaceholder}
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
            title={t.roomDetail.notFoundTitle}
            description={t.roomDetail.notFoundDesc}
            action={
              <Button type="primary" onClick={() => navigate("/student/courses")}>
                {t.common.goToMyCourses}
              </Button>
            }
          />
        </Card>
      )}
    </div>
  );
}
