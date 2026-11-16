import "@/features/workspace.css";
import { useEffect, useState } from "react";
import { Col, Form, Input, InputNumber, Modal, Row, Select } from "antd";
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
  const semesterId = Form.useWatch("semesterId", form);
  const navigate = useNavigate();
  const showError = useShowError();
  const [create, creating] = useApiAction(coursesApi.createRoom, "Đã tạo nhóm");
  const [update, updating] = useApiAction(roomsApi.updateProfile, "Đã lưu thông tin tuyển");
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(
      room
        ? { ...room, neededRoleIds: room.neededRoles.map((r) => r.id) }
        : { semesterId: course?.semesterId, courseId: course?.id, neededRoleIds: [] },
    );
    Promise.all([
      referenceApi.teamRoles(),
      referenceApi.semesters(),
      room ? Promise.resolve([]) : loadAllMyCourses(),
    ])
      .then(([r, s, c]) => {
        setRoles(r.items);
        setSemesters(s.items);
        setCourses(c);
      })
      .catch(showError);
  }, [open, course, room, form, showError]);
  const eligible = courses.filter((c) => c.status === "Forming" && !c.myRoom && !c.myGroup);
  return (
    <Modal
      title={room ? "Sửa thông tin tuyển" : "Tạo nhóm"}
      open={open}
      className="workspace-room-form"
      width={640}
      onCancel={onClose}
      okText={room ? "Lưu thay đổi" : "Lưu nhóm"}
      cancelText="Hủy"
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
      <p>Thiết lập hồ sơ nhóm và định hướng dự án</p>
      <Form form={form} layout="vertical">
        {!room && (
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="semesterId" label="Kỳ" rules={[{ required: true }]}>
                <Select
                  disabled={!!course}
                  placeholder="Chọn kỳ"
                  options={semesters
                    .filter((s) => eligible.some((c) => c.semesterId === s.id))
                    .map((s) => ({ value: s.id, label: s.code }))}
                  onChange={() => form.setFieldValue("courseId", undefined)}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="courseId" label="Course" rules={[{ required: true }]}>
                <Select
                  disabled={!!course}
                  placeholder="Chọn Course"
                  options={eligible
                    .filter((c) => c.semesterId === semesterId)
                    .map((c) => ({ value: c.id, label: c.code }))}
                />
              </Form.Item>
            </Col>
          </Row>
        )}
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item name="name" label="Tên nhóm">
              <Input maxLength={100} placeholder="F-Spark Team" />
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
            <Form.Item name="requiredGpa" label="GPA yêu cầu">
              <InputNumber
                min={0}
                max={4}
                step={0.01}
                precision={2}
                placeholder="2.5"
                style={{ width: "100%" }}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="targetGrade" label="Điểm mục tiêu">
              <InputNumber
                min={0}
                max={10}
                step={0.1}
                precision={2}
                placeholder="8.0"
                style={{ width: "100%" }}
              />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="neededRoleIds" label="Vai trò cần tuyển">
          <Select mode="multiple" maxCount={5} options={roles.map((r) => ({ value: r.id, label: r.name }))} />
        </Form.Item>
        <Form.Item name="ideaDescription" label="Mô tả ý tưởng">
          <Input.TextArea
            maxLength={1000}
            showCount
            autoSize={{ minRows: 3, maxRows: 6 }}
            placeholder="Mô tả ngắn ý tưởng dự án"
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
