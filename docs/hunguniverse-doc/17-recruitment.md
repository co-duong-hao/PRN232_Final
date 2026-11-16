# Hồ sơ và tiêu chí tuyển

Tài liệu tham chiếu cho PRN232 Final v0.4 tại commit 2e3789f.

[Mục lục bộ tài liệu](01-architecture.md)

## Cách hoạt động

GPA sinh viên là dữ liệu hồ sơ có thể cập nhật. Danh sách vai trò mong muốn có 1–3 mục, không trùng và phải có trong danh mục.

Thông tin tuyển của phòng có tên nhóm, dự án, ý tưởng, GPA yêu cầu, điểm mục tiêu và nhu cầu vai trò. API giới hạn quyền cập nhật cho trưởng phòng.

Chỉ kiểm tra GPA đầu vào trực tiếp ở `JoinAsync`. Luồng duyệt đơn không dùng cùng ngưỡng GPA.

## Cách kiểm tra

1. Lưu hồ sơ rồi tải lại màn hình để đối chiếu GPA và vai trò đã lưu.
2. Thử cập nhật tuyển dụng bằng trưởng phòng, một thành viên thường và sau khi phòng đã hoàn tất.

## Đối chiếu mã nguồn

Các trích đoạn dưới đây hỗ trợ tra cứu. Đường dẫn mở phần tương ứng trong repo.

### MeController.cs

Đọc và cập nhật hồ sơ của sinh viên hiện tại.

[src/TeamService/Controllers/MeController.cs dòng 1–23](../../src/TeamService/Controllers/MeController.cs#L1-L23)

~~~csharp
using Exe.Contracts;
using Exe.TeamService.Dtos;
using Exe.TeamService.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Exe.TeamService.Controllers;

/// <summary>Profile of the signed-in student. The frontend uses <c>id</c> to recognise the room leader.</summary>
[ApiController]
[Authorize(Roles = Roles.Student)]
public sealed class MeController(RoomService rooms) : ControllerBase
{
    [HttpGet("api/me/student")]
    public async Task<ActionResult<StudentDto>> Student(CancellationToken ct)
    {
        var student = await rooms.CurrentStudentAsync(ct);
        return Ok(new StudentDto(student.Id, student.UserId, student.StudentCode, student.FullName, student.Email,
            student.MajorId, student.Major.Code) { Gpa = student.Gpa, Roles = RoomService.RoleDtos(student) });
    }
    [HttpPut("api/me/student/profile")]
    public async Task<ActionResult<StudentDto>> Profile(StudentProfileRequest request, CancellationToken ct) => Ok(await rooms.UpdateStudentProfileAsync(request, ct));
}
~~~

### RoomService.cs

Validation hồ sơ phòng, hồ sơ sinh viên và thay đổi các quan hệ vai trò.

[src/TeamService/Services/RoomService.cs dòng 59–93](../../src/TeamService/Services/RoomService.cs#L59-L93)

~~~csharp

    private async Task<List<TeamRole>> ValidateProfileAsync(RoomProfileRequest? profile, CancellationToken ct)
    {
        var ids = profile?.NeededRoleIds ?? [];
        if (profile is not null && ((profile.Name?.Length ?? 0) > 100 || (profile.ProjectName?.Length ?? 0) > 200 || (profile.IdeaDescription?.Length ?? 0) > 1000 || profile.RequiredGpa is < 0 or > 4 || profile.TargetGrade is < 0 or > 10 || (profile.RequiredGpa.HasValue && decimal.Round(profile.RequiredGpa.Value, 2) != profile.RequiredGpa) || ids.Count > 5 || ids.Distinct().Count() != ids.Count)) throw new BadRequestException("Thông tin tuyển không hợp lệ.");
        var roles = await db.TeamRoles.Where(x => ids.Contains(x.Id)).ToListAsync(ct);
        if (roles.Count != ids.Count) throw new BadRequestException("Vai trò không tồn tại.");
        return roles;
    }
    private static void ApplyProfile(Room room, RoomProfileRequest? profile, List<TeamRole> roles)
    {
        room.Name = profile?.Name; room.ProjectName = profile?.ProjectName; room.IdeaDescription = profile?.IdeaDescription; room.RequiredGpa = profile?.RequiredGpa; room.TargetGrade = profile?.TargetGrade;
        foreach (var role in roles) room.NeededRoles.Add(new RoomNeededRole { TeamRole = role });
    }
    public async Task<RoomDto> UpdateProfileAsync(Guid id, RoomProfileRequest profile, CancellationToken ct)
    {
        var room = await LoadRoomAsync(id, ct); CheckForming(room.Course);
        var student = await CurrentStudentAsync(ct); await CheckEnrollmentAsync(room.CourseId, student.Id, ct);
        CheckLeader(room, student); CheckActive(room);
        var roles = await ValidateProfileAsync(profile, ct);
        foreach (var old in room.NeededRoles.Where(x => roles.All(r => r.Id != x.TeamRoleId)).ToArray()) { db.RoomNeededRoles.Remove(old); room.NeededRoles.Remove(old); }
        var added = roles.Where(r => room.NeededRoles.All(x => x.TeamRoleId != r.Id)).ToList();
        ApplyProfile(room, profile, added); room.Version++; await db.SaveChangesAsync(ct); return Map(room);
    }
    public async Task<StudentDto> UpdateStudentProfileAsync(StudentProfileRequest request, CancellationToken ct)
    {
        var ids = request.RoleIds;
        if (request.Gpa is < 0 or > 4 || (request.Gpa.HasValue && decimal.Round(request.Gpa.Value, 2) != request.Gpa) || ids is null || ids.Count is < 1 or > 3 || ids.Distinct().Count() != ids.Count) throw new BadRequestException("Hồ sơ sinh viên không hợp lệ.");
        var roles = await db.TeamRoles.Where(x => ids.Contains(x.Id)).ToListAsync(ct);
        if (roles.Count != ids.Count) throw new BadRequestException("Vai trò không tồn tại.");
        var student = await CurrentStudentAsync(ct); student.Gpa = request.Gpa;
        foreach (var old in student.Roles.Where(x => !ids.Contains(x.TeamRoleId)).ToArray()) { db.StudentTeamRoles.Remove(old); student.Roles.Remove(old); }
        foreach (var role in roles.Where(r => student.Roles.All(x => x.TeamRoleId != r.Id))) student.Roles.Add(new StudentTeamRole { TeamRole = role });
        await db.SaveChangesAsync(ct); return await references.StudentAsync(student.Id, ct);
    }
~~~

### RoomService.cs

Ánh xạ quy định, trạng thái, hồ sơ phòng và thành viên.

[src/TeamService/Services/RoomService.cs dòng 95–119](../../src/TeamService/Services/RoomService.cs#L95-L119)

~~~csharp
    internal static GroupTypeRule Rule(GroupType type)
    {
        return new GroupTypeRule(type.MinMemberCount, type.MaxMemberCount, type.MinMajorCount,
            type.Majors.Select(x => new MajorRule(x.Major.Code, x.MinQuantity, x.MaxQuantity)).ToArray());
    }

    private async Task<GroupTypeRule> CachedRuleAsync(Guid id, CancellationToken ct)
    {
        var (type, _) = await cache.GetOrCreateAsync(TeamCacheKeys.GroupType(id), TimeSpan.FromMinutes(configuration.GetValue("Cache:GroupTypeMinutes", 10)), token => references.GroupTypeAsync(id, token), ct);
        return new GroupTypeRule(type.MinMemberCount, type.MaxMemberCount, type.MinMajorCount,
            type.Majors.Select(x => new MajorRule(x.MajorCode, x.MinQuantity, x.MaxQuantity)).ToArray());
    }

    internal Task InvalidateStatsAsync(Guid courseId, CancellationToken ct) => cache.RemoveAsync(TeamCacheKeys.CourseStats(courseId), ct);

    internal static RoomDto Map(Room room)
    {
        return new RoomDto(room.Id, room.Code, room.Status.ToString(), room.MemberCount, room.Leader.FullName,
            room.Members.GroupBy(x => x.Student.Major.Code).Select(x => new MajorCountDto(x.Key, x.Count())).ToArray(),
            room.CreatedAt, room.CourseId, room.Course.Code, room.LeaderId,
            room.Members.Select(x => new RoomMemberDto(x.StudentId, x.Student.StudentCode, x.Student.FullName,
                x.Student.Major.Code, x.StudentId == room.LeaderId, x.JoinedAt) { Gpa = x.Student.Gpa, Roles = RoleDtos(x.Student) }).ToArray()) { Name = room.Name, ProjectName = room.ProjectName, IdeaDescription = room.IdeaDescription, RequiredGpa = room.RequiredGpa, TargetGrade = room.TargetGrade, NeededRoles = room.NeededRoles.Select(x => new RoleDto(x.TeamRole.Id, x.TeamRole.Code, x.TeamRole.Name)).ToArray() };
    }

    internal static RoleDto[] RoleDtos(Student student) => student.Roles.Select(x => new RoleDto(x.TeamRole.Id, x.TeamRole.Code, x.TeamRole.Name)).ToArray();
~~~

### ProfilePage.tsx

Giao diện nhập GPA và chọn vai trò.

[frontend/src/pages/student/ProfilePage.tsx dòng 1–92](../../frontend/src/pages/student/ProfilePage.tsx#L1-L92)

~~~tsx
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
~~~

### CreateRoomModal.tsx

Form tạo nhóm và chọn học phần đủ điều kiện.

[frontend/src/features/student/CreateRoomModal.tsx dòng 1–145](../../frontend/src/features/student/CreateRoomModal.tsx#L1-L145)

~~~tsx
import { useEffect, useState } from "react";
import { Col, Form, Input, InputNumber, Modal, Row, Select } from "antd";
import { useNavigate } from "react-router-dom";
import { coursesApi, referenceApi, roomsApi } from "@/api";
import type { Lookup, MyCourse, Room, RoomProfileRequest, TeamRole } from "@/api";
import { useApiAction, useShowError } from "@/components/useApiAction";
import { loadAllMyCourses } from "./loadMyCourses";

type Props = { open: boolean; onClose: () => void; course?: MyCourse; room?: Room; onSaved?: () => void };
export function CreateRoomModal({ open, onClose, course, room, onSaved }: Props) {
  const [form] = Form.useForm<RoomProfileRequest & { semesterId: string; courseId: string }>();
  const [courses, setCourses] = useState<MyCourse[]>([]);
  const [semesters, setSemesters] = useState<Lookup[]>([]);
  const [roles, setRoles] = useState<TeamRole[]>([]);
  const semesterId = Form.useWatch("semesterId", form);
  const navigate = useNavigate();
  const showError = useShowError();
  const [create, creating] = useApiAction(coursesApi.createRoom, "Đã tạo nhóm");
  const [update, updating] = useApiAction(roomsApi.updateProfile, "Đã lưu thông tin tuyển");
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(
      room
        ? { ...room, neededRoleIds: room.neededRoles.map((r) => r.id) }
        : { semesterId: course?.semesterId, courseId: course?.id, neededRoleIds: [] },
    );
    Promise.all([
      referenceApi.teamRoles(),
      referenceApi.semesters(),
      room ? Promise.resolve([]) : loadAllMyCourses(),
    ])
      .then(([r, s, c]) => {
        setRoles(r.items);
        setSemesters(s.items);
        setCourses(c);
      })
      .catch(showError);
  }, [open, course, room, form, showError]);
  const eligible = courses.filter((c) => c.status === "Forming" && !c.myRoom && !c.myGroup);
  return (
    <Modal
      title={room ? "Sửa thông tin tuyển" : "Tạo nhóm"}
      open={open}
      onCancel={onClose}
      okText={room ? "Lưu thay đổi" : "Lưu nhóm"}
      cancelText="Hủy"
      confirmLoading={creating || updating}
      onOk={() =>
        void form
          .validateFields()
          .then(async ({ semesterId: _semesterId, courseId, ...body }) => {
            if (room) {
              if (await update(room.id, body)) {
                onClose();
                onSaved?.();
              }
            } else {
              const result = await create(courseId, body);
              if (result) {
                onClose();
                navigate(`/student/rooms/${result.id}`);
              }
            }
          })
          .catch(() => {})
      }
    >
      <p>Thiết lập hồ sơ nhóm và định hướng dự án</p>
      <Form form={form} layout="vertical">
        {!room && (
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="semesterId" label="Kỳ" rules={[{ required: true }]}>
                <Select
                  disabled={!!course}
                  placeholder="Chọn kỳ"
                  options={semesters
                    .filter((s) => eligible.some((c) => c.semesterId === s.id))
                    .map((s) => ({ value: s.id, label: s.code }))}
                  onChange={() => form.setFieldValue("courseId", undefined)}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="courseId" label="Course" rules={[{ required: true }]}>
                <Select
                  disabled={!!course}
                  placeholder="Chọn Course"
                  options={eligible
                    .filter((c) => c.semesterId === semesterId)
                    .map((c) => ({ value: c.id, label: c.code }))}
                />
              </Form.Item>
            </Col>
          </Row>
        )}
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="name" label="Tên nhóm">
              <Input maxLength={100} placeholder="F-Spark Team" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="projectName" label="Tên dự án">
              <Input maxLength={200} placeholder="Không bắt buộc" />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="requiredGpa" label="GPA yêu cầu">
              <InputNumber
                min={0}
                max={4}
                step={0.01}
                precision={2}
                placeholder="2.5"
                style={{ width: "100%" }}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="targetGrade" label="Điểm mục tiêu">
              <InputNumber
                min={0}
                max={10}
                step={0.1}
                precision={2}
                placeholder="8.0"
                style={{ width: "100%" }}
              />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="neededRoleIds" label="Vai trò cần tuyển">
          <Select mode="multiple" maxCount={5} options={roles.map((r) => ({ value: r.id, label: r.name }))} />
        </Form.Item>
        <Form.Item name="ideaDescription" label="Mô tả ý tưởng">
          <Input.TextArea maxLength={1000} placeholder="Mô tả ngắn ý tưởng dự án" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
~~~
