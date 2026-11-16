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
import { useI18n } from "@/i18n";
import "./ProfilePage.css";

export function ProfilePage() {
  const { student, refreshStudent } = useAuth();
  const { t } = useI18n();

  return (
    <div className="workspace-page student-profile">
      <header className="workspace-heading student-profile__header">
        <div>
          <span className="workspace-heading__eyebrow">{t.profile.eyebrow}</span>
          <Typography.Title level={1}>{t.profile.title}</Typography.Title>
          <p>{t.profile.subtitle}</p>
        </div>
      </header>
      {student ? (
        <ProfileForm key={student.id} student={student} onSaved={refreshStudent} />
      ) : (
        <Alert
          type="error"
          message={t.profile.loadError}
          action={<Button onClick={() => void refreshStudent()}>{t.profile.reloadBtn}</Button>}
        />
      )}
    </div>
  );
}

function ProfileForm({ student, onSaved }: { student: Student; onSaved: () => Promise<Student | null> }) {
  const navigate = useNavigate();
  const { t, language } = useI18n();
  const [form] = Form.useForm<StudentProfileRequest>();
  const [roles, setRoles] = useState<TeamRole[]>([]);
  const [rolesStatus, setRolesStatus] = useState<"loading" | "ready" | "error">("loading");
  const [roleRequest, setRoleRequest] = useState(0);
  const [save, saving] = useApiAction(
    meApi.updateProfile,
    language === "en" ? "Student profile saved successfully" : "Đã lưu hồ sơ sinh viên",
  );

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
        <Card title={t.profile.basicInfoTitle}>
          <div className="student-profile__student">
            <Avatar size={56} icon={<UserOutlined />} aria-hidden="true" />
            <div>
              <span>{t.profile.studentBadge}</span>
              <strong>{student.fullName}</strong>
            </div>
          </div>
          <dl className="student-profile__details">
            <div>
              <dt>{t.profile.fieldStudentCode}</dt>
              <dd>{student.studentCode}</dd>
            </div>
            <div>
              <dt>{t.profile.fieldMajor}</dt>
              <dd>{student.majorCode}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{student.email}</dd>
            </div>
          </dl>
        </Card>

        <div className="student-profile__fields">
          <Card title={language === "en" ? "Academic Performance (GPA)" : "Học lực (GPA)"}>
            <Form.Item
              name="gpa"
              label={language === "en" ? "Cumulative GPA (4.00 scale)" : "GPA tích lũy (thang 4.00)"}
              extra={
                language === "en"
                  ? "Enter GPA between 0.00 and 4.00. You may leave blank if not ready to disclose."
                  : "Nhập điểm từ 0.00 đến 4.00. Có thể bỏ trống nếu chưa muốn công khai."
              }
              rules={[
                {
                  type: "number",
                  min: 0,
                  max: 4,
                  message:
                    language === "en" ? "GPA must be between 0.00 and 4.00." : "GPA phải từ 0.00 đến 4.00.",
                },
              ]}
            >
              <InputNumber<number>
                min={0}
                max={4}
                precision={2}
                step={0.01}
                size="large"
                addonAfter="/ 4.00"
                placeholder={language === "en" ? "E.g.: 3.40" : "Ví dụ: 3.40"}
              />
            </Form.Item>
          </Card>

          <Card title={language === "en" ? "Desired Team Roles" : "Vai trò muốn đảm nhận"}>
            {rolesStatus === "error" && (
              <Alert
                type="warning"
                message={
                  language === "en" ? "Failed to load roles list." : "Không tải được danh sách vai trò."
                }
                action={
                  <Button
                    onClick={() => {
                      setRolesStatus("loading");
                      setRoleRequest((previous) => previous + 1);
                    }}
                  >
                    {t.common.retry}
                  </Button>
                }
              />
            )}
            {rolesStatus === "loading" && (
              <div
                className="student-profile__roles-skeleton"
                aria-busy="true"
                aria-label={language === "en" ? "Loading roles list" : "Đang tải danh sách vai trò"}
              >
                <div className="ant-form-item-label">
                  <label>{language === "en" ? "Role" : "Vai trò"}</label>
                </div>
                <div className="student-profile__roles-box" aria-hidden="true">
                  <SkeletonTags widths={[78, 92]} />
                </div>
                <div className="ant-form-item-extra">
                  {language === "en"
                    ? "Select 1 to 3 roles suitable for you."
                    : "Chọn từ 1 đến 3 vai trò phù hợp với bạn."}
                </div>
              </div>
            )}
            <Form.Item
              name="roleIds"
              label={language === "en" ? "Roles (1–3 roles)" : "Vai trò (1–3 vai trò)"}
              className={rolesStatus === "loading" ? "student-profile__role-hidden" : undefined}
              extra={
                language === "en"
                  ? "Select 1 to 3 roles you can take on in your startup team."
                  : "Chọn từ 1 đến 3 vai trò bạn có thể đảm nhận trong nhóm khởi nghiệp."
              }
              rules={[
                {
                  required: true,
                  type: "array",
                  min: 1,
                  max: 3,
                  message:
                    language === "en" ? "Please select 1 to 3 roles." : "Vui lòng chọn từ 1 đến 3 vai trò.",
                },
              ]}
            >
              <Select
                mode="multiple"
                size="large"
                loading={rolesStatus === "loading"}
                disabled={saving || rolesStatus !== "ready"}
                maxCount={3}
                placeholder={
                  rolesStatus === "loading"
                    ? language === "en"
                      ? "Loading roles..."
                      : "Đang tải vai trò..."
                    : language === "en"
                      ? "Search and select roles"
                      : "Tìm và chọn vai trò"
                }
                optionFilterProp="label"
                notFoundContent={
                  language === "en" ? "No matching roles found." : "Không tìm thấy vai trò phù hợp."
                }
                options={Array.from(roleOptions, ([value, label]) => ({ value, label }))}
              />
            </Form.Item>
          </Card>

          {completion < 100 ? (
            <Alert
              type="info"
              message={
                completion === 0
                  ? language === "en"
                    ? "Please add GPA and team roles before finding teams."
                    : "Hãy bổ sung GPA và vai trò trước khi tìm nhóm."
                  : currentGpa == null
                    ? language === "en"
                      ? "You can add GPA to filter rooms by entry requirements."
                      : "Bạn có thể bổ sung GPA để lọc nhóm theo yêu cầu đầu vào."
                    : language === "en"
                      ? "Select at least one role you wish to take on."
                      : "Chọn ít nhất một vai trò bạn muốn đảm nhận."
              }
            />
          ) : (
            !changed && (
              <Alert
                type="success"
                message={language === "en" ? "Your profile is complete" : "Hồ sơ của bạn đã đầy đủ"}
                description={
                  language === "en"
                    ? "You are ready to search for teams by GPA and desired roles."
                    : "Bạn đã sẵn sàng tìm nhóm theo GPA và vai trò mong muốn."
                }
                action={
                  <Button type="primary" size="small" onClick={() => navigate("/student/courses")}>
                    {language === "en" ? "Find Team Now" : "Tìm nhóm ngay"}
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
            <strong>
              {language === "en" ? `Profile completion ${completion}%` : `Hoàn thiện ${completion}%`}
            </strong>
            {changed && <span>{t.profile.unsavedBadge}</span>}
          </div>
          <Progress percent={completion} showInfo={false} size="small" strokeColor="#c2410c" />
        </div>
        <Space>
          <Button onClick={() => navigate("/student/courses")}>{t.common.goToMyCourses}</Button>
          <Button
            type="primary"
            size="large"
            htmlType="submit"
            icon={<SaveOutlined />}
            loading={saving}
            disabled={!changed}
          >
            {t.profile.saveBtn}
          </Button>
        </Space>
      </div>
    </Form>
  );
}
