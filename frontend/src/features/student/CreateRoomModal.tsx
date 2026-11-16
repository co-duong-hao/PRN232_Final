import "@/features/workspace.css";
import { useEffect, useState } from "react";
import { Alert, Col, Form, Input, InputNumber, Modal, Row, Select } from "antd";
import { useNavigate } from "react-router-dom";
import { coursesApi, referenceApi, roomsApi } from "@/api";
import type { Lookup, MyCourse, Room, RoomProfileRequest, TeamRole } from "@/api";
import { useApiAction, useShowError } from "@/components/useApiAction";
import { useI18n } from "@/i18n";
import { loadAllMyCourses } from "./loadMyCourses";

type Props = { open: boolean; onClose: () => void; course?: MyCourse; room?: Room; onSaved?: () => void };

export function CreateRoomModal({ open, onClose, course, room, onSaved }: Props) {
  const { t, language } = useI18n();
  const [form] = Form.useForm<RoomProfileRequest & { semesterId: string; courseId: string }>();
  const [courses, setCourses] = useState<MyCourse[]>([]);
  const [semesters, setSemesters] = useState<Lookup[]>([]);
  const [roles, setRoles] = useState<TeamRole[]>([]);
  const [loaded, setLoaded] = useState(false);
  const semesterId = Form.useWatch("semesterId", form);
  const navigate = useNavigate();
  const showError = useShowError();
  const [create, creating] = useApiAction(coursesApi.createRoom, t.createRoom.successCreate);
  const [update, updating] = useApiAction(roomsApi.updateProfile, t.createRoom.successUpdate);

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
      title={room ? t.createRoom.titleUpdate : t.createRoom.titleCreate}
      open={open}
      className="workspace-room-form"
      width={660}
      destroyOnHidden
      onCancel={onClose}
      okText={room ? t.createRoom.btnSave : t.createRoom.btnCreate}
      cancelText={t.common.cancel}
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
          ? language === "en"
            ? "Edit room name, project, GPA requirement, and needed roles."
            : "Chỉnh sửa tên nhóm, dự án, yêu cầu GPA và vai trò đang cần tuyển."
          : language === "en"
            ? "Set up room profile and member requirements for active team matching."
            : "Thiết lập hồ sơ nhóm và yêu cầu thành viên cho học phần đang mở ghép nhóm."}
      </p>

      {noEligibleCourse && (
        <Alert
          type="info"
          message={
            language === "en" ? "No eligible courses available" : "Không có học phần khả dụng để tạo nhóm"
          }
          description={t.createRoom.noEligibleCourseAlert}
          style={{ marginBottom: 16 }}
        />
      )}

      <Form form={form} layout="vertical" disabled={noEligibleCourse}>
        {!room && (
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="semesterId"
                label={t.createRoom.semesterLabel}
                rules={[{ required: true, message: t.createRoom.semesterRequired }]}
              >
                <Select
                  disabled={!!course}
                  placeholder={t.createRoom.semesterPlaceholder}
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
                label={t.createRoom.courseLabel}
                rules={[{ required: true, message: t.createRoom.courseRequired }]}
              >
                <Select
                  disabled={!!course}
                  placeholder={t.createRoom.coursePlaceholder}
                  options={coursesInSemester.map((c) => ({ value: c.id, label: c.code }))}
                />
              </Form.Item>
            </Col>
          </Row>
        )}
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item name="name" label={t.createRoom.nameLabel}>
              <Input maxLength={100} placeholder={t.createRoom.namePlaceholder} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="projectName" label={t.createRoom.projectNameLabel}>
              <Input maxLength={200} placeholder={t.createRoom.projectNamePlaceholder} />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item
              name="requiredGpa"
              label={t.createRoom.requiredGpaLabel}
              extra={t.createRoom.requiredGpaHelp}
            >
              <InputNumber<number>
                min={0}
                max={4}
                step={0.01}
                precision={2}
                placeholder={t.createRoom.requiredGpaPlaceholder}
                style={{ width: "100%" }}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="targetGrade" label={t.createRoom.targetGradeLabel}>
              <InputNumber<number>
                min={0}
                max={10}
                step={0.1}
                precision={2}
                placeholder={t.createRoom.targetGradePlaceholder}
                style={{ width: "100%" }}
              />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="neededRoleIds" label={t.createRoom.neededRolesLabel}>
          <Select
            mode="multiple"
            maxCount={5}
            placeholder={t.createRoom.neededRolesPlaceholder}
            optionFilterProp="label"
            options={roles.map((r) => ({ value: r.id, label: r.name }))}
          />
        </Form.Item>
        <Form.Item name="ideaDescription" label={t.createRoom.ideaDescLabel}>
          <Input.TextArea
            maxLength={1000}
            showCount
            autoSize={{ minRows: 3, maxRows: 6 }}
            placeholder={t.createRoom.ideaDescPlaceholder}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
