import "@/features/workspace.css";
import { ArrowLeftOutlined, PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Input,
  InputNumber,
  Modal,
  Pagination,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from "antd";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, coursesApi, referenceApi, roomsApi } from "@/api";
import type {
  Course,
  GroupType,
  MyCourse,
  Room,
  RoomRecommendation,
  RoomStatus,
  RoomSummary,
  TeamRole,
} from "@/api";
import { useAuth } from "@/auth/AuthContext";
import { EmptyState } from "@/components/EmptyState";
import { formatDateTime, formatDecimal } from "@/components/format";
import { roomStatusLabel } from "@/components/labels";
import { MajorCounts, RoomStatusTag } from "@/components/StatusTag";
import { useApiAction, useShowError } from "@/components/useApiAction";
import { CreateRoomModal } from "@/features/student/CreateRoomModal";
import { loadAllMyCourses } from "@/features/student/loadMyCourses";
import { PageHeadingSkeleton, RoomListSkeleton, RoomPreviewSkeleton } from "@/features/WorkspaceSkeletons";

export function CourseRoomsPage() {
  const { courseId = "" } = useParams();
  const navigate = useNavigate();
  const { student } = useAuth();
  const showError = useShowError();

  const [createOpen, setCreateOpen] = useState(false);
  const [gpa, setGpa] = useState<number | null>(student?.gpa ?? null);
  const [debouncedGpa, setDebouncedGpa] = useState<number | null>(student?.gpa ?? null);
  const [eligibleOnly, setEligibleOnly] = useState(false);
  const [roles, setRoles] = useState<TeamRole[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [roleIds, setRoleIds] = useState<string[]>([]);

  useEffect(() => {
    setGpa(student?.gpa ?? null);
    setDebouncedGpa(student?.gpa ?? null);
  }, [student?.gpa]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedGpa(gpa);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [gpa]);

  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQ((prev) => {
        if (prev !== searchInput.trim()) setPage(1);
        return searchInput.trim();
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const [course, setCourse] = useState<Course>();
  const [type, setType] = useState<GroupType>();
  const [mine, setMine] = useState<MyCourse>();
  const [ready, setReady] = useState(false);

  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [recommendations, setRecommendations] = useState<RoomRecommendation[]>([]);
  const [recommendationsLoading, setRecommendationsLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [recommendedDetails, setRecommendedDetails] = useState<Record<string, Room>>({});

  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<RoomStatus>();
  const [loading, setLoading] = useState(true);

  const roomPreview = useRef<HTMLElement>(null);
  const [selectedId, setSelectedId] = useState<string>();
  const selectedIdRef = useRef<string>();
  selectedIdRef.current = selectedId;
  const [selected, setSelected] = useState<Room>();
  const [detailLoading, setDetailLoading] = useState(false);

  const [applyRoom, setApplyRoom] = useState<string>();
  const [message, setMessage] = useState("");

  const [join, joining] = useApiAction(async (id: string) => {
    try {
      return await roomsApi.join(id);
    } catch (e) {
      if (e instanceof ApiError && e.code === "BR19") {
        Modal.confirm({
          title: "Chưa đủ GPA để vào trực tiếp",
          content:
            "Phòng này yêu cầu GPA cao hơn mức hiện tại của bạn. Bạn có thể cập nhật hồ sơ hoặc gửi đơn nếu phòng đang ở trạng thái Đã khóa.",
          okText: "Cập nhật hồ sơ",
          cancelText: "Đóng",
          onOk: () => navigate("/student/profile"),
        });
        return undefined;
      }
      throw e;
    }
  });
  const [apply, applying] = useApiAction(roomsApi.apply, "Đã gửi đơn xin vào phòng");

  const selectRoom = useCallback(
    async (roomId: string, focusOnMobile = false) => {
      setSelectedId(roomId);
      setDetailLoading(true);
      try {
        const detail = await roomsApi.get(roomId);
        setSelected(detail);
        if (focusOnMobile && window.matchMedia("(max-width: 991.98px)").matches) {
          roomPreview.current?.focus();
        }
      } catch (e) {
        showError(e);
      } finally {
        setDetailLoading(false);
      }
    },
    [showError],
  );

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
        gpa: eligibleOnly ? (debouncedGpa ?? undefined) : undefined,
        roleIds,
      });
      setRooms(data.items);
      setTotal(data.totalItems);
      if (data.items.length === 0) {
        setSelectedId(undefined);
        setSelected(undefined);
      } else if (!selectedIdRef.current || !data.items.some((r) => r.id === selectedIdRef.current)) {
        void selectRoom(data.items[0].id, false);
      }
    } catch (e) {
      showError(e);
    } finally {
      setLoading(false);
    }
  }, [courseId, page, size, status, q, debouncedGpa, eligibleOnly, roleIds, showError, selectRoom]);

  const loadRecommendations = useCallback(async () => {
    setRecommendationsLoading(true);
    try {
      const results = await coursesApi.recommendations(courseId, 3);
      const details = await Promise.all(results.map((r) => roomsApi.get(r.roomId)));
      setRecommendedDetails(Object.fromEntries(details.map((r) => [r.id, r])));
      setRecommendations(results);
      setUnavailable(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 503 && e.code === "MATCHING_UNAVAILABLE") {
        setUnavailable(true);
      } else {
        showError(e);
      }
    } finally {
      setRecommendationsLoading(false);
    }
  }, [courseId, showError]);

  useEffect(() => {
    setRolesLoading(true);
    referenceApi
      .teamRoles()
      .then((r) => setRoles(r.items))
      .catch(showError)
      .finally(() => setRolesLoading(false));
    setReady(false);
    setCourse(undefined);
    setType(undefined);
    setMine(undefined);
    selectedIdRef.current = undefined;
    setSelectedId(undefined);
    setSelected(undefined);
    setRecommendations([]);
    setRecommendationsLoading(true);
    void loadBase();
    void loadRecommendations();
  }, [loadBase, loadRecommendations, showError]);

  useEffect(() => {
    void loadRooms();
  }, [loadRooms]);

  const canAct = ready && !!mine && !mine.myRoom && !mine.myGroup && course?.status === "Forming";
  const hasFilters = !!(q || status || roleIds.length > 0 || eligibleOnly);

  const resetFilters = () => {
    setSearchInput("");
    setQ("");
    setStatus(undefined);
    setRoleIds([]);
    setEligibleOnly(false);
    setGpa(student?.gpa ?? null);
    setPage(1);
  };

  const renderActions = (id: string, state: RoomStatus) => (
    <Space wrap>
      {canAct && state === "Open" && (
        <Button
          type="primary"
          loading={joining}
          onClick={async (e) => {
            e.stopPropagation();
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
          onClick={(e) => {
            e.stopPropagation();
            setMessage("");
            setApplyRoom(id);
          }}
        >
          Gửi đơn xin vào
        </Button>
      )}
      <Button
        onClick={(e) => {
          e.stopPropagation();
          navigate(`/student/rooms/${id}`);
        }}
      >
        Xem trang phòng
      </Button>
    </Space>
  );

  const isGpaInsufficient = (requiredGpa: number | null) =>
    requiredGpa != null && (student?.gpa == null || student.gpa < requiredGpa);

  return (
    <div className="workspace-page">
      {!ready && !course ? (
        <PageHeadingSkeleton hasBackLink hasSubtitle titleWidth={220} actionWidths={[120]} />
      ) : (
        <>
          <header className="workspace-heading">
            <div>
              <Link className="workspace-heading__back" to="/student/courses">
                <ArrowLeftOutlined aria-hidden="true" />
                Quay lại Học phần của tôi
              </Link>
              <Typography.Title level={1}>Tìm nhóm — {course?.code}</Typography.Title>
              <p>Chọn phòng để xem chi tiết thành viên, tiêu chí tuyển và tham gia ngay.</p>
            </div>
            {canAct && (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                Tạo nhóm mới
              </Button>
            )}
          </header>

          {course && (
            <div className="workspace-rule-strip">
              <span className="workspace-rule-strip__item">
                Loại nhóm: <strong>{course.groupTypeName}</strong>
              </span>
              <span className="workspace-rule-strip__item">
                Hạn ghép nhóm: <strong>{formatDateTime(course.deadline)}</strong>
              </span>
              {type && (
                <span className="workspace-rule-strip__item">
                  Quy định:{" "}
                  <strong>
                    {type.minMemberCount}–{type.maxMemberCount} thành viên · tối thiểu {type.minMajorCount}{" "}
                    ngành
                    {type.majors.map((m) => ` · ${m.majorCode}: ${m.minQuantity}–${m.maxQuantity}`)}
                  </strong>
                </span>
              )}
            </div>
          )}
        </>
      )}

      {mine?.myRoom && (
        <Alert
          type="info"
          message={
            <Space wrap>
              <span>
                Bạn đang ở phòng <strong>{mine.myRoom.name || mine.myRoom.code}</strong> ({mine.myRoom.code}).
                Rời phòng hiện tại nếu muốn chuyển sang phòng khác.
              </span>
              <Button
                size="small"
                type="primary"
                onClick={() => navigate(`/student/rooms/${mine.myRoom!.id}`)}
              >
                Về phòng của tôi
              </Button>
            </Space>
          }
        />
      )}

      {mine?.myGroup && (
        <Alert
          type="success"
          message={
            <Space wrap>
              <span>
                Bạn đã có nhóm chính thức <strong>{mine.myGroup.name || mine.myGroup.code}</strong>.
              </span>
              <Button
                size="small"
                type="primary"
                onClick={() => navigate(`/student/groups/${mine.myGroup!.id}`)}
              >
                Xem nhóm
              </Button>
            </Space>
          }
        />
      )}

      <CreateRoomModal open={createOpen} course={mine} onClose={() => setCreateOpen(false)} />

      {/* Gợi ý phù hợp cho bạn */}
      {canAct && (
        <>
          {unavailable && <Alert type="warning" message="Dịch vụ gợi ý phòng tạm thời không phản hồi." />}
          {!recommendationsLoading && recommendations.length > 0 && (
            <Card size="small" title="Gợi ý phòng phù hợp với ngành của bạn" style={{ marginBottom: 16 }}>
              <div className="workspace-rec-grid">
                {recommendations.map((r) => {
                  const detail = recommendedDetails[r.roomId];
                  const roomStatus = detail?.status;
                  return (
                    <div
                      key={r.roomId}
                      className="workspace-rec-card"
                      data-selected={selectedId === r.roomId}
                      role="button"
                      tabIndex={0}
                      onClick={() => void selectRoom(r.roomId, true)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          void selectRoom(r.roomId, true);
                        }
                      }}
                    >
                      <div>
                        <div className="workspace-rec-card__head">
                          <strong>{detail?.name || r.roomCode}</strong>
                          {roomStatus && <RoomStatusTag status={roomStatus} />}
                        </div>
                        <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>{r.roomCode}</div>
                        <div className="workspace-rec-card__reasons" style={{ marginTop: 6 }}>
                          {r.reasons.join(" · ")}
                        </div>
                      </div>
                      {roomStatus && renderActions(r.roomId, roomStatus)}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </>
      )}

      {/* Thanh bộ lọc ngang gọn gàng */}
      <Card className="workspace-filter-bar" size="small">
        <div className="workspace-filter-grid">
          <div className="workspace-filter-item">
            <label htmlFor="room-search">Tìm kiếm phòng</label>
            <Input
              id="room-search"
              prefix={<SearchOutlined />}
              placeholder="Tên nhóm, dự án hoặc mã phòng..."
              allowClear
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onPressEnter={() => {
                setQ(searchInput.trim());
                setPage(1);
              }}
            />
          </div>

          <div className="workspace-filter-item">
            <label htmlFor="room-filter-roles">Vai trò đang tuyển</label>
            <Select
              id="room-filter-roles"
              mode="multiple"
              maxTagCount="responsive"
              loading={rolesLoading}
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

          <div className="workspace-filter-item">
            <label htmlFor="room-filter-status">Trạng thái phòng</label>
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

          <div className="workspace-filter-item">
            <label htmlFor="room-filter-gpa">Lọc theo mức GPA</label>
            <div className="workspace-gpa-filter">
              <div className="workspace-gpa-filter__toggle">
                <Switch
                  aria-label="Chỉ hiện phòng tôi đủ GPA vào thẳng"
                  checked={eligibleOnly}
                  disabled={gpa == null}
                  onChange={(v) => {
                    setEligibleOnly(v);
                    setPage(1);
                  }}
                />
                <span>Chỉ phòng đủ GPA</span>
              </div>
              <InputNumber<number>
                id="room-filter-gpa"
                min={0}
                max={4}
                step={0.01}
                precision={2}
                disabled={!eligibleOnly}
                placeholder={student?.gpa != null ? formatDecimal(student.gpa) : "Tối đa 4.00"}
                value={gpa}
                onChange={(v) => {
                  setGpa(v);
                  if (eligibleOnly) setPage(1);
                }}
                style={{ width: 105 }}
              />
            </div>
          </div>
        </div>

        {hasFilters && (
          <div
            style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}
          >
            <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
              Đang lọc danh sách ({total} kết quả)
            </Typography.Text>
            <Button size="small" type="link" onClick={resetFilters}>
              Xóa bộ lọc
            </Button>
          </div>
        )}
      </Card>

      {/* Bố cục hai cột: danh sách cuộn theo trang, cột chi tiết neo bên phải */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={10}>
          {loading ? (
            <RoomListSkeleton />
          ) : rooms.length === 0 ? (
            <Card>
              <EmptyState
                title="Không tìm thấy phòng phù hợp"
                description={
                  hasFilters
                    ? "Hãy thử nới lỏng điều kiện lọc hoặc xóa bộ lọc để xem toàn bộ phòng."
                    : "Chưa có phòng nào được tạo trong học phần này."
                }
                action={
                  hasFilters ? (
                    <Button onClick={resetFilters}>Xóa bộ lọc</Button>
                  ) : canAct ? (
                    <Button type="primary" onClick={() => setCreateOpen(true)}>
                      Tạo nhóm đầu tiên
                    </Button>
                  ) : undefined
                }
              />
            </Card>
          ) : (
            <div className="workspace-room-list">
              {rooms.map((r) => {
                const isRecruiting =
                  (r.status === "Open" || r.status === "Locked") && r.neededRoles.length > 0;
                const gpaWarning = isGpaInsufficient(r.requiredGpa);
                return (
                  <Card
                    key={r.id}
                    hoverable
                    size="small"
                    className="workspace-room-card"
                    data-selected={selectedId === r.id}
                    onClick={() => void selectRoom(r.id, true)}
                  >
                    <div className="workspace-room-card__head">
                      <Button
                        type="link"
                        className="workspace-room-card__title-btn"
                        aria-controls="room-preview"
                        aria-pressed={selectedId === r.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          void selectRoom(r.id, true);
                        }}
                      >
                        {r.name || r.code}
                      </Button>
                      <Space size={4} wrap>
                        <RoomStatusTag status={r.status} />
                        {isRecruiting && <Tag color="orange">Đang tuyển</Tag>}
                      </Space>
                    </div>

                    <div className="workspace-room-card__sub">
                      {r.code}
                      {r.projectName ? ` · Dự án: ${r.projectName}` : ""}
                    </div>

                    <div className="workspace-room-card__meta">
                      <span>Trưởng phòng: {r.leaderName}</span>
                      <span>
                        Thành viên: {r.memberCount}/{type?.maxMemberCount ?? "—"}
                      </span>
                      <span>
                        GPA yêu cầu: {r.requiredGpa != null ? formatDecimal(r.requiredGpa) : "Không yêu cầu"}
                      </span>
                    </div>

                    {gpaWarning && canAct && (
                      <div style={{ marginTop: 6 }}>
                        <Tag color="warning">
                          GPA của bạn chưa đạt mức yêu cầu ({formatDecimal(r.requiredGpa)})
                        </Tag>
                      </div>
                    )}

                    <div className="workspace-room-card__tags">
                      {r.neededRoles.length > 0 ? (
                        r.neededRoles.map((role) => (
                          <Tag key={role.id} color="default">
                            Tuyển: {role.name}
                          </Tag>
                        ))
                      ) : (
                        <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
                          Chưa ghi nhận vai trò cần tuyển
                        </Typography.Text>
                      )}
                      {r.majors.length > 0 && <MajorCounts majors={r.majors} />}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {total > 0 && (
            <Pagination
              style={{ marginTop: 16 }}
              current={page}
              pageSize={size}
              total={total}
              showSizeChanger
              disabled={loading}
              onChange={(p, s) => {
                setPage(p);
                setSize(s);
              }}
            />
          )}
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
              {detailLoading ? (
                <RoomPreviewSkeleton />
              ) : selected ? (
                <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      flexWrap: "wrap",
                      gap: 12,
                    }}
                  >
                    <div>
                      <Space align="center" wrap>
                        <Typography.Title level={2}>{selected.name || selected.code}</Typography.Title>
                        <RoomStatusTag status={selected.status} />
                      </Space>
                      <Typography.Text type="secondary" style={{ display: "block", marginTop: 4 }}>
                        {selected.code} · {selected.memberCount}/{type?.maxMemberCount ?? "—"} thành viên
                      </Typography.Text>
                    </div>
                    {renderActions(selected.id, selected.status)}
                  </div>

                  {canAct && selected.status === "Open" && isGpaInsufficient(selected.requiredGpa) && (
                    <Alert
                      type="warning"
                      message={`Phòng yêu cầu GPA tối thiểu ${formatDecimal(selected.requiredGpa)}`}
                      description={
                        student?.gpa == null
                          ? "Hồ sơ của bạn chưa có GPA nên chưa thể vào trực tiếp phòng này. Hãy cập nhật hồ sơ trước."
                          : `GPA hiện tại của bạn (${formatDecimal(student.gpa)}) thấp hơn yêu cầu nên chưa thể vào trực tiếp.`
                      }
                    />
                  )}

                  {canAct && selected.status === "Locked" && (
                    <Alert
                      type="info"
                      message="Phòng đang ở trạng thái Đã khóa"
                      description="Bạn cần gửi đơn kèm lời nhắn để trưởng phòng xem xét duyệt vào phòng."
                    />
                  )}

                  <dl className="workspace-facts">
                    <div className="workspace-fact">
                      <dt>Dự án</dt>
                      <dd>{selected.projectName || "Chưa có"}</dd>
                    </div>
                    <div className="workspace-fact">
                      <dt>GPA yêu cầu</dt>
                      <dd>
                        {selected.requiredGpa != null ? formatDecimal(selected.requiredGpa) : "Không yêu cầu"}
                      </dd>
                    </div>
                    <div className="workspace-fact">
                      <dt>Điểm mục tiêu</dt>
                      <dd>
                        {selected.targetGrade != null ? formatDecimal(selected.targetGrade) : "Chưa đặt"}
                      </dd>
                    </div>
                    <div className="workspace-fact">
                      <dt>Trưởng phòng</dt>
                      <dd>{selected.leaderName}</dd>
                    </div>
                  </dl>

                  <div>
                    <strong>Mô tả ý tưởng</strong>
                    <div className="workspace-room-description">
                      {selected.ideaDescription || "Chưa có mô tả ý tưởng."}
                    </div>
                  </div>

                  <div>
                    <strong>Vai trò đang tuyển: </strong>
                    {selected.neededRoles.length
                      ? selected.neededRoles.map((r) => <Tag key={r.id}>{r.name}</Tag>)
                      : "Chưa tuyển thêm"}
                  </div>

                  <div>
                    <strong>Phân bố ngành: </strong>
                    <MajorCounts majors={selected.majors} />
                  </div>

                  <div>
                    <strong style={{ display: "block", marginBottom: 8 }}>
                      Thành viên hiện tại ({selected.members.length})
                    </strong>
                    <Table
                      size="small"
                      rowKey="studentId"
                      pagination={false}
                      scroll={{ x: 500 }}
                      locale={{ emptyText: <EmptyState title="Chưa có thành viên" /> }}
                      dataSource={selected.members}
                      columns={[
                        {
                          title: "Họ tên",
                          render: (_, m) => (
                            <Space size={6} wrap>
                              <span>{m.fullName}</span>
                              {m.isLeader && <Tag color="orange">Trưởng phòng</Tag>}
                            </Space>
                          ),
                        },
                        { title: "Mã SV", dataIndex: "studentCode" },
                        { title: "Ngành", dataIndex: "majorCode" },
                        { title: "GPA", render: (_, m) => formatDecimal(m.gpa) },
                        {
                          title: "Vai trò",
                          render: (_, m) =>
                            m.roles.length ? m.roles.map((r) => <Tag key={r.id}>{r.name}</Tag>) : "—",
                        },
                      ]}
                    />
                  </div>
                </Space>
              ) : (
                <EmptyState
                  title="Chọn một phòng để xem chi tiết"
                  description="Bấm vào một phòng ở danh sách bên trái hoặc trong mục gợi ý để xem thành viên và thông tin tuyển."
                />
              )}
            </Card>
          </section>
        </Col>
      </Row>

      <Modal
        title="Gửi đơn xin vào phòng"
        open={!!applyRoom}
        confirmLoading={applying}
        destroyOnHidden
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
        <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
          Hãy giới thiệu ngắn gọn kỹ năng, vai trò bạn muốn đảm nhận và lý do muốn tham gia phòng.
        </Typography.Paragraph>
        <Input.TextArea
          maxLength={500}
          showCount
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          aria-label="Lời nhắn gửi trưởng phòng"
          placeholder="Nhập lời nhắn gửi trưởng phòng..."
        />
      </Modal>
    </div>
  );
}
