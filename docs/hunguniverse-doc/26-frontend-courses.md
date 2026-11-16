# Học phần trên web

Tài liệu tham chiếu cho PRN232 Final v0.4 tại commit 2e3789f.

[Mục lục bộ tài liệu](01-architecture.md)

## Cách hoạt động

Sinh viên thấy các Course mình được ghi danh, phòng hiện tại và nhóm chính thức. Trang của staff theo dõi các tab sinh viên, phòng, nhóm.

Các nút tạo, mở, đóng hoặc chỉnh Course phụ thuộc vai trò. Kiểm thử giao diện nên dùng tài khoản có quyền tương ứng.

Hai Course mẫu cho phép demo trường hợp sinh viên đã có nhóm ở EXE101 vẫn có thể tạo hoặc tham gia phòng ở EXE201.

## Cách kiểm tra

1. Đối chiếu thông tin học phần qua tài khoản sinh viên và giảng viên.
2. Trong dữ liệu thử, mở chi tiết Course sau khi nhóm hoàn tất và đối chiếu số nhóm với mục thống kê.

## Đối chiếu mã nguồn

Các trích đoạn dưới đây hỗ trợ tra cứu. Đường dẫn mở phần tương ứng trong repo.

### MyCoursesPage.tsx

Trang Course của sinh viên và truy cập phòng hoặc nhóm.

[frontend/src/pages/student/MyCoursesPage.tsx dòng 1–140](../../frontend/src/pages/student/MyCoursesPage.tsx#L1-L140)

~~~tsx
import { BookOutlined, TeamOutlined, HomeOutlined, ClockCircleOutlined } from "@ant-design/icons";
import { useCallback, useEffect, useState } from "react";
import { Button, Card, Col, Empty, Pagination, Row, Space, Spin, Statistic, Typography } from "antd";
import { loadAllMyCourses } from "@/features/student/loadMyCourses";
import { CreateRoomModal } from "@/features/student/CreateRoomModal";
import { Link } from "react-router-dom";
import { meApi } from "@/api";
import type { MyCourse } from "@/api";
import { CourseStatusTag, RoomStatusTag } from "@/components/StatusTag";
import { formatDateTime } from "@/components/format";
import { useShowError } from "@/components/useApiAction";

export function MyCoursesPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [allCourses, setAllCourses] = useState<MyCourse[]>([]);
  const [pending, setPending] = useState(0);
  const [items, setItems] = useState<MyCourse[]>([]);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const showError = useShowError();
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await meApi.courses({ page, pageSize: size });
      setItems(data.items);
      setTotal(data.totalItems);
    } catch (e) {
      showError(e);
    } finally {
      setLoading(false);
    }
  }, [page, size, showError]);
  useEffect(() => {
    Promise.all([loadAllMyCourses(), meApi.applies({ status: "Pending", pageSize: 1 })])
      .then(([courses, applies]) => {
        setAllCourses(courses);
        setPending(applies.totalItems);
      })
      .catch(showError);
  }, [showError]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <>
      <Space style={{ width: "100%", justifyContent: "space-between" }}>
        <Typography.Title level={2}>Course của tôi</Typography.Title>
        <Button type="primary" onClick={() => setCreateOpen(true)}>
          + Tạo nhóm
        </Button>
      </Space>
      <CreateRoomModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {[
          { title: "Số Course", value: allCourses.length, icon: <BookOutlined /> },
          { title: "Đã có nhóm", value: allCourses.filter((c) => c.myGroup).length, icon: <TeamOutlined /> },
          {
            title: "Đang ở phòng",
            value: allCourses.filter((c) => c.myRoom && !c.myGroup).length,
            icon: <HomeOutlined />,
          },
          { title: "Đơn đang chờ", value: pending, icon: <ClockCircleOutlined /> },
        ].map((item) => (
          <Col xs={12} md={6} key={item.title}>
            <Card style={{ borderLeft: "4px solid #fa8c16", height: "100%" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <Statistic title={item.title} value={item.value} />
                <span
                  style={{
                    background: "#fff7e6",
                    color: "#fa8c16",
                    borderRadius: 8,
                    padding: 12,
                    height: 44,
                  }}
                >
                  {item.icon}
                </span>
              </div>
            </Card>
          </Col>
        ))}
      </Row>
      <Typography.Title level={3}>Nhóm của tôi</Typography.Title>
      <Spin spinning={loading}>
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          {!loading && items.length === 0 && <Empty description="Chưa có Course" />}
          {items.map((c) => (
            <Card key={c.id} title={c.code} extra={<CourseStatusTag status={c.status} />}>
              <Space direction="vertical">
                <span>Loại nhóm: {c.groupTypeName}</span>
                <span>Hạn ghép nhóm: {formatDateTime(c.deadline)}</span>
                <span>Số sinh viên: {c.studentCount}</span>
                {c.status !== "Forming" && (
                  <Typography.Text type="secondary">Chưa mở / đã đóng ghép nhóm</Typography.Text>
                )}
                {c.myGroup ? (
                  <>
                    <span>Đã có nhóm {c.myGroup.name || c.myGroup.code}</span>
                    <Link to={`/student/groups/${c.myGroup.id}`}>
                      <Button>Xem nhóm</Button>
                    </Link>
                  </>
                ) : c.myRoom ? (
                  <>
                    <span>
                      Đang ở phòng {c.myRoom.name || c.myRoom.code} <RoomStatusTag status={c.myRoom.status} />
                    </span>
                    <Link to={`/student/rooms/${c.myRoom.id}`}>
                      <Button>Vào phòng của tôi</Button>
                    </Link>
                  </>
                ) : (
                  <>
                    <span>Chưa có phòng</span>
                    <Link to={`/student/courses/${c.id}`}>
                      <Button>Tìm phòng</Button>
                    </Link>
                  </>
                )}
              </Space>
            </Card>
          ))}
          <Pagination
            current={page}
            pageSize={size}
            total={total}
            showSizeChanger
            onChange={(p, s) => {
              setPage(p);
              setSize(s);
            }}
          />
        </Space>
      </Spin>
    </>
  );
}
~~~

### loadMyCourses.ts

Lấy toàn bộ trang Course khi cần tìm Course hiện tại.

[frontend/src/features/student/loadMyCourses.ts dòng 1–12](../../frontend/src/features/student/loadMyCourses.ts#L1-L12)

~~~typescript
import { meApi } from "@/api";
import type { MyCourse } from "@/api";

export async function loadAllMyCourses(): Promise<MyCourse[]> {
  const first = await meApi.courses({ page: 1, pageSize: 100 });
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, first.totalPages - 1) }, (_, i) =>
      meApi.courses({ page: i + 2, pageSize: 100 }),
    ),
  );
  return [first, ...rest].flatMap((page) => page.items);
}
~~~

### CoursesPage.tsx

Danh sách Course dành cho staff.

[frontend/src/pages/staff/CoursesPage.tsx dòng 1–107](../../frontend/src/pages/staff/CoursesPage.tsx#L1-L107)

~~~tsx
import { Input, Select, Space, Table, Typography } from "antd";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { coursesApi, referenceApi, type Course, type CourseListParams, type Lookup, type Paged } from "@/api";
import { CourseStatusTag } from "@/components/StatusTag";
import { courseStatusLabel } from "@/components/labels";
import { formatDateTime } from "@/components/format";
import { useShowError } from "@/components/useApiAction";
import { CourseActions } from "@/features/staff/CourseActions";
export function CoursesPage() {
  const [params, setParams] = useState<CourseListParams>({ page: 1, pageSize: 20 });
  const [data, setData] = useState<Paged<Course>>();
  const [loading, setLoading] = useState(false);
  const [semesters, setSemesters] = useState<Lookup[]>([]);
  const [subjects, setSubjects] = useState<Lookup[]>([]);
  const showError = useShowError();
  const load = useCallback(() => {
    setLoading(true);
    coursesApi
      .list(params)
      .then(setData)
      .catch(showError)
      .finally(() => setLoading(false));
  }, [params, showError]);
  useEffect(load, [load]);
  useEffect(() => {
    Promise.all([referenceApi.semesters(), referenceApi.subjects()])
      .then(([a, b]) => {
        setSemesters(a.items);
        setSubjects(b.items);
      })
      .catch(showError);
  }, [showError]);
  const filter = (p: Partial<CourseListParams>) => setParams((x) => ({ ...x, ...p, page: 1 }));
  return (
    <>
      <Typography.Title level={2}>Course</Typography.Title>
      <Space wrap style={{ marginBottom: 16 }}>
        <Input.Search placeholder="Tìm Course" allowClear onSearch={(q) => filter({ q })} />
        <Select
          placeholder="Trạng thái"
          allowClear
          style={{ width: 160 }}
          options={Object.entries(courseStatusLabel).map(([value, v]) => ({ value, label: v.text }))}
          onChange={(status) => filter({ status })}
        />
        <Select
          placeholder="Học kỳ"
          allowClear
          style={{ width: 160 }}
          options={semesters.map((x) => ({ value: x.id, label: x.code }))}
          onChange={(semesterId) => filter({ semesterId })}
        />
        <Select
          placeholder="Môn"
          allowClear
          style={{ width: 160 }}
          options={subjects.map((x) => ({ value: x.id, label: x.code }))}
          onChange={(subjectId) => filter({ subjectId })}
        />
        <CourseActions onChanged={load} />
      </Space>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={data?.items ?? []}
        pagination={{
          current: params.page,
          pageSize: params.pageSize,
          total: data?.totalItems,
          showSizeChanger: true,
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
          {
            title: "Mã",
            dataIndex: "code",
            sorter: true,
            render: (v: string, r: Course) => <Link to={`/staff/courses/${r.id}`}>{v}</Link>,
          },
          {
            title: "Trạng thái",
            dataIndex: "status",
            render: (v: Course["status"]) => <CourseStatusTag status={v} />,
          },
          { title: "Loại nhóm", dataIndex: "groupTypeName" },
          { title: "Sinh viên", dataIndex: "studentCount" },
          { title: "Bắt đầu", dataIndex: "startTime", render: formatDateTime },
          { title: "Hạn", dataIndex: "deadline", sorter: true, render: formatDateTime },
          {
            title: "Thao tác",
            render: (_: unknown, r: Course) => <CourseActions course={r} onChanged={load} />,
          },
        ]}
      />
    </>
  );
}
~~~

### CourseActions.tsx

Các thao tác quản lý Course từ giao diện.

[frontend/src/features/staff/CourseActions.tsx dòng 1–157](../../frontend/src/features/staff/CourseActions.tsx#L1-L157)

~~~tsx
import { Button, DatePicker, Form, Modal, Popconfirm, Select, Space } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useState } from "react";
import { coursesApi, referenceApi, type Course, type GroupType, type Lookup } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import { useApiAction, useShowError } from "@/components/useApiAction";

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
  const [semesters, setSemesters] = useState<Lookup[]>([]);
  const [subjects, setSubjects] = useState<Lookup[]>([]);
  const [types, setTypes] = useState<GroupType[]>([]);
  const [form] = Form.useForm<Values>();
  const showError = useShowError();
  const [save, saving] = useApiAction(async (v: Values) => {
    const dates = {
      groupTypeId: v.groupTypeId,
      startTime: v.startTime.toISOString(),
      deadline: v.deadline.toISOString(),
    };
    return course
      ? coursesApi.update(course.id, dates)
      : coursesApi.create({ ...dates, semesterId: v.semesterId, subjectId: v.subjectId });
  }, "Đã lưu Course");
  const [open, opening] = useApiAction(() => coursesApi.open(course!.id), "Đã mở ghép nhóm");
  const [close, closing] = useApiAction(() => coursesApi.close(course!.id), "Đã đóng ghép nhóm");
  const [remove, removing] = useApiAction(async () => {
    await coursesApi.remove(course!.id);
    return true;
  }, "Đã xóa Course");
  useEffect(() => {
    if (!visible) return;
    Promise.all([referenceApi.semesters(), referenceApi.subjects(), referenceApi.groupTypes()])
      .then(([a, b, c]) => {
        setSemesters(a.items);
        setSubjects(b.items);
        setTypes(c.items);
      })
      .catch(showError);
  }, [visible, showError]);
  const show = () => {
    form.resetFields();
    if (course)
      form.setFieldsValue({
        groupTypeId: course.groupTypeId,
        startTime: dayjs(course.startTime),
        deadline: dayjs(course.deadline),
      });
    setVisible(true);
  };
  return (
    <>
      <Space wrap>
        {!course && hasRole("Admin") && (
          <Button type="primary" onClick={show}>
            Tạo Course
          </Button>
        )}
        {course && hasRole("Admin", "HeadOfDepartment") && (
          <>
            {course.status === "Planned" && (
              <Button
                loading={opening}
                onClick={async () => {
                  if (await open()) onChanged();
                }}
              >
                Mở ghép nhóm
              </Button>
            )}
            {course.status === "Forming" && (
              <Popconfirm
                title="Đóng ghép nhóm Course này?"
                onConfirm={async () => {
                  if (await close()) onChanged();
                }}
              >
                <Button loading={closing}>Đóng ghép nhóm</Button>
              </Popconfirm>
            )}
            <Button onClick={show}>Sửa</Button>
            {allowDelete && course.status === "Planned" && hasRole("Admin") && (
              <Popconfirm
                title="Xóa Course này?"
                onConfirm={async () => {
                  if (await remove()) onChanged();
                }}
              >
                <Button danger loading={removing}>
                  Xóa
                </Button>
              </Popconfirm>
            )}
          </>
        )}
      </Space>
      <Modal
        title={course ? "Sửa Course" : "Tạo Course"}
        open={visible}
        onCancel={() => setVisible(false)}
        confirmLoading={saving}
        onOk={() => form.submit()}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={async (v) => {
            if (await save(v)) {
              setVisible(false);
              onChanged();
            }
          }}
        >
          {!course && (
            <>
              <Form.Item name="semesterId" label="Học kỳ" rules={[{ required: true }]}>
                <Select options={semesters.map((x) => ({ value: x.id, label: `${x.code} - ${x.name}` }))} />
              </Form.Item>
              <Form.Item name="subjectId" label="Môn" rules={[{ required: true }]}>
                <Select options={subjects.map((x) => ({ value: x.id, label: `${x.code} - ${x.name}` }))} />
              </Form.Item>
            </>
          )}
          <Form.Item name="groupTypeId" label="Loại nhóm" rules={[{ required: true }]}>
            <Select
              disabled={!!course && course.status !== "Planned"}
              options={types.map((x) => ({ value: x.id, label: x.name }))}
            />
          </Form.Item>
          <Form.Item name="startTime" label="Bắt đầu" rules={[{ required: true }]}>
            <DatePicker showTime style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="deadline" label="Hạn" rules={[{ required: true }]}>
            <DatePicker showTime style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
~~~
