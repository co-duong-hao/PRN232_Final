import "@/features/workspace.css";
import {
  BarChartOutlined,
  IdcardOutlined,
  SaveOutlined,
  TeamOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Alert, Avatar, Button, Card, Form, InputNumber, Progress, Select, Typography } from "antd";
import { useEffect, useState } from "react";
import { meApi, referenceApi } from "@/api";
import type { Student, StudentProfileRequest, TeamRole } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import { useApiAction } from "@/components/useApiAction";
import "./ProfilePage.css";

export function ProfilePage() {
  const { student } = useAuth();

  return (
    <div className="workspace-page student-profile">
      <header className="workspace-heading student-profile__header">
        <Typography.Title level={1}>Hồ sơ của tôi</Typography.Title>
        <p>Cập nhật GPA và vai trò để tìm nhóm phù hợp với bạn.</p>
      </header>
      {student ? (
        <ProfileForm key={student.id} student={student} />
      ) : (
        <Alert
          showIcon
          type="error"
          message="Không tải được hồ sơ sinh viên."
          action={<Button onClick={() => window.location.reload()}>Tải lại</Button>}
        />
      )}
    </div>
  );
}

function ProfileForm({ student }: { student: Student }) {
  const [form] = Form.useForm<StudentProfileRequest>();
  const [roles, setRoles] = useState<TeamRole[]>([]);
  const [rolesStatus, setRolesStatus] = useState<"loading" | "ready" | "error">("loading");
  const [roleRequest, setRoleRequest] = useState(0);
  const [save, saving] = useApiAction(meApi.updateProfile, "Đã lưu hồ sơ");
  const savedRoleIds = student.roles.map((role) => role.id);
  const gpa = Form.useWatch("gpa", form);
  const selectedRoleIds = Form.useWatch("roleIds", form);
  const currentGpa = gpa === undefined ? student.gpa : gpa;
  const currentRoleIds = selectedRoleIds ?? savedRoleIds;
  const roleCount = currentRoleIds.length;
  const completion = ((currentGpa == null ? 0 : 1) + (roleCount === 0 ? 0 : 1)) * 50;
  const changed =
    currentGpa !== student.gpa ||
    roleCount !== savedRoleIds.length ||
    currentRoleIds.some((id) => !savedRoleIds.includes(id));
  const roleOptions = new Map([...student.roles, ...roles].map((role) => [role.id, role.name]));

  useEffect(() => {
    let active = true;
    referenceApi
      .teamRoles()
      .then(({ items }) => {
        if (active) {
          setRoles(items);
          setRolesStatus("ready");
        }
      })
      .catch(() => {
        if (active) setRolesStatus("error");
      });
    return () => {
      active = false;
    };
  }, [roleRequest]);

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={{ gpa: student.gpa, roleIds: savedRoleIds }}
      disabled={saving}
      onFinish={async (values) => {
        if (changed && !saving && (await save({ gpa: values.gpa ?? null, roleIds: values.roleIds }))) {
          window.location.reload();
        }
      }}
    >
      <div className="student-profile__grid">
        <Card
          title={
            <h2>
              <IdcardOutlined /> Thông tin cơ bản
            </h2>
          }
        >
          <div className="student-profile__student">
            <Avatar size={56} icon={<UserOutlined />} aria-hidden="true" />
            <div>
              <span>Sinh viên</span>
              <strong>{student.fullName}</strong>
            </div>
          </div>
          <dl className="student-profile__details">
            <div>
              <dt>Mã sinh viên</dt>
              <dd>{student.studentCode}</dd>
            </div>
            <div>
              <dt>Ngành</dt>
              <dd>{student.majorCode}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{student.email}</dd>
            </div>
          </dl>
        </Card>

        <div className="student-profile__fields">
          <Card
            title={
              <h2>
                <BarChartOutlined /> Học lực
              </h2>
            }
          >
            <Form.Item
              name="gpa"
              label="GPA tích lũy"
              extra="Nhập điểm từ 0,00 đến 4,00. Có thể để trống."
              rules={[{ type: "number", min: 0, max: 4, message: "GPA phải từ 0 đến 4." }]}
            >
              <InputNumber
                min={0}
                max={4}
                precision={2}
                step={0.01}
                size="large"
                decimalSeparator=","
                addonAfter="/ 4,00"
                placeholder="Ví dụ 3,40"
              />
            </Form.Item>
          </Card>

          <Card
            title={
              <h2>
                <TeamOutlined /> Vai trò muốn đảm nhận
              </h2>
            }
          >
            {rolesStatus === "error" && (
              <Alert
                type="warning"
                showIcon
                message="Không tải được danh sách vai trò."
                action={
                  <Button
                    onClick={() => {
                      setRolesStatus("loading");
                      setRoleRequest((previous) => previous + 1);
                    }}
                  >
                    Thử lại
                  </Button>
                }
              />
            )}
            <Form.Item
              name="roleIds"
              label="Vai trò"
              extra="Chọn từ 1 đến 3 vai trò phù hợp với bạn."
              rules={[{ required: true, type: "array", min: 1, max: 3, message: "Chọn từ 1 đến 3 vai trò." }]}
            >
              <Select
                mode="multiple"
                size="large"
                loading={rolesStatus === "loading"}
                disabled={saving || rolesStatus !== "ready"}
                maxCount={3}
                placeholder={rolesStatus === "loading" ? "Đang tải vai trò…" : "Tìm và chọn vai trò"}
                optionFilterProp="label"
                notFoundContent="Không tìm thấy vai trò phù hợp."
                options={Array.from(roleOptions, ([value, label]) => ({ value, label }))}
              />
            </Form.Item>
          </Card>
          {completion < 100 && (
            <Alert
              type="info"
              showIcon
              message={
                completion === 0
                  ? "Hãy bổ sung GPA và vai trò trước khi tìm nhóm."
                  : currentGpa == null
                    ? "Bạn có thể bổ sung GPA để lọc nhóm theo yêu cầu đầu vào."
                    : "Chọn ít nhất một vai trò bạn muốn đảm nhận."
              }
            />
          )}
        </div>
      </div>

      <div className="student-profile__footer">
        <div className="student-profile__progress">
          <div className="student-profile__status" aria-live="polite">
            <strong>Hoàn thiện {completion}%</strong>
            {changed && <span>Có thay đổi chưa lưu</span>}
          </div>
          <Progress percent={completion} showInfo={false} size="small" />
        </div>
        <Button
          type="primary"
          size="large"
          htmlType="submit"
          icon={<SaveOutlined />}
          loading={saving}
          disabled={!changed}
        >
          Lưu hồ sơ
        </Button>
      </div>
    </Form>
  );
}
