import "@/features/staff/staffPages.css";
import "@/features/workspace.css";
import { Button, Form, Grid, Input, Modal, Popconfirm, Select, Space, Table, Tag, Typography } from "antd";
import { useCallback, useState } from "react";
import { usersApi, type Role, type User, type UserListParams, type UserStatus } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import { EmptyState } from "@/components/EmptyState";
import { formatDateTime } from "@/components/format";
import { getRoleLabels } from "@/components/labels";
import { useApiAction } from "@/components/useApiAction";
import { StaffLoadError } from "@/features/staff/StaffLoadError";
import { staffSortOrder } from "@/features/staff/staffTableSort";
import { useStaffPageBounds } from "@/features/staff/useStaffPageBounds";
import { useStaffQuery } from "@/features/staff/useStaffQuery";
import { TableSkeleton } from "@/features/WorkspaceSkeletons";
import { useI18n } from "@/i18n";

type Values = {
  email: string;
  fullName: string;
  password: string;
  confirmPassword: string;
  roles: Role[];
  status: UserStatus;
};

export function UsersPage() {
  const { user } = useAuth();
  const { t, language } = useI18n();
  const [params, setParams] = useState<UserListParams>({ page: 1, pageSize: 20 });
  const [searchText, setSearchText] = useState("");
  const screens = Grid.useBreakpoint();
  const [edit, setEdit] = useState<User | null>(null);
  const [mode, setMode] = useState<"create" | "edit" | "password" | null>(null);
  const [busyId, setBusyId] = useState<string>();
  const [form] = Form.useForm<Values>();
  const editingSelf = mode === "edit" && edit?.id === user?.id;

  const roleLabels = getRoleLabels(language);

  const request = useCallback(() => usersApi.list(params), [params]);
  const { data, loading, failure, reload: load } = useStaffQuery(request);
  useStaffPageBounds(params.page, data?.totalPages, setParams);
  const roles = useStaffQuery(usersApi.roles);
  const roleOptions = roles.data?.map((r) => ({ value: r.code, label: roleLabels[r.code] }));

  const [save, saving] = useApiAction(async (v: Values) => {
    if (mode === "create") {
      return usersApi.create({ email: v.email, fullName: v.fullName, password: v.password, roles: v.roles });
    }
    if (mode === "edit") {
      return usersApi.update(edit!.id, { fullName: v.fullName, status: v.status, roles: v.roles });
    }
    await usersApi.resetPassword(edit!.id, v.password);
    return true;
  }, t.usersPage.successSaved);

  const [deactivate] = useApiAction(async (id: string) => {
    await usersApi.deactivate(id);
    return true;
  }, t.usersPage.successDeactivated);

  const show = (m: "create" | "edit" | "password", u?: User) => {
    setEdit(u ?? null);
    setMode(m);
    form.resetFields();
    if (u && m === "edit") form.setFieldsValue({ fullName: u.fullName, status: u.status, roles: u.roles });
  };

  const filter = (p: Partial<UserListParams>) => setParams((x) => ({ ...x, ...p, page: 1 }));

  return (
    <div className="workspace-page staff-page">
      <header className="workspace-heading">
        <div>
          <span className="workspace-heading__eyebrow">{t.usersPage.eyebrow}</span>
          <Typography.Title level={1}>{t.usersPage.title}</Typography.Title>
          <p>{t.usersPage.subtitle}</p>
        </div>
        <Button type="primary" disabled={!roles.data} onClick={() => show("create")}>
          {t.usersPage.btnCreateUser}
        </Button>
      </header>

      <Space wrap className="workspace-toolbar staff-filters">
        <Input.Search
          aria-label={t.usersPage.searchPlaceholder}
          placeholder={t.usersPage.searchPlaceholder}
          allowClear
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          onSearch={(value) => filter({ q: value.trim() || undefined })}
        />
        <Select
          aria-label={t.usersPage.allRoles}
          placeholder={t.usersPage.allRoles}
          allowClear
          style={{ width: 180 }}
          loading={roles.loading}
          disabled={!!roles.failure}
          options={roleOptions}
          value={params.role}
          onChange={(role) => filter({ role })}
        />
        <Select
          aria-label={t.usersPage.allStatus}
          placeholder={t.usersPage.allStatus}
          allowClear
          style={{ width: 170 }}
          options={[
            { value: "Active", label: t.usersPage.statusActive },
            { value: "Inactive", label: t.usersPage.statusInactive },
          ]}
          value={params.status}
          onChange={(status) => filter({ status })}
        />
        <Button
          disabled={!(searchText || params.q || params.role || params.status)}
          onClick={() => {
            setSearchText("");
            filter({ q: undefined, role: undefined, status: undefined });
          }}
        >
          {language === "en" ? "Reset filters" : "Xóa bộ lọc"}
        </Button>
      </Space>

      {roles.failure && (
        <StaffLoadError
          title={t.usersPage.errorLoadRoles}
          error={roles.failure.error}
          onRetry={roles.reload}
        />
      )}

      {failure ? (
        <StaffLoadError
          title={language === "vi" ? "Không tải được danh sách tài khoản" : "Failed to load user accounts"}
          error={failure.error}
          onRetry={load}
        />
      ) : loading ? (
        <TableSkeleton
          scrollX={760}
          rows={5}
          pagination={{ current: params.page, pageSize: params.pageSize, total: data?.totalItems }}
          columns={[
            { title: t.usersPage.colEmail, kind: "text" },
            { title: t.usersPage.colFullName, kind: "text" },
            { title: t.usersPage.colRoles, kind: "tags" },
            { title: t.usersPage.colStatus, kind: "tag" },
            { title: t.usersPage.colCreatedAt, kind: "date" },
            { title: t.common.actions, kind: "actions", actionWidths: [62, 116, 76] },
          ]}
        />
      ) : (
        <Table
          className="staff-table"
          scroll={{ x: "max-content" }}
          size={screens.sm ? "middle" : "small"}
          rowKey="id"
          dataSource={data?.items ?? []}
          locale={{
            emptyText: (
              <EmptyState
                title={t.usersPage.emptyTitle}
                description={
                  searchText || params.role || params.status
                    ? language === "vi"
                      ? "Không tìm thấy tài khoản phù hợp với bộ lọc."
                      : "No accounts match the selected filters."
                    : undefined
                }
              />
            ),
          }}
          pagination={{
            current: params.page,
            pageSize: params.pageSize,
            total: data?.totalItems,
            showSizeChanger: !!screens.sm,
            responsive: true,
            showLessItems: !screens.sm,
          }}
          onChange={(p, _, s, { action }) => {
            const sort = Array.isArray(s) ? s[0] : s;
            setParams((x) => ({
              ...x,
              page: action === "sort" ? 1 : p.current,
              pageSize: p.pageSize,
              ...(action === "sort" && {
                sortBy: sort?.order ? String(sort.field) : undefined,
                sortDir: sort?.order === "ascend" ? "asc" : sort?.order ? "desc" : undefined,
              }),
            }));
          }}
          columns={[
            {
              title: t.usersPage.colEmail,
              dataIndex: "email",
              sorter: true,
              sortOrder: staffSortOrder(params, "email"),
            },
            {
              title: t.usersPage.colFullName,
              dataIndex: "fullName",
              sorter: true,
              sortOrder: staffSortOrder(params, "fullName"),
            },
            {
              title: t.usersPage.colRoles,
              dataIndex: "roles",
              render: (rs: Role[]) => rs.map((r) => <Tag key={r}>{roleLabels[r]}</Tag>),
            },
            {
              title: t.usersPage.colStatus,
              dataIndex: "status",
              render: (s: UserStatus) =>
                s === "Active" ? (
                  <Tag color="green">{t.usersPage.statusActive}</Tag>
                ) : (
                  <Tag>{t.usersPage.statusInactive}</Tag>
                ),
            },
            {
              title: t.usersPage.colCreatedAt,
              dataIndex: "createdAt",
              sorter: true,
              sortOrder: staffSortOrder(params, "createdAt"),
              render: formatDateTime,
            },
            {
              title: t.common.actions,
              render: (_: unknown, u: User) => (
                <Space wrap>
                  <Button disabled={!roles.data} onClick={() => show("edit", u)}>
                    {t.usersPage.btnEdit}
                  </Button>
                  <Button onClick={() => show("password", u)}>{t.usersPage.btnResetPassword}</Button>
                  {u.status === "Active" && u.id !== user?.id && (
                    <Popconfirm
                      title={t.usersPage.confirmDeactivateTitle}
                      okText={t.usersPage.confirmDeactivateOk}
                      cancelText={t.common.cancel}
                      onConfirm={async () => {
                        setBusyId(u.id);
                        try {
                          if (await deactivate(u.id)) load();
                        } finally {
                          setBusyId(undefined);
                        }
                      }}
                    >
                      <Button danger loading={busyId === u.id}>
                        {t.usersPage.btnDeactivate}
                      </Button>
                    </Popconfirm>
                  )}
                </Space>
              ),
            },
          ]}
        />
      )}

      <Modal
        title={
          mode === "create"
            ? t.usersPage.modalCreateTitle
            : mode === "edit"
              ? t.usersPage.modalEditTitle
              : t.usersPage.modalResetPasswordTitle
        }
        open={mode !== null}
        onCancel={() => setMode(null)}
        onOk={() => form.submit()}
        okText={t.common.save}
        cancelText={t.common.cancel}
        confirmLoading={saving}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={async (v) => {
            if (await save(v)) {
              setMode(null);
              load();
            }
          }}
        >
          {mode === "create" && (
            <Form.Item
              name="email"
              label={t.usersPage.fieldEmail}
              rules={[
                { required: true, message: t.usersPage.fieldEmailRequired },
                {
                  type: "email",
                  message: language === "en" ? "Invalid email format" : "Email không đúng định dạng",
                },
              ]}
            >
              <Input placeholder={language === "en" ? "Enter user email" : "Nhập email người dùng"} />
            </Form.Item>
          )}
          {mode !== "password" && (
            <>
              <Form.Item
                name="fullName"
                label={t.usersPage.fieldFullName}
                rules={[{ required: true, message: t.usersPage.fieldFullNameRequired }]}
              >
                <Input placeholder={language === "en" ? "Enter full name" : "Nhập họ và tên"} />
              </Form.Item>
              <Form.Item
                name="roles"
                label={t.usersPage.fieldRoles}
                rules={[{ required: true, message: t.usersPage.fieldRolesRequired }]}
              >
                <Select
                  mode="multiple"
                  placeholder={language === "en" ? "Select roles" : "Chọn vai trò"}
                  options={roleOptions?.map((option) => ({
                    ...option,
                    disabled: editingSelf && option.value === "Admin",
                  }))}
                  onChange={(next: Role[]) => {
                    if (editingSelf && !next.includes("Admin"))
                      form.setFieldValue("roles", [...next, "Admin"]);
                  }}
                />
              </Form.Item>
            </>
          )}
          {editingSelf && (
            <Typography.Paragraph type="secondary">
              {language === "en"
                ? "The currently logged in account must stay active and keep the administrator role."
                : "Tài khoản đang đăng nhập phải hoạt động và giữ vai trò quản trị viên."}
            </Typography.Paragraph>
          )}
          {mode === "edit" && (
            <Form.Item
              name="status"
              label={t.usersPage.fieldStatus}
              rules={[
                {
                  required: true,
                  message: language === "en" ? "Please select status" : "Vui lòng chọn trạng thái",
                },
              ]}
            >
              <Select
                disabled={editingSelf}
                options={[
                  { value: "Active", label: t.usersPage.statusActive },
                  { value: "Inactive", label: t.usersPage.statusInactive },
                ]}
              />
            </Form.Item>
          )}
          {mode !== "edit" && (
            <>
              <Form.Item
                name="password"
                label={t.usersPage.fieldPassword}
                rules={[
                  { required: true, message: t.usersPage.fieldPasswordRequired },
                  {
                    min: 8,
                    message:
                      language === "en"
                        ? "Password must be at least 8 characters"
                        : "Mật khẩu phải có ít nhất 8 ký tự",
                  },
                ]}
              >
                <Input.Password
                  autoComplete="new-password"
                  placeholder={language === "en" ? "Minimum 8 characters" : "Tối thiểu 8 ký tự"}
                />
              </Form.Item>
              <Form.Item
                name="confirmPassword"
                label={language === "en" ? "Confirm password" : "Nhập lại mật khẩu"}
                dependencies={["password"]}
                rules={[
                  {
                    required: true,
                    message:
                      language === "en" ? "Please confirm your password" : "Vui lòng nhập lại mật khẩu",
                  },
                  ({ getFieldValue }) => ({
                    validator: (_, confirmation?: string) =>
                      !confirmation || confirmation === getFieldValue("password")
                        ? Promise.resolve()
                        : Promise.reject(
                            new Error(
                              language === "en" ? "Passwords do not match" : "Hai mật khẩu không khớp",
                            ),
                          ),
                  }),
                ]}
              >
                <Input.Password autoComplete="new-password" />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>
    </div>
  );
}
