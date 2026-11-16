import { useEffect, useState } from "react";
import { Alert, Button, Card, Form, InputNumber, Select, Space, Typography } from "antd";
import { meApi, referenceApi } from "@/api";
import type { StudentProfileRequest, TeamRole } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import { useApiAction, useShowError } from "@/components/useApiAction";

export function ProfilePage() {
  const { student } = useAuth();
  const [form] = Form.useForm<StudentProfileRequest>();
  const [roles, setRoles] = useState<TeamRole[]>([]);
  const showError = useShowError();
  const [save, saving] = useApiAction(meApi.updateProfile, "Đã lưu hồ sơ");
  const gpa = Form.useWatch("gpa", form);
  const selected = Form.useWatch("roleIds", form);
  useEffect(() => {
    referenceApi
      .teamRoles()
      .then((r) => setRoles(r.items))
      .catch(showError);
  }, [showError]);
  useEffect(() => {
    if (student) form.setFieldsValue({ gpa: student.gpa, roleIds: student.roles.map((r) => r.id) });
  }, [student, form]);
  return (
    <>
      <Typography.Title level={2}>Hồ sơ của tôi</Typography.Title>
      <Typography.Paragraph type="secondary">
        {student?.fullName} · {student?.studentCode} · {student?.email}
      </Typography.Paragraph>
      {(student?.gpa == null || !student?.roles.length) && (
        <Alert showIcon type="info" message="Hãy khai GPA và vai trò trước khi tìm nhóm." />
      )}
      <Form
        form={form}
        layout="vertical"
        onFinish={async (values) => {
          if (await save({ gpa: values.gpa ?? null, roleIds: values.roleIds })) {
            try {
              await meApi.student();
              window.location.reload();
            } catch (e) {
              showError(e);
            }
          }
        }}
      >
        <Space direction="vertical" size="middle" style={{ width: "100%", marginTop: 16, paddingBottom: 80 }}>
          <Card title="Thông tin cơ bản">
            <p>Mã SV: {student?.studentCode}</p>
            <p>Họ tên: {student?.fullName}</p>
            <p>Email: {student?.email}</p>
            <p>Ngành: {student?.majorCode}</p>
          </Card>
          <Card title="Học lực">
            <Form.Item name="gpa" label="GPA">
              <InputNumber min={0} max={4} precision={2} step={0.01} placeholder="Tối đa 4" />
            </Form.Item>
          </Card>
          <Card title="Vai trò muốn đảm nhận">
            <Form.Item
              name="roleIds"
              label="Vai trò"
              rules={[{ required: true, type: "array", min: 1, max: 3, message: "Chọn từ 1 đến 3 vai trò" }]}
            >
              <Select
                mode="multiple"
                maxCount={3}
                options={roles.map((r) => ({ value: r.id, label: r.name }))}
              />
            </Form.Item>
          </Card>
        </Space>
        <div
          style={{
            position: "sticky",
            bottom: 0,
            background: "white",
            padding: 16,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <strong>Hoàn thiện {((gpa != null ? 1 : 0) + (selected?.length ? 1 : 0)) * 50}%</strong>
          <Button type="primary" htmlType="submit" loading={saving}>
            Lưu hồ sơ
          </Button>
        </div>
      </Form>
    </>
  );
}
