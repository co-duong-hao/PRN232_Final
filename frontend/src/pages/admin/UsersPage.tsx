import "@/features/staff/staffPages.css";
import "@/features/workspace.css";
import { Button, Form, Grid, Input, Modal, Popconfirm, Select, Space, Table, Tag, Typography } from "antd";
import { useCallback, useState } from "react";
import { usersApi, type Role, type User, type UserListParams, type UserStatus } from "@/api";
import { EmptyState } from "@/components/EmptyState";
import { formatDateTime } from "@/components/format";
import { roleLabel } from "@/components/labels";
import { useApiAction } from "@/components/useApiAction";
import { StaffLoadError } from "@/features/staff/StaffLoadError";
import { useStaffQuery } from "@/features/staff/useStaffQuery";
import { TableSkeleton } from "@/features/WorkspaceSkeletons";

type Values = { email: string; fullName: string; password: string; roles: Role[]; status: UserStatus };

export function UsersPage() {
  const [params, setParams] = useState<UserListParams>({ page: 1, pageSize: 20 });
  const screens = Grid.useBreakpoint();
  const [edit, setEdit] = useState<User | null>(null);
  const [mode, setMode] = useState<"create" | "edit" | "password" | null>(null);
  const [busyId, setBusyId] = useState<string>();
  const [form] = Form.useForm<Values>();

  const request = useCallback(() => usersApi.list(params), [params]);
  const { data, loading, failure, reload: load } = useStaffQuery(request);
  const roles = useStaffQuery(usersApi.roles);
  const roleOptions = roles.data?.map((r) => ({ value: r.code, label: roleLabel[r.code] }));

  const [save, saving] = useApiAction(async (v: Values) => {
    if (mode === "create") {
      return usersApi.create({ email: v.email, fullName: v.fullName, password: v.password, roles: v.roles });
    }
    if (mode === "edit") {
      return usersApi.update(edit!.id, { fullName: v.fullName, status: v.status, roles: v.roles });
    }
    await usersApi.resetPassword(edit!.id, v.password);
    return true;
  }, "Đã lưu tài khoản");

  const [deactivate] = useApiAction(async (id: string) => {
    await usersApi.deactivate(id);
    return true;
  }, "Đã vô hiệu hóa tài khoản");

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
          <span className="workspace-heading__eyebrow">Quản trị viên</span>
          <Typography.Title level={1}>Quản lý tài khoản</Typography.Title>
          <p>Quản lý người dùng, phân quyền vai trò và trạng thái truy cập hệ thống.</p>
        </div>
        <Button type="primary" disabled={!roles.data} onClick={() => show("create")}>
          Tạo tài khoản
        </Button>
      </header>

      <Space wrap className="workspace-toolbar staff-filters">
        <Input.Search
          aria-label="Tìm tài khoản"
          placeholder="Tìm email hoặc họ tên..."
          allowClear
          onSearch={(q) => filter({ q })}
        />
        <Select
          aria-label="Lọc theo vai trò"
          placeholder="Tất cả vai trò"
          allowClear
          style={{ width: 180 }}
          loading={roles.loading}
          disabled={!!roles.failure}
          options={roleOptions}
          onChange={(role) => filter({ role })}
        />
        <Select
          aria-label="Lọc theo trạng thái tài khoản"
          placeholder="Tất cả trạng thái"
          allowClear
          style={{ width: 170 }}
          options={[
            { value: "Active", label: "Hoạt động" },
            { value: "Inactive", label: "Vô hiệu hóa" },
          ]}
          onChange={(status) => filter({ status })}
        />
      </Space>

      {roles.failure && (
        <StaffLoadError
          title="Không tải được vai trò tài khoản"
          error={roles.failure.error}
          onRetry={roles.reload}
        />
      )}

      {failure ? (
        <StaffLoadError title="Không tải được danh sách tài khoản" error={failure.error} onRetry={load} />
      ) : loading ? (
        <TableSkeleton
          scrollX={820}
          rows={5}
          pagination={{ current: params.page, pageSize: params.pageSize, total: data?.totalItems }}
          columns={[
            { title: "Email", kind: "longText" },
            { title: "Họ tên", kind: "text" },
            { title: "Vai trò", kind: "tags" },
            { title: "Trạng thái", kind: "tag" },
            { title: "Ngày tạo", kind: "date" },
            { title: "Thao tác", kind: "actions", actionWidths: [58, 134, 96] },
          ]}
        />
      ) : (
        <Table
          className="staff-table"
          scroll={{ x: "max-content" }}
          size={screens.sm ? "middle" : "small"}
          rowKey="id"
          dataSource={data?.items ?? []}
          locale={{ emptyText: <EmptyState title="Không tìm thấy tài khoản nào" /> }}
          pagination={{
            current: params.page,
            pageSize: params.pageSize,
            total: data?.totalItems,
            showSizeChanger: !!screens.sm,
            responsive: true,
            showLessItems: !screens.sm,
          }}
          onChange={(p, _, s) => {
            const sort = Array.isArray(s) ? s[0] : s;
            setParams((x) => ({
              ...x,
              page: p.current,
              pageSize: p.pageSize,
              sortBy: sort?.order ? String(sort.field) : undefined,
              sortDir: sort?.order === "ascend" ? "asc" : sort?.order ? "desc" : undefined,
            }));
          }}
          columns={[
            { title: "Email", dataIndex: "email", sorter: true },
            { title: "Họ tên", dataIndex: "fullName", sorter: true },
            {
              title: "Vai trò",
              dataIndex: "roles",
              render: (rs: Role[]) => rs.map((r) => <Tag key={r}>{roleLabel[r]}</Tag>),
            },
            {
              title: "Trạng thái",
              dataIndex: "status",
              render: (s: UserStatus) =>
                s === "Active" ? <Tag color="green">Hoạt động</Tag> : <Tag>Vô hiệu hóa</Tag>,
            },
            { title: "Ngày tạo", dataIndex: "createdAt", sorter: true, render: formatDateTime },
            {
              title: "Thao tác",
              render: (_: unknown, u: User) => (
                <Space wrap>
                  <Button disabled={!roles.data} onClick={() => show("edit", u)}>
                    Sửa
                  </Button>
                  <Button onClick={() => show("password", u)}>Đặt lại mật khẩu</Button>
                  {u.status === "Active" && (
                    <Popconfirm
                      title="Vô hiệu hóa tài khoản này?"
                      okText="Vô hiệu hóa"
                      cancelText="Hủy"
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
                        Vô hiệu hóa
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
          mode === "create" ? "Tạo tài khoản mới" : mode === "edit" ? "Sửa tài khoản" : "Đặt lại mật khẩu"
        }
        open={mode !== null}
        onCancel={() => setMode(null)}
        onOk={() => form.submit()}
        okText="Lưu"
        cancelText="Hủy"
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
              label="Email"
              rules={[
                { required: true, message: "Vui lòng nhập email" },
                { type: "email", message: "Email không đúng định dạng" },
              ]}
            >
              <Input placeholder="Nhập email người dùng" />
            </Form.Item>
          )}
          {mode !== "password" && (
            <>
              <Form.Item
                name="fullName"
                label="Họ tên"
                rules={[{ required: true, message: "Vui lòng nhập họ tên" }]}
              >
                <Input placeholder="Nhập họ và tên" />
              </Form.Item>
              <Form.Item
                name="roles"
                label="Vai trò"
                rules={[{ required: true, message: "Vui lòng chọn ít nhất một vai trò" }]}
              >
                <Select mode="multiple" placeholder="Chọn vai trò" options={roleOptions} />
              </Form.Item>
            </>
          )}
          {mode === "edit" && (
            <Form.Item
              name="status"
              label="Trạng thái"
              rules={[{ required: true, message: "Vui lòng chọn trạng thái" }]}
            >
              <Select
                options={[
                  { value: "Active", label: "Hoạt động" },
                  { value: "Inactive", label: "Vô hiệu hóa" },
                ]}
              />
            </Form.Item>
          )}
          {mode !== "edit" && (
            <Form.Item
              name="password"
              label="Mật khẩu"
              rules={[
                { required: true, message: "Vui lòng nhập mật khẩu" },
                { min: 8, message: "Mật khẩu phải có ít nhất 8 ký tự" },
              ]}
            >
              <Input.Password placeholder="Tối thiểu 8 ký tự" />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
}
