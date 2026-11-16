import { Button, DatePicker, Form, Modal, Popconfirm, Select, Space } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useState } from "react";
import { coursesApi, referenceApi, type Course } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import { useApiAction } from "@/components/useApiAction";
import { useI18n } from "@/i18n";
import { StaffLoadError } from "./StaffLoadError";
import { useStaffQuery } from "./useStaffQuery";

type Values = {
  semesterId: string;
  subjectId: string;
  groupTypeId: string;
  startTime: Dayjs;
  deadline: Dayjs;
};

export function CourseActions({
  course,
  onChanged,
  allowDelete = true,
}: {
  course?: Course;
  onChanged: () => void;
  allowDelete?: boolean;
}) {
  const { hasRole } = useAuth();
  const { t, language } = useI18n();
  const [visible, setVisible] = useState(false);
  const [form] = Form.useForm<Values>();
  const canChangeGroupType = !course || course.status === "Planned";
  const semesters = useStaffQuery(visible && !course ? referenceApi.semesters : null);
  const subjects = useStaffQuery(visible && !course ? referenceApi.subjects : null);
  const types = useStaffQuery(visible && canChangeGroupType ? referenceApi.groupTypes : null);
  const lookups = [
    { label: language === "vi" ? "học kỳ" : "semester", ...semesters },
    { label: language === "vi" ? "môn học" : "subject", ...subjects },
    { label: language === "vi" ? "loại nhóm" : "group type", ...types },
  ];
  const lookupsUnavailable = lookups.some((lookup) => lookup.loading || lookup.failure);
  const typeOptions = types.data?.items.map(({ id, name }) => ({ value: id, label: name })) ?? [];
  if (course && !typeOptions.some(({ value }) => value === course.groupTypeId)) {
    typeOptions.unshift({ value: course.groupTypeId, label: course.groupTypeName });
  }

  const [save, saving] = useApiAction(async (v: Values) => {
    const dates = {
      groupTypeId: v.groupTypeId,
      startTime: v.startTime.toISOString(),
      deadline: v.deadline.toISOString(),
    };
    return course
      ? coursesApi.update(course.id, dates)
      : coursesApi.create({ ...dates, semesterId: v.semesterId, subjectId: v.subjectId });
  }, t.courseActions.successSaved);

  const [open, opening] = useApiAction(() => coursesApi.open(course!.id), t.courseActions.successOpened);
  const [close, closing] = useApiAction(() => coursesApi.close(course!.id), t.courseActions.successClosed);
  const [remove, removing] = useApiAction(async () => {
    await coursesApi.remove(course!.id);
    return true;
  }, t.courseActions.successDeleted);

  const actionPending = saving || opening || closing || removing;

  const show = () => {
    form.resetFields();
    if (course) {
      form.setFieldsValue({
        groupTypeId: course.groupTypeId,
        startTime: dayjs(course.startTime),
        deadline: dayjs(course.deadline),
      });
    }
    setVisible(true);
  };

  return (
    <>
      <Space wrap>
        {!course && hasRole("Admin") && (
          <Button type="primary" onClick={show} disabled={actionPending}>
            {t.courseActions.btnCreateCourse}
          </Button>
        )}
        {course && hasRole("Admin", "HeadOfDepartment") && (
          <>
            {course.status === "Planned" && (
              <Button
                type="primary"
                loading={opening}
                disabled={actionPending}
                onClick={async () => {
                  if (await open()) onChanged();
                }}
              >
                {t.courseActions.btnOpenMatching}
              </Button>
            )}
            {course.status === "Forming" && (
              <Popconfirm
                title={t.courseActions.popconfirmCloseTitle}
                disabled={actionPending}
                okText={t.courseActions.popconfirmCloseOk}
                cancelText={t.common.cancel}
                onConfirm={async () => {
                  if (await close()) onChanged();
                }}
              >
                <Button loading={closing} disabled={actionPending}>
                  {t.courseActions.btnCloseMatching}
                </Button>
              </Popconfirm>
            )}
            <Button onClick={show} disabled={actionPending}>
              {t.courseActions.btnEdit}
            </Button>
            {allowDelete && course.status === "Planned" && hasRole("Admin") && (
              <Popconfirm
                title={t.courseActions.popconfirmDeleteTitle}
                disabled={actionPending}
                okText={t.courseActions.popconfirmDeleteOk}
                cancelText={t.common.cancel}
                onConfirm={async () => {
                  if (await remove()) onChanged();
                }}
              >
                <Button danger loading={removing} disabled={actionPending}>
                  {t.courseActions.btnDelete}
                </Button>
              </Popconfirm>
            )}
          </>
        )}
      </Space>

      <Modal
        title={course ? t.courseActions.modalEditTitle : t.courseActions.modalCreateTitle}
        open={visible}
        onCancel={() => {
          if (!saving) setVisible(false);
        }}
        closable={!saving}
        keyboard={!saving}
        maskClosable={!saving}
        cancelButtonProps={{ disabled: saving }}
        confirmLoading={saving}
        okText={course ? t.common.saveChanges : t.courseActions.btnCreateCourse}
        cancelText={t.common.cancel}
        onOk={() => form.submit()}
        okButtonProps={{ disabled: lookupsUnavailable || actionPending }}
        destroyOnHidden
      >
        {lookups.map(({ label, failure, reload }) =>
          failure ? (
            <StaffLoadError
              key={label}
              title={(language === "vi" ? "Không tải được " : "Failed to load ") + label}
              error={failure.error}
              onRetry={reload}
            />
          ) : null,
        )}
        <Form
          form={form}
          layout="vertical"
          onFinish={async (v) => {
            if (!lookupsUnavailable && !actionPending && (await save(v))) {
              setVisible(false);
              onChanged();
            }
          }}
        >
          {!course && (
            <>
              <Form.Item
                name="semesterId"
                label={t.courseActions.fieldSemester}
                rules={[{ required: true, message: t.courseActions.fieldSemesterRequired }]}
              >
                <Select
                  placeholder={t.courseActions.fieldSemesterPlaceholder}
                  loading={semesters.loading}
                  disabled={semesters.loading || !!semesters.failure}
                  options={semesters.data?.items.map((x) => ({
                    value: x.id,
                    label: `${x.code} - ${x.name}`,
                  }))}
                />
              </Form.Item>
              <Form.Item
                name="subjectId"
                label={t.courseActions.fieldSubject}
                rules={[{ required: true, message: t.courseActions.fieldSubjectRequired }]}
              >
                <Select
                  placeholder={t.courseActions.fieldSubjectPlaceholder}
                  loading={subjects.loading}
                  disabled={subjects.loading || !!subjects.failure}
                  options={subjects.data?.items.map((x) => ({
                    value: x.id,
                    label: `${x.code} - ${x.name}`,
                  }))}
                />
              </Form.Item>
            </>
          )}
          <Form.Item
            name="groupTypeId"
            label={t.courseActions.fieldGroupType}
            rules={[{ required: true, message: t.courseActions.fieldGroupTypeRequired }]}
          >
            <Select
              placeholder={t.courseActions.fieldGroupTypePlaceholder}
              loading={types.loading}
              disabled={!canChangeGroupType || types.loading || !!types.failure}
              options={typeOptions}
            />
          </Form.Item>
          <Form.Item
            name="startTime"
            label={t.courseActions.fieldStartTime}
            rules={[{ required: true, message: t.courseActions.fieldStartTimeRequired }]}
          >
            <DatePicker
              showTime={{ format: "HH:mm" }}
              format="DD/MM/YYYY HH:mm"
              placeholder={language === "en" ? "Select start date & time" : "Chọn ngày và giờ bắt đầu"}
              style={{ width: "100%" }}
            />
          </Form.Item>
          <Form.Item
            name="deadline"
            label={t.courseActions.fieldDeadline}
            dependencies={["startTime"]}
            rules={[
              { required: true, message: t.courseActions.fieldDeadlineRequired },
              ({ getFieldValue }) => ({
                validator: (_, deadline?: Dayjs) => {
                  const start = getFieldValue("startTime") as Dayjs | undefined;
                  if (deadline && start && !deadline.isAfter(start)) {
                    return Promise.reject(
                      new Error(
                        language === "vi"
                          ? "Hạn ghép nhóm phải sau thời gian bắt đầu"
                          : "Matching deadline must be after start time",
                      ),
                    );
                  }
                  return Promise.resolve();
                },
              }),
            ]}
          >
            <DatePicker
              showTime={{ format: "HH:mm" }}
              format="DD/MM/YYYY HH:mm"
              placeholder={language === "en" ? "Select deadline date & time" : "Chọn ngày và giờ kết thúc"}
              style={{ width: "100%" }}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
