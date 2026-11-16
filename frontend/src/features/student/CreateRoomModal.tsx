import "@/features/workspace.css";
import { useEffect, useState } from "react";
import { Alert, Col, Form, Input, InputNumber, Modal, Row, Select } from "antd";
import { useNavigate } from "react-router-dom";
import { coursesApi, referenceApi, roomsApi } from "@/api";
import type { Lookup, MyCourse, Room, RoomProfileRequest, TeamRole } from "@/api";
import { useApiAction, useShowError } from "@/components/useApiAction";
import { loadAllMyCourses } from "./loadMyCourses";

type Props = { open: boolean; onClose: () => void; course?: MyCourse; room?: Room; onSaved?: () => void };

export function CreateRoomModal({ open, onClose, course, room, onSaved }: Props) {
  const [form] = Form.useForm<RoomProfileRequest & { semesterId: string; courseId: string }>();
  const [courses, setCourses] = useState<MyCourse[]>([]);
  const [semesters, setSemesters] = useState<Lookup[]>([]);
  const [roles, setRoles] = useState<TeamRole[]>([]);
  const [loaded, setLoaded] = useState(false);
  const semesterId = Form.useWatch("semesterId", form);
  const navigate = useNavigate();
  const showError = useShowError();
  const [create, creating] = useApiAction(coursesApi.createRoom, "Đã tạo nhóm mới");
  const [update, updating] = useApiAction(roomsApi.updateProfile, "Đã cập nhật thông tin tuyển");

  useEffect(() => {
    if (!open) return;
    setLoaded(false);
    form.resetFields();
    if (room) {
      form.setFieldsValue({
        name: room.name ?? undefined,
        projectName: room.projectName ?? undefined,
        ideaDescription: room.ideaDescription ?? undefined,
        requiredGpa: room.requiredGpa ?? undefined,
        targetGrade: room.targetGrade ?? undefined,
        neededRoleIds: room.neededRoles.map((r) => r.id),
      });
    } else {
      form.setFieldsValue({
        semesterId: course?.semesterId,
        courseId: course?.id,
        neededRoleIds: [],
      });
    }

    Promise.all([
      referenceApi.teamRoles(),
      referenceApi.semesters(),
      room ? Promise.resolve([]) : loadAllMyCourses(),
    ])
      .then(([r, s, c]) => {
        setRoles(r.items);
        setSemesters(s.items);
        setCourses(c);

        if (!room && !course) {
          const available = c.filter((item) => item.status === "Forming" && !item.myRoom && !item.myGroup);
          const eligibleSemesters = s.items.filter((sem) =>
            available.some((item) => item.semesterId === sem.id),
          );
          if (eligibleSemesters.length === 1) {
            const onlySem = eligibleSemesters[0];
            form.setFieldValue("semesterId", onlySem.id);
            const semCourses = available.filter((item) => item.semesterId === onlySem.id);
            if (semCourses.length === 1) {
              form.setFieldValue("courseId", semCourses[0].id);
            }
          }
        }
        setLoaded(true);
      })
      .catch((e) => {
        setLoaded(true);
        showError(e);
      });
  }, [open, course, room, form, showError]);

  const eligible = courses.filter((c) => c.status === "Forming" && !c.myRoom && !c.myGroup);
  const eligibleSemesters = semesters.filter((s) => eligible.some((c) => c.semesterId === s.id));
  const coursesInSemester = eligible.filter((c) => c.semesterId === semesterId);
  const noEligibleCourse = !room && !course && loaded && eligible.length === 0;

  return (
    <Modal
      title={room ? "Cập nhật thông tin tuyển" : "Tạo nhóm mới"}
      open={open}
      className="workspace-room-form"
      width={660}
      destroyOnHidden
      onCancel={onClose}
      okText={room ? "Lưu thay đổi" : "Tạo nhóm"}
      cancelText="Hủy"
      okButtonProps={{ disabled: noEligibleCourse }}
      confirmLoading={creating || updating}
      onOk={() =>
        void form
          .validateFields()
          .then(async ({ semesterId: _semesterId, courseId, ...body }) => {
            if (room) {
              if (await update(room.id, body)) {
                onClose();
                onSaved?.();
              }
            } else {
              const result = await create(courseId, body);
              if (result) {
                onClose();
                navigate(`/student/rooms/${result.id}`);
              }
            }
          })
          .catch(() => {})
      }
    >
      <p className="workspace-room-form__subtitle">
        {room
          ? "Chỉnh sửa tên nhóm, dự án, yêu cầu GPA và vai trò đang cần tuyển."
          : "Thiết lập hồ sơ nhóm và yêu cầu thành viên cho học phần đang mở ghép nhóm."}
      </p>

      {noEligibleCourse && (
        <Alert
          type="info"
          message="Không có học phần khả dụng để tạo nhóm"
          description="Bạn đã tham gia phòng hoặc nhóm ở tất cả học phần đang mở, hoặc hiện chưa có học phần nào mở ghép nhóm."
          style={{ marginBottom: 16 }}
        />
      )}

      <Form form={form} layout="vertical" disabled={noEligibleCourse}>
        {!room && (
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="semesterId"
                label="Học kỳ"
                rules={[{ required: true, message: "Vui lòng chọn học kỳ" }]}
              >
                <Select
                  disabled={!!course}
                  placeholder="Chọn học kỳ"
                  options={eligibleSemesters.map((s) => ({ value: s.id, label: `${s.code} - ${s.name}` }))}
                  onChange={(nextSemester) => {
                    const nextCourses = eligible.filter((c) => c.semesterId === nextSemester);
                    form.setFieldValue("courseId", nextCourses.length === 1 ? nextCourses[0].id : undefined);
                  }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="courseId"
                label="Học phần"
                rules={[{ required: true, message: "Vui lòng chọn học phần" }]}
              >
                <Select
                  disabled={!!course}
                  placeholder="Chọn học phần"
                  options={coursesInSemester.map((c) => ({ value: c.id, label: c.code }))}
                />
              </Form.Item>
            </Col>
          </Row>
        )}
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item name="name" label="Tên nhóm">
              <Input maxLength={100} placeholder="Ví dụ: Nhóm Khởi nghiệp 01" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="projectName" label="Tên dự án">
              <Input maxLength={200} placeholder="Không bắt buộc" />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item
              name="requiredGpa"
              label="GPA yêu cầu (thang 4.00)"
              extra="Sinh viên có GPA thấp hơn mức này cần gửi đơn để trưởng phòng duyệt."
            >
              <InputNumber<number>
                min={0}
                max={4}
                step={0.01}
                precision={2}
                placeholder="Ví dụ: 2.50 (bỏ trống nếu không yêu cầu)"
                style={{ width: "100%" }}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="targetGrade" label="Điểm mục tiêu (thang 10.00)">
              <InputNumber<number>
                min={0}
                max={10}
                step={0.1}
                precision={2}
                placeholder="Ví dụ: 8.00"
                style={{ width: "100%" }}
              />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="neededRoleIds" label="Vai trò cần tuyển (tối đa 5)">
          <Select
            mode="multiple"
            maxCount={5}
            placeholder="Chọn các vai trò nhóm đang thiếu"
            optionFilterProp="label"
            options={roles.map((r) => ({ value: r.id, label: r.name }))}
          />
        </Form.Item>
        <Form.Item name="ideaDescription" label="Mô tả ý tưởng">
          <Input.TextArea
            maxLength={1000}
            showCount
            autoSize={{ minRows: 3, maxRows: 6 }}
            placeholder="Mô tả ngắn gọn ý tưởng dự án, công nghệ dự kiến hoặc tiêu chí tìm bạn đồng hành"
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
