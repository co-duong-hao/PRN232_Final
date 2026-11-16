import { Button, DatePicker, Form, Modal, Popconfirm, Select, Space } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useState } from "react";
import { coursesApi, referenceApi, type Course } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import { useApiAction } from "@/components/useApiAction";
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
  const [visible, setVisible] = useState(false);
  const [form] = Form.useForm<Values>();
  const canChangeGroupType = !course || course.status === "Planned";
  const semesters = useStaffQuery(visible && !course ? referenceApi.semesters : null);
  const subjects = useStaffQuery(visible && !course ? referenceApi.subjects : null);
  const types = useStaffQuery(visible && canChangeGroupType ? referenceApi.groupTypes : null);
  const lookups = [
    { label: "học kỳ", ...semesters },
    { label: "môn học", ...subjects },
    { label: "loại nhóm", ...types },
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
  }, "Đã lưu học phần");

  const [open, opening] = useApiAction(() => coursesApi.open(course!.id), "Đã mở ghép nhóm");
  const [close, closing] = useApiAction(() => coursesApi.close(course!.id), "Đã đóng ghép nhóm");
  const [remove, removing] = useApiAction(async () => {
    await coursesApi.remove(course!.id);
    return true;
  }, "Đã xóa học phần");

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
            Tạo học phần
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
                Mở ghép nhóm
              </Button>
            )}
            {course.status === "Forming" && (
              <Popconfirm
                title="Đóng ghép nhóm học phần này?"
                disabled={actionPending}
                okText="Đóng ghép nhóm"
                cancelText="Hủy"
                onConfirm={async () => {
                  if (await close()) onChanged();
                }}
              >
                <Button loading={closing} disabled={actionPending}>
                  Đóng ghép nhóm
                </Button>
              </Popconfirm>
            )}
            <Button onClick={show} disabled={actionPending}>
              Sửa
            </Button>
            {allowDelete && course.status === "Planned" && hasRole("Admin") && (
              <Popconfirm
                title="Xóa học phần này?"
                disabled={actionPending}
                okText="Xóa"
                cancelText="Hủy"
                onConfirm={async () => {
                  if (await remove()) onChanged();
                }}
              >
                <Button danger loading={removing} disabled={actionPending}>
                  Xóa
                </Button>
              </Popconfirm>
            )}
          </>
        )}
      </Space>

      <Modal
        title={course ? "Cập nhật học phần" : "Tạo học phần mới"}
        open={visible}
        onCancel={() => {
          if (!saving) setVisible(false);
        }}
        closable={!saving}
        keyboard={!saving}
        maskClosable={!saving}
        cancelButtonProps={{ disabled: saving }}
        confirmLoading={saving}
        okText={course ? "Lưu thay đổi" : "Tạo học phần"}
        cancelText="Hủy"
        onOk={() => form.submit()}
        okButtonProps={{ disabled: lookupsUnavailable || actionPending }}
        destroyOnHidden
      >
        {lookups.map(({ label, failure, reload }) =>
          failure ? (
            <StaffLoadError
              key={label}
              title={"Không tải được " + label}
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
                label="Học kỳ"
                rules={[{ required: true, message: "Vui lòng chọn học kỳ" }]}
              >
                <Select
                  placeholder="Chọn học kỳ"
                  loading={semesters.loading}
                  disabled={semesters.loading || !!semesters.failure}
                  options={semesters.data?.items.map((x) => ({
                    value: x.id,
                    label: x.code + " - " + x.name,
                  }))}
                />
              </Form.Item>
              <Form.Item
                name="subjectId"
                label="Môn học"
                rules={[{ required: true, message: "Vui lòng chọn môn học" }]}
              >
                <Select
                  placeholder="Chọn môn học"
                  loading={subjects.loading}
                  disabled={subjects.loading || !!subjects.failure}
                  options={subjects.data?.items.map((x) => ({ value: x.id, label: x.code + " - " + x.name }))}
                />
              </Form.Item>
            </>
          )}
          <Form.Item
            name="groupTypeId"
            label="Loại nhóm"
            rules={[{ required: true, message: "Vui lòng chọn loại nhóm" }]}
          >
            <Select
              placeholder="Chọn loại nhóm"
              loading={types.loading}
              disabled={!canChangeGroupType || types.loading || !!types.failure}
              options={typeOptions}
            />
          </Form.Item>
          <Form.Item
            name="startTime"
            label="Thời gian bắt đầu"
            rules={[{ required: true, message: "Vui lòng chọn thời gian bắt đầu" }]}
          >
            <DatePicker
              showTime={{ format: "HH:mm" }}
              format="DD/MM/YYYY HH:mm"
              placeholder="Chọn ngày và giờ bắt đầu"
              style={{ width: "100%" }}
            />
          </Form.Item>
          <Form.Item
            name="deadline"
            label="Hạn ghép nhóm"
            dependencies={["startTime"]}
            rules={[
              { required: true, message: "Vui lòng chọn hạn ghép nhóm" },
              ({ getFieldValue }) => ({
                validator: (_, deadline?: Dayjs) => {
                  const start = getFieldValue("startTime") as Dayjs | undefined;
                  if (deadline && start && !deadline.isAfter(start)) {
                    return Promise.reject(new Error("Hạn ghép nhóm phải sau thời gian bắt đầu"));
                  }
                  return Promise.resolve();
                },
              }),
            ]}
          >
            <DatePicker
              showTime={{ format: "HH:mm" }}
              format="DD/MM/YYYY HH:mm"
              placeholder="Chọn ngày và giờ kết thúc"
              style={{ width: "100%" }}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
