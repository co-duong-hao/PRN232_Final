import {
  Empty,
  Grid,
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import { useCallback, useState } from "react";
import { usersApi, type Role, type User, type UserListParams, type UserStatus } from "@/api";
import { formatDateTime } from "@/components/format";
import { roleLabel } from "@/components/labels";
import { useApiAction } from "@/components/useApiAction";
import { StaffLoadError } from "@/features/staff/StaffLoadError";
import { useStaffQuery } from "@/features/staff/useStaffQuery";
import "@/features/staff/staffPages.css";

type Values = { email: string; fullName: string; password: string; roles: Role[]; status: UserStatus };

export function UsersPage() {
  const [params, setParams] = useState<UserListParams>({ page: 1, pageSize: 20 });
  const screens = Grid.useBreakpoint();
  const [edit, setEdit] = useState<User | null>(null);
  const [mode, setMode] = useState<"create" | "edit" | "password" | null>(null);
  const [form] = Form.useForm<Values>();
  const request = useCallback(() => usersApi.list(params), [params]);
  const { data, loading, failure, reload: load } = useStaffQuery(request);
  const roles = useStaffQuery(usersApi.roles);
  const roleOptions = roles.data?.map((r) => ({ value: r.code, label: roleLabel[r.code] }));
  const [save, saving] = useApiAction(async (v: Values) => {
    if (mode === "create")
      return usersApi.create({ email: v.email, fullName: v.fullName, password: v.password, roles: v.roles });
    if (mode === "edit")
      return usersApi.update(edit!.id, { fullName: v.fullName, status: v.status, roles: v.roles });
    await usersApi.resetPassword(edit!.id, v.password);
    return true;
  }, "Đã lưu tài khoản");
  const [deactivate, busy] = useApiAction(async (id: string) => {
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
    <div className="staff-page">
      <Typography.Title level={2}>Tài khoản</Typography.Title>
      <Space wrap className="staff-filters" style={{ marginBottom: 16 }}>
        <Input.Search placeholder="Tìm email hoặc họ tên" allowClear onSearch={(q) => filter({ q })} />
        <Select
          placeholder="Vai trò"
          allowClear
          style={{ width: 170 }}
          loading={roles.loading}
          disabled={!!roles.failure}
          options={roleOptions}
          onChange={(role) => filter({ role })}
        />
        <Select
          placeholder="Trạng thái"
          allowClear
          style={{ width: 150 }}
          options={[
            { value: "Active", label: "Hoạt động" },
            { value: "Inactive", label: "Vô hiệu hóa" },
          ]}
          onChange={(status) => filter({ status })}
        />
        <Button type="primary" disabled={!roles.data} onClick={() => show("create")}>
          Tạo tài khoản
        </Button>
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
      ) : (
        <Table
          className="staff-table"
          scroll={{ x: "max-content" }}
          size={screens.sm ? "middle" : "small"}
          rowKey="id"
          loading={loading}
          dataSource={data?.items ?? []}
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
          locale={{
            emptyText: loading ? null : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có tài khoản phù hợp" />
            ),
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
              render: (s: UserStatus) => (s === "Active" ? "Hoạt động" : "Vô hiệu hóa"),
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
                      onConfirm={async () => {
                        if (await deactivate(u.id)) load();
                      }}
                    >
                      <Button danger loading={busy}>
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
        title={mode === "create" ? "Tạo tài khoản" : mode === "edit" ? "Sửa tài khoản" : "Đặt lại mật khẩu"}
        open={mode !== null}
        onCancel={() => setMode(null)}
        onOk={() => form.submit()}
        confirmLoading={saving}
        destroyOnClose
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
            <Form.Item name="email" label="Email" rules={[{ required: true, type: "email" }]}>
              <Input />
            </Form.Item>
          )}
          {mode !== "password" && (
            <>
              <Form.Item name="fullName" label="Họ tên" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="roles" label="Vai trò" rules={[{ required: true }]}>
                <Select mode="multiple" options={roleOptions} />
              </Form.Item>
            </>
          )}
          {mode === "edit" && (
            <Form.Item name="status" label="Trạng thái" rules={[{ required: true }]}>
              <Select
                options={[
                  { value: "Active", label: "Hoạt động" },
                  { value: "Inactive", label: "Vô hiệu hóa" },
                ]}
              />
            </Form.Item>
          )}
          {mode !== "edit" && (
            <Form.Item name="password" label="Mật khẩu" rules={[{ required: true, min: 8 }]}>
              <Input.Password />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
}
