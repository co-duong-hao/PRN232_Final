import { Button, DatePicker, Form, Modal, Popconfirm, Select, Space } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useState } from "react";
import { coursesApi, referenceApi, type Course, type GroupType, type Lookup } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import { useApiAction, useShowError } from "@/components/useApiAction";

type Values = { semesterId: string; subjectId: string; groupTypeId: string; startTime: Dayjs; deadline: Dayjs };
export function CourseActions({ course, onChanged, allowDelete = true }: { course?: Course; onChanged: () => void; allowDelete?: boolean }) {
  const { hasRole } = useAuth();
  const [visible, setVisible] = useState(false);
  const [semesters, setSemesters] = useState<Lookup[]>([]);
  const [subjects, setSubjects] = useState<Lookup[]>([]);
  const [types, setTypes] = useState<GroupType[]>([]);
  const [form] = Form.useForm<Values>();
  const showError = useShowError();
  const [save, saving] = useApiAction(async (v: Values) => {
    const dates = { groupTypeId: v.groupTypeId, startTime: v.startTime.toISOString(), deadline: v.deadline.toISOString() };
    return course ? coursesApi.update(course.id, dates) : coursesApi.create({ ...dates, semesterId: v.semesterId, subjectId: v.subjectId });
  }, "Đã lưu Course");
  const [open, opening] = useApiAction(() => coursesApi.open(course!.id), "Đã mở ghép nhóm");
  const [close, closing] = useApiAction(() => coursesApi.close(course!.id), "Đã đóng ghép nhóm");
  const [remove, removing] = useApiAction(async () => { await coursesApi.remove(course!.id); return true; }, "Đã xóa Course");
  useEffect(() => { if (!visible) return; Promise.all([referenceApi.semesters(), referenceApi.subjects(), referenceApi.groupTypes()]).then(([a,b,c]) => { setSemesters(a.items); setSubjects(b.items); setTypes(c.items); }).catch(showError); }, [visible, showError]);
  const show = () => { form.resetFields(); if (course) form.setFieldsValue({ groupTypeId: course.groupTypeId, startTime: dayjs(course.startTime), deadline: dayjs(course.deadline) }); setVisible(true); };
  return <><Space wrap>
    {!course && hasRole("Admin") && <Button type="primary" onClick={show}>Tạo Course</Button>}
    {course && hasRole("Admin", "HeadOfDepartment") && <>
      {course.status === "Planned" && <Button loading={opening} onClick={async () => { if (await open()) onChanged(); }}>Mở ghép nhóm</Button>}
      {course.status === "Forming" && <Popconfirm title="Đóng ghép nhóm Course này?" onConfirm={async () => { if (await close()) onChanged(); }}><Button loading={closing}>Đóng ghép nhóm</Button></Popconfirm>}
      <Button onClick={show}>Sửa</Button>
      {allowDelete && course.status === "Planned" && hasRole("Admin") && <Popconfirm title="Xóa Course này?" onConfirm={async () => { if (await remove()) onChanged(); }}><Button danger loading={removing}>Xóa</Button></Popconfirm>}
    </>}
  </Space><Modal title={course ? "Sửa Course" : "Tạo Course"} open={visible} onCancel={() => setVisible(false)} confirmLoading={saving} onOk={() => form.submit()} destroyOnClose>
    <Form form={form} layout="vertical" onFinish={async v => { if (await save(v)) { setVisible(false); onChanged(); } }}>
      {!course && <><Form.Item name="semesterId" label="Học kỳ" rules={[{ required: true }]}><Select options={semesters.map(x => ({ value: x.id, label: `${x.code} - ${x.name}` }))} /></Form.Item><Form.Item name="subjectId" label="Môn" rules={[{ required: true }]}><Select options={subjects.map(x => ({ value: x.id, label: `${x.code} - ${x.name}` }))} /></Form.Item></>}
      <Form.Item name="groupTypeId" label="Loại nhóm" rules={[{ required: true }]}><Select disabled={!!course && course.status !== "Planned"} options={types.map(x => ({ value: x.id, label: x.name }))} /></Form.Item>
      <Form.Item name="startTime" label="Bắt đầu" rules={[{ required: true }]}><DatePicker showTime style={{ width: "100%" }} /></Form.Item>
      <Form.Item name="deadline" label="Hạn" rules={[{ required: true }]}><DatePicker showTime style={{ width: "100%" }} /></Form.Item>
    </Form></Modal></>;
}

