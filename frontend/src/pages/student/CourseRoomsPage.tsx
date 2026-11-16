import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Empty,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Spin,
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
  RoomRecommendation,
  RoomStatus,
  RoomSummary,
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
  const [sortBy, setSortBy] = useState<string>();
  const [sortDir, setSortDir] = useState<"asc" | "desc">();
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
        sortBy,
        sortDir,
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
  }, [courseId, page, size, status, q, sortBy, sortDir, gpa, eligibleOnly, roleIds, showError]);
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
      <Link to={`/student/rooms/${id}`}>Xem</Link>
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
  return (
    <Spin spinning={!ready && !course}>
      <Typography.Title level={2}>Phòng trong Course {course?.code}</Typography.Title>
      {course && (
        <Card>
          <p>Loại nhóm: {course.groupTypeName}</p>
          <p>Hạn ghép nhóm: {formatDateTime(course.deadline)}</p>
          {type && (
            <p>
              {type.minMemberCount}–{type.maxMemberCount} thành viên · tối thiểu {type.minMajorCount} ngành
              {type.majors.map((m) => ` · ${m.majorCode}: ${m.minQuantity}–${m.maxQuantity}`)}
            </p>
          )}
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
      {canAct && (
        <Button type="primary" style={{ margin: "16px 0" }} onClick={() => setCreateOpen(true)}>
          + Tạo nhóm
        </Button>
      )}
      <CreateRoomModal open={createOpen} course={mine} onClose={() => setCreateOpen(false)} />
      {unavailable && <Alert type="warning" message="Dịch vụ gợi ý tạm thời không phản hồi" />}
      {recommendations.length > 0 && (
        <Card title="Gợi ý cho bạn" style={{ margin: "16px 0" }}>
          <Space direction="vertical">
            {recommendations.map((r) => {
              return (
                <div key={r.roomId}>
                  <strong>{r.roomCode}</strong> · Điểm: {r.score} · {r.reasons.join(", ")}{" "}
                  {actions(r.roomId, recommendedRooms[r.roomId])}
                </div>
              );
            })}
          </Space>
        </Card>
      )}
      <Typography.Title level={3}>Danh sách phòng</Typography.Title>
      <Space wrap>
        <Input.Search
          placeholder="Tìm tên nhóm, dự án, mã phòng"
          allowClear
          onSearch={(v) => {
            setQ(v);
            setPage(1);
          }}
        />
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
          placeholder="GPA của bạn (tối đa 4)"
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
        <Select
          mode="multiple"
          placeholder="Tất cả vai trò"
          style={{ minWidth: 200 }}
          value={roleIds}
          options={roles.map((r) => ({ value: r.id, label: r.name }))}
          onChange={(v) => {
            setRoleIds(v);
            setPage(1);
          }}
        />
        <Select
          allowClear
          placeholder="Trạng thái"
          style={{ width: 180 }}
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
      <Table
        rowKey="id"
        loading={loading}
        dataSource={rooms}
        locale={{ emptyText: <Empty description="Không có phòng" /> }}
        pagination={{ current: page, pageSize: size, total, showSizeChanger: true }}
        onChange={(p, _f, sorter) => {
          setPage(p.current ?? 1);
          setSize(p.pageSize ?? 20);
          const s = Array.isArray(sorter) ? sorter[0] : sorter;
          setSortBy(s.order ? String(s.field) : undefined);
          setSortDir(s.order === "ascend" ? "asc" : s.order === "descend" ? "desc" : undefined);
        }}
        columns={[
          { title: "Tên nhóm", render: (_, r) => r.name || r.code },
          { title: "Mã phòng", dataIndex: "code", sorter: true },
          { title: "Dự án", render: (_, r) => r.projectName || "—" },
          { title: "GPA yêu cầu", render: (_, r) => r.requiredGpa ?? "—" },
          { title: "Điểm mục tiêu", render: (_, r) => r.targetGrade ?? "—" },
          {
            title: "Vai trò cần tuyển",
            render: (_, r) =>
              r.neededRoles.length
                ? r.neededRoles.map((role) => <Tag key={role.id}>{role.name}</Tag>)
                : "Chưa tuyển thêm",
          },
          { title: "Trạng thái", render: (_, r) => <RoomStatusTag status={r.status} /> },
          {
            title: "Số người",
            dataIndex: "memberCount",
            sorter: true,
            render: (n: number) => `${n} / ${type?.maxMemberCount ?? "—"}`,
          },
          { title: "Ngành", render: (_, r) => <MajorCounts majors={r.majors} /> },
          { title: "Trưởng phòng", dataIndex: "leaderName" },
          {
            title: "Ngày tạo",
            dataIndex: "createdAt",
            sorter: true,
            render: (v: string) => formatDateTime(v),
          },
          { title: "Thao tác", render: (_, r) => actions(r.id, r.status) },
        ]}
      />
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
          placeholder="Lời nhắn"
        />
      </Modal>
    </Spin>
  );
}
