import "@/features/workspace.css";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Badge,
  Col,
  Row,
  Pagination,
  Empty,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  Typography,
} from "antd";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, coursesApi, referenceApi, roomsApi } from "@/api";
import type {
  Course,
  GroupType,
  MyCourse,
  RoomRecommendation,
  RoomStatus,
  RoomSummary,
  Room,
  TeamRole,
} from "@/api";
import { MajorCounts, RoomStatusTag } from "@/components/StatusTag";
import { roomStatusLabel } from "@/components/labels";
import { formatDateTime } from "@/components/format";
import { useApiAction, useShowError } from "@/components/useApiAction";
import { useAuth } from "@/auth/AuthContext";
import { CreateRoomModal } from "@/features/student/CreateRoomModal";
import { loadAllMyCourses } from "@/features/student/loadMyCourses";

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
  const roomPreview = useRef<HTMLElement>(null);
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
    <Space wrap>
      <Link to={`/student/rooms/${id}`}>Xem trang phòng</Link>
      {canAct && state === "Open" && (
        <Button
          type="primary"
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
          type="primary"
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
  return (
    <div className="workspace-page">
      <Spin spinning={!ready && !course}>
        <header className="workspace-heading">
          <div>
            <Link to="/student/courses">← Course của tôi</Link>
            <Typography.Title level={1}>Tìm nhóm</Typography.Title>
            <p>{course?.code}</p>
          </div>
          {canAct && (
            <Button type="primary" onClick={() => setCreateOpen(true)}>
              + Tạo nhóm
            </Button>
          )}
        </header>
        {course && (
          <Card>
            <dl className="workspace-facts">
              <div className="workspace-fact">
                <dt>Loại nhóm</dt>
                <dd>{course.groupTypeName}</dd>
              </div>
              <div className="workspace-fact">
                <dt>Hạn ghép nhóm</dt>
                <dd>{formatDateTime(course.deadline)}</dd>
              </div>
              {type && (
                <div className="workspace-fact">
                  <dt>Quy định thành viên</dt>
                  <dd>
                    {type.minMemberCount}–{type.maxMemberCount} thành viên · tối thiểu {type.minMajorCount}{" "}
                    ngành
                    {type.majors.map((m) => ` · ${m.majorCode}: ${m.minQuantity}–${m.maxQuantity}`)}
                  </dd>
                </div>
              )}
            </dl>
          </Card>
        )}
        {mine?.myRoom && (
          <Alert
            type="info"
            showIcon
            message={
              <>
                Bạn đang ở phòng <Link to={`/student/rooms/${mine.myRoom.id}`}>{mine.myRoom.code}</Link>
              </>
            }
          />
        )}
        {mine?.myGroup && (
          <Alert
            type="info"
            showIcon
            message={
              <>
                Bạn đã có nhóm <Link to={`/student/groups/${mine.myGroup.id}`}>{mine.myGroup.code}</Link>
              </>
            }
          />
        )}
        <CreateRoomModal open={createOpen} course={mine} onClose={() => setCreateOpen(false)} />
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24} lg={10}>
            <Card title="Bộ lọc">
              <div className="workspace-filter-fields">
                <div>
                  <label htmlFor="room-search">Tên nhóm</label>
                  <Input.Search
                    id="room-search"
                    placeholder="Tìm tên nhóm, dự án, mã phòng"
                    allowClear
                    onSearch={(v) => {
                      setQ(v);
                      setPage(1);
                    }}
                  />
                </div>
                <div>
                  <label htmlFor="room-filter-gpa">GPA của bạn (tối đa 4)</label>
                  <InputNumber
                    id="room-filter-gpa"
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
                </div>
                <div className="workspace-switch">
                  <span id="room-eligibility">Chỉ phòng tôi vào được</span>
                  <Switch
                    aria-labelledby="room-eligibility"
                    checked={eligibleOnly}
                    disabled={gpa == null}
                    onChange={(v) => {
                      setEligibleOnly(v);
                      setPage(1);
                    }}
                  />
                </div>
                <div>
                  <label htmlFor="room-filter-roles">Vai trò cần tuyển</label>
                  <Select
                    id="room-filter-roles"
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
                </div>
                <div>
                  <label htmlFor="room-filter-status">Trạng thái</label>
                  <Select
                    id="room-filter-status"
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
                </div>
              </div>
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
            <Typography.Title level={2}>Danh sách phòng</Typography.Title>
            <Spin spinning={loading}>
              <div className="workspace-room-list">
                {!loading && rooms.length === 0 && <Empty description="Không có phòng" />}
                {rooms.map((r) => {
                  const card = (
                    <Card hoverable className="workspace-room-card" data-selected={selected?.id === r.id}>
                      <Button
                        type="link"
                        aria-controls="room-preview"
                        aria-pressed={selected?.id === r.id}
                        onClick={async () => {
                          setDetailLoading(true);
                          setSelected(undefined);
                          try {
                            setSelected(await roomsApi.get(r.id));
                            if (window.matchMedia("(max-width: 991.98px)").matches) {
                              roomPreview.current?.focus();
                            }
                          } catch (e) {
                            showError(e);
                          } finally {
                            setDetailLoading(false);
                          }
                        }}
                      >
                        {r.name || r.code}
                      </Button>
                      <div>
                        <Typography.Text type="secondary">{r.code}</Typography.Text>
                      </div>
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
            <section
              className="workspace-room-preview"
              id="room-preview"
              aria-label="Chi tiết phòng"
              tabIndex={-1}
              ref={roomPreview}
              aria-busy={detailLoading}
            >
              <Card>
                <Spin spinning={detailLoading}>
                  {selected ? (
                    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                      <Typography.Title level={2}>{selected.name || selected.code}</Typography.Title>
                      <RoomStatusTag status={selected.status} />
                      <div>
                        <strong>Dự án:</strong> {selected.projectName || "Chưa có"}
                      </div>
                      <div>
                        <strong>Mô tả ý tưởng</strong>
                        <div className="workspace-room-description">
                          {selected.ideaDescription || "Chưa có"}
                        </div>
                      </div>
                      <div>
                        <strong>GPA yêu cầu:</strong> {selected.requiredGpa ?? "Không yêu cầu"}
                      </div>
                      <div>
                        <strong>Điểm mục tiêu:</strong> {selected.targetGrade ?? "Chưa có"}
                      </div>
                      <div>
                        <strong>Vai trò cần tuyển:</strong>{" "}
                        {selected.neededRoles.length
                          ? selected.neededRoles.map((r) => <Tag key={r.id}>{r.name}</Tag>)
                          : "Chưa tuyển thêm"}
                      </div>
                      <div>
                        <strong>Cơ cấu ngành:</strong> <MajorCounts majors={selected.majors} />
                      </div>
                      <div>
                        <strong>Thành viên:</strong>{" "}
                        {selected.members.map((m) => m.fullName).join(", ") || "Chưa có"}
                      </div>
                      {actions(selected.id, selected.status)}
                    </Space>
                  ) : (
                    <Empty
                      description={
                        <>
                          <strong>Chọn một nhóm</strong>
                          <br />
                          Chọn phòng từ danh sách để xem thành viên và thông tin tuyển.
                        </>
                      }
                    />
                  )}
                </Spin>
              </Card>
            </section>
          </Col>
        </Row>
        <Modal
          title="Gửi đơn xin vào phòng"
          open={!!applyRoom}
          confirmLoading={applying}
          okText="Gửi đơn"
          cancelText="Hủy"
          onCancel={() => setApplyRoom(undefined)}
          onOk={async () => {
            if (applyRoom && (await apply(applyRoom, message))) {
              setApplyRoom(undefined);
              await Promise.all([loadRooms(), loadRecommendations(), loadBase()]);
            }
          }}
        >
          <Input.TextArea
            maxLength={500}
            showCount
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            aria-label="Lời nhắn gửi trưởng phòng"
            placeholder="Lời nhắn"
          />
        </Modal>
      </Spin>
    </div>
  );
}
