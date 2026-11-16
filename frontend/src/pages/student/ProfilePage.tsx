import "@/features/workspace.css";
import { SaveOutlined, UserOutlined } from "@ant-design/icons";
import { Alert, Avatar, Button, Card, Form, InputNumber, Progress, Select, Space, Typography } from "antd";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { meApi, referenceApi } from "@/api";
import type { Student, StudentProfileRequest, TeamRole } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import { useApiAction } from "@/components/useApiAction";
import { SkeletonTags } from "@/features/WorkspaceSkeletons";
import "./ProfilePage.css";

export function ProfilePage() {
  const { student, refreshStudent } = useAuth();

  return (
    <div className="workspace-page student-profile">
      <header className="workspace-heading student-profile__header">
        <div>
          <span className="workspace-heading__eyebrow">Sinh viên</span>
          <Typography.Title level={1}>Hồ sơ của tôi</Typography.Title>
          <p>
            Cập nhật GPA và vai trò mong muốn để lọc phòng phù hợp và giúp trưởng phòng xét đơn nhanh hơn.
          </p>
        </div>
      </header>
      {student ? (
        <ProfileForm key={student.id} student={student} onSaved={refreshStudent} />
      ) : (
        <Alert
          type="error"
          message="Không tải được hồ sơ sinh viên."
          action={<Button onClick={() => void refreshStudent()}>Tải lại</Button>}
        />
      )}
    </div>
  );
}

function ProfileForm({ student, onSaved }: { student: Student; onSaved: () => Promise<Student | null> }) {
  const navigate = useNavigate();
  const [form] = Form.useForm<StudentProfileRequest>();
  const [roles, setRoles] = useState<TeamRole[]>([]);
  const [rolesStatus, setRolesStatus] = useState<"loading" | "ready" | "error">("loading");
  const [roleRequest, setRoleRequest] = useState(0);
  const [save, saving] = useApiAction(meApi.updateProfile, "Đã lưu hồ sơ sinh viên");

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
          await onSaved();
        }
      }}
    >
      <div className="student-profile__grid">
        <Card title="Thông tin cơ bản">
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
              <dt>Ngành học</dt>
              <dd>{student.majorCode}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{student.email}</dd>
            </div>
          </dl>
        </Card>

        <div className="student-profile__fields">
          <Card title="Học lực (GPA)">
            <Form.Item
              name="gpa"
              label="GPA tích lũy (thang 4.00)"
              extra="Nhập điểm từ 0.00 đến 4.00. Có thể bỏ trống nếu chưa muốn công khai."
              rules={[{ type: "number", min: 0, max: 4, message: "GPA phải từ 0.00 đến 4.00." }]}
            >
              <InputNumber<number>
                min={0}
                max={4}
                precision={2}
                step={0.01}
                size="large"
                addonAfter="/ 4.00"
                placeholder="Ví dụ: 3.40"
              />
            </Form.Item>
          </Card>

          <Card title="Vai trò muốn đảm nhận">
            {rolesStatus === "error" && (
              <Alert
                type="warning"
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
            {rolesStatus === "loading" && (
              <div
                className="student-profile__roles-skeleton"
                aria-busy="true"
                aria-label="Đang tải danh sách vai trò"
              >
                <div className="ant-form-item-label">
                  <label>Vai trò</label>
                </div>
                <div className="student-profile__roles-box" aria-hidden="true">
                  <SkeletonTags widths={[78, 92]} />
                </div>
                <div className="ant-form-item-extra">Chọn từ 1 đến 3 vai trò phù hợp với bạn.</div>
              </div>
            )}
            <Form.Item
              name="roleIds"
              label="Vai trò (1–3 vai trò)"
              className={rolesStatus === "loading" ? "student-profile__role-hidden" : undefined}
              extra="Chọn từ 1 đến 3 vai trò bạn có thể đảm nhận trong nhóm khởi nghiệp."
              rules={[
                {
                  required: true,
                  type: "array",
                  min: 1,
                  max: 3,
                  message: "Vui lòng chọn từ 1 đến 3 vai trò.",
                },
              ]}
            >
              <Select
                mode="multiple"
                size="large"
                loading={rolesStatus === "loading"}
                disabled={saving || rolesStatus !== "ready"}
                maxCount={3}
                placeholder={rolesStatus === "loading" ? "Đang tải vai trò..." : "Tìm và chọn vai trò"}
                optionFilterProp="label"
                notFoundContent="Không tìm thấy vai trò phù hợp."
                options={Array.from(roleOptions, ([value, label]) => ({ value, label }))}
              />
            </Form.Item>
          </Card>

          {completion < 100 ? (
            <Alert
              type="info"
              message={
                completion === 0
                  ? "Hãy bổ sung GPA và vai trò trước khi tìm nhóm."
                  : currentGpa == null
                    ? "Bạn có thể bổ sung GPA để lọc nhóm theo yêu cầu đầu vào."
                    : "Chọn ít nhất một vai trò bạn muốn đảm nhận."
              }
            />
          ) : (
            !changed && (
              <Alert
                type="success"
                message="Hồ sơ của bạn đã đầy đủ"
                description="Bạn đã sẵn sàng tìm nhóm theo GPA và vai trò mong muốn."
                action={
                  <Button type="primary" size="small" onClick={() => navigate("/student/courses")}>
                    Tìm nhóm ngay
                  </Button>
                }
              />
            )
          )}
        </div>
      </div>

      <div className="student-profile__footer">
        <div className="student-profile__progress">
          <div className="student-profile__status" aria-live="polite">
            <strong>Hoàn thiện {completion}%</strong>
            {changed && <span>Có thay đổi chưa lưu</span>}
          </div>
          <Progress percent={completion} showInfo={false} size="small" strokeColor="#c2410c" />
        </div>
        <Space>
          <Button onClick={() => navigate("/student/courses")}>Về Học phần của tôi</Button>
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
        </Space>
      </div>
    </Form>
  );
}
