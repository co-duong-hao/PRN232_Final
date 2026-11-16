# Tìm phòng và tra cứu nhóm

Tài liệu tham chiếu cho PRN232 Final v0.4 tại commit 2e3789f.

[Mục lục bộ tài liệu](01-architecture.md)

## Cách hoạt động

Danh sách phòng áp dụng lọc trạng thái, GPA, vai trò cần tuyển và tìm tên. Role filter dùng quan hệ có ít nhất một mục khớp.

Phòng hủy được lọc khỏi danh sách với người không phải admin. Quyền xem Course, xem đơn của mình và đơn của phòng đi qua các kiểm tra khác nhau.

Kết quả lọc GPA biểu diễn mức GPA khai báo. Quyền tham gia thật vẫn được kiểm tra khi gọi endpoint ghi.

## Cách kiểm tra

1. Gọi danh sách với `roleIds` lặp lại để xem hành vi khớp một trong các vai trò.
2. Đối chiếu dữ liệu người xin với trường GPA và vai trò mà API trả cho trưởng phòng.

## Đối chiếu mã nguồn

Các trích đoạn dưới đây hỗ trợ tra cứu. Đường dẫn mở phần tương ứng trong repo.

### TeamReadController.cs

Endpoint đọc phòng, đơn và nhóm.

[src/TeamService/Controllers/TeamReadController.cs dòng 1–28](../../src/TeamService/Controllers/TeamReadController.cs#L1-L28)

~~~csharp
using Exe.Contracts;
using Exe.Shared.Web.Paging;
using Exe.TeamService.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Exe.TeamService.Controllers;

[ApiController]
[Authorize]
public sealed class TeamReadController(ITeamReadService service, IGroupService groups) : ControllerBase
{
    [HttpGet("api/courses/{courseId:guid}/rooms")]
    public async Task<IActionResult> Rooms(Guid courseId, [FromQuery] RoomListQuery query, CancellationToken ct) => Ok(await service.RoomsAsync(courseId, query, ct));

    [HttpGet("api/rooms/{roomId:guid}/applies")]
    public async Task<IActionResult> RoomApplies(Guid roomId, [FromQuery] ApplyListQuery query, CancellationToken ct) => Ok(await service.RoomAppliesAsync(roomId, query, ct));

    [HttpGet("api/me/applies")]
    [Authorize(Roles = Roles.Student)]
    public async Task<IActionResult> MyApplies([FromQuery] ApplyListQuery query, CancellationToken ct) => Ok(await service.MyAppliesAsync(query, ct));

    [HttpGet("api/courses/{courseId:guid}/groups")]
    public async Task<IActionResult> Groups(Guid courseId, [FromQuery] PageQuery query, CancellationToken ct) => Ok(await groups.GroupsAsync(courseId, query, ct));

    [HttpGet("api/groups/{id:guid}")]
    public async Task<IActionResult> Group(Guid id, CancellationToken ct) => Ok(await groups.GroupAsync(id, ct));
}
~~~

### TeamReadService.cs

Phân quyền đọc, tìm kiếm, lọc và phân trang.

[src/TeamService/Services/TeamReadService.cs dòng 1–137](../../src/TeamService/Services/TeamReadService.cs#L1-L137)

~~~csharp
using Exe.Contracts;
using Exe.Shared.Web.Auth;
using Exe.Shared.Web.Errors;
using Exe.Shared.Web.Paging;
using Exe.TeamService.Data;
using Exe.TeamService.Domain;
using Exe.TeamService.Dtos;
using Microsoft.EntityFrameworkCore;

namespace Exe.TeamService.Services;

public sealed class TeamReadService(TeamDbContext db, ICurrentUser user, RoomService rooms) : ITeamReadService, IGroupService
{
    private bool IsStaff => user.IsInRole(Roles.Admin) || user.IsInRole(Roles.HeadOfDepartment) || user.IsInRole(Roles.Lecturer);

    private async Task CheckCourseAsync(Guid id, CancellationToken ct)
    {
        if (!await db.Courses.AnyAsync(x => x.Id == id, ct))
        {
            throw new NotFoundException("Không tìm thấy Course.");
        }
        if (!IsStaff && user.IsInRole(Roles.Student))
        {
            var student = await rooms.CurrentStudentAsync(ct);
            await rooms.CheckEnrollmentAsync(id, student.Id, ct);
        }
    }

    private static PagedResult<TOut> MapPage<TIn, TOut>(PagedResult<TIn> page, Func<TIn, TOut> map)
    {
        return new PagedResult<TOut>(page.Items.Select(map).ToArray(), page.Page, page.PageSize, page.TotalItems);
    }

    public async Task<PagedResult<RoomSummaryDto>> RoomsAsync(Guid courseId, RoomListQuery query, CancellationToken ct)
    {
        await CheckCourseAsync(courseId, ct);
        var source = db.Rooms.Where(x => x.CourseId == courseId).Include(x => x.Course).Include(x => x.Leader)
            .Include(x => x.Members).ThenInclude(x => x.Student).ThenInclude(x => x.Major).Include(x => x.NeededRoles).ThenInclude(x => x.TeamRole).AsQueryable();
        if (!user.IsInRole(Roles.Admin)) source = source.Where(x => x.Status != RoomStatus.Cancelled);
        if (query.Gpa.HasValue) source = source.Where(x => x.RequiredGpa == null || (double)x.RequiredGpa.Value <= (double)query.Gpa.Value);
        if (query.RoleIds is { Length: > 0 }) source = source.Where(x => x.NeededRoles.Any(r => query.RoleIds.Contains(r.TeamRoleId)));
        if (!string.IsNullOrWhiteSpace(query.Q))
        {
            source = source.Where(x => x.Code.Contains(query.Q) || (x.Name != null && x.Name.Contains(query.Q)) || (x.ProjectName != null && x.ProjectName.Contains(query.Q)));
        }
        if (Enum.TryParse<RoomStatus>(query.Status, true, out var status))
        {
            source = source.Where(x => x.Status == status);
        }
        source = query.SortBy?.ToLowerInvariant() switch
        {
            "requiredgpa" => query.Descending ? source.OrderByDescending(x => (double?)x.RequiredGpa) : source.OrderBy(x => (double?)x.RequiredGpa),
            "targetgrade" => query.Descending ? source.OrderByDescending(x => (double?)x.TargetGrade) : source.OrderBy(x => (double?)x.TargetGrade),
            "createdat" => query.Descending ? source.OrderByDescending(x => x.CreatedAt) : source.OrderBy(x => x.CreatedAt),
            "membercount" => query.Descending ? source.OrderByDescending(x => x.MemberCount) : source.OrderBy(x => x.MemberCount),
            _ => query.Descending ? source.OrderByDescending(x => x.Code) : source.OrderBy(x => x.Code)
        };
        return MapPage(await source.ToPagedResultAsync(query, ct), x => new RoomSummaryDto(x.Id, x.Code, x.Status.ToString(), x.MemberCount, x.Leader.FullName,
            x.Members.GroupBy(m => m.Student.Major.Code).Select(m => new MajorCountDto(m.Key, m.Count())).ToArray(), x.CreatedAt) { Name = x.Name, ProjectName = x.ProjectName, IdeaDescription = x.IdeaDescription, RequiredGpa = x.RequiredGpa, TargetGrade = x.TargetGrade, NeededRoles = x.NeededRoles.Select(r => new RoleDto(r.TeamRole.Id, r.TeamRole.Code, r.TeamRole.Name)).ToArray() });
    }

    private static ApplyDto MapApply(RoomApply x)
    {
        return new ApplyDto(x.Id, x.RoomId, x.Room.Code, x.StudentId, x.Student.StudentCode, x.Student.FullName,
            x.Student.Major.Code, x.Message, x.Status.ToString(), x.DecidedAt, x.CreatedAt) { Gpa = x.Student.Gpa, Roles = RoomService.RoleDtos(x.Student) };
    }

    private async Task<PagedResult<ApplyDto>> AppliesAsync(IQueryable<RoomApply> source, ApplyListQuery query, CancellationToken ct)
    {
        source = source.Include(x => x.Room).Include(x => x.Student).ThenInclude(x => x.Major).Include(x => x.Student).ThenInclude(x => x.Roles).ThenInclude(x => x.TeamRole);
        if (Enum.TryParse<ApplyStatus>(query.Status, true, out var status))
        {
            source = source.Where(x => x.Status == status);
        }
        if (query.CourseId.HasValue)
        {
            source = source.Where(x => x.Room.CourseId == query.CourseId);
        }
        source = string.Equals(query.SortDir, "asc", StringComparison.OrdinalIgnoreCase)
            ? source.OrderBy(x => x.CreatedAt) : source.OrderByDescending(x => x.CreatedAt);
        return MapPage(await source.ToPagedResultAsync(query, ct), MapApply);
    }

    public async Task<PagedResult<ApplyDto>> RoomAppliesAsync(Guid roomId, ApplyListQuery query, CancellationToken ct)
    {
        var room = await rooms.LoadRoomAsync(roomId, ct);
        if (!IsStaff)
        {
            var student = await rooms.CurrentStudentAsync(ct);
            await rooms.CheckEnrollmentAsync(room.CourseId, student.Id, ct);
            RoomService.CheckLeader(room, student);
        }
        return await AppliesAsync(db.RoomApplies.Where(x => x.RoomId == roomId), query, ct);
    }

    public async Task<PagedResult<ApplyDto>> MyAppliesAsync(ApplyListQuery query, CancellationToken ct)
    {
        var student = await rooms.CurrentStudentAsync(ct);
        return await AppliesAsync(db.RoomApplies.Where(x => x.StudentId == student.Id), query, ct);
    }

    private static GroupDto MapGroup(Group group)
    {
        return new GroupDto(group.Id, group.Code, group.Name, group.CourseId, group.Course.Code, group.RoomId,
            group.GroupTypeId, group.GroupType.Name, group.CreatedAt, group.Members.Select(x => new GroupMemberDto(x.StudentId,
                x.Student.StudentCode, x.Student.FullName, x.Student.Major.Code, x.IsLeader)).ToArray());
    }

    private IQueryable<Group> GroupQuery()
    {
        return db.Groups.Include(x => x.Course).Include(x => x.GroupType)
            .Include(x => x.Members).ThenInclude(x => x.Student).ThenInclude(x => x.Major);
    }

    public async Task<PagedResult<GroupDto>> GroupsAsync(Guid courseId, PageQuery query, CancellationToken ct)
    {
        if (!await db.Courses.AnyAsync(x => x.Id == courseId, ct))
        {
            throw new NotFoundException("Không tìm thấy Course.");
        }
        var source = GroupQuery().Where(x => x.CourseId == courseId);
        if (!string.IsNullOrWhiteSpace(query.Q))
        {
            source = source.Where(x => x.Code.Contains(query.Q));
        }
        source = string.Equals(query.SortBy, "createdAt", StringComparison.OrdinalIgnoreCase)
            ? (query.Descending ? source.OrderByDescending(x => x.CreatedAt) : source.OrderBy(x => x.CreatedAt))
            : (query.Descending ? source.OrderByDescending(x => x.Code) : source.OrderBy(x => x.Code));
        return MapPage(await source.ToPagedResultAsync(query, ct), MapGroup);
    }

    public async Task<GroupDto> GroupAsync(Guid id, CancellationToken ct)
    {
        var group = await GroupQuery().SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw new NotFoundException("Không tìm thấy nhóm.");
        return MapGroup(group);
    }
}
~~~

### ITeamReadService.cs

Kiểu truy vấn và giao diện lớp đọc.

[src/TeamService/Services/ITeamReadService.cs dòng 1–30](../../src/TeamService/Services/ITeamReadService.cs#L1-L30)

~~~csharp
using Exe.Shared.Web.Paging;
using Exe.TeamService.Dtos;

namespace Exe.TeamService.Services;

public sealed class RoomListQuery : PageQuery
{
    public string? Status { get; set; }
    public decimal? Gpa { get; set; }
    public Guid[]? RoleIds { get; set; }
}

public sealed class ApplyListQuery : PageQuery
{
    public string? Status { get; set; }
    public Guid? CourseId { get; set; }
}

public interface ITeamReadService
{
    Task<PagedResult<RoomSummaryDto>> RoomsAsync(Guid courseId, RoomListQuery query, CancellationToken ct);
    Task<PagedResult<ApplyDto>> RoomAppliesAsync(Guid roomId, ApplyListQuery query, CancellationToken ct);
    Task<PagedResult<ApplyDto>> MyAppliesAsync(ApplyListQuery query, CancellationToken ct);
}

public interface IGroupService
{
    Task<PagedResult<GroupDto>> GroupsAsync(Guid courseId, PageQuery query, CancellationToken ct);
    Task<GroupDto> GroupAsync(Guid id, CancellationToken ct);
}
~~~

### GroupDetailPage.tsx

Cách web dùng phản hồi nhóm chính thức.

[frontend/src/pages/student/GroupDetailPage.tsx dòng 1–69](../../frontend/src/pages/student/GroupDetailPage.tsx#L1-L69)

~~~tsx
import { useEffect, useState } from "react";
import { Card, Empty, Spin, Table, Typography } from "antd";
import { StarFilled } from "@ant-design/icons";
import { useParams } from "react-router-dom";
import { groupsApi } from "@/api";
import type { Group } from "@/api";
import { MajorCounts } from "@/components/StatusTag";
import { formatDateTime } from "@/components/format";
import { useShowError } from "@/components/useApiAction";

export function GroupDetailPage() {
  const { groupId = "" } = useParams();
  const [group, setGroup] = useState<Group>();
  const [loading, setLoading] = useState(true);
  const showError = useShowError();
  useEffect(() => {
    setLoading(true);
    groupsApi
      .get(groupId)
      .then(setGroup)
      .catch(showError)
      .finally(() => setLoading(false));
  }, [groupId, showError]);
  const counts =
    group?.members.reduce<Record<string, number>>((a, m) => {
      a[m.majorCode] = (a[m.majorCode] ?? 0) + 1;
      return a;
    }, {}) ?? {};
  return (
    <Spin spinning={loading}>
      {group ? (
        <>
          <Typography.Title level={2}>Nhóm {group.code}</Typography.Title>
          <Card>
            <p>Course: {group.courseCode}</p>
            <p>Loại nhóm: {group.groupTypeName}</p>
            <p>Ngày thành lập: {formatDateTime(group.createdAt)}</p>
            <p>
              Số thành viên theo ngành:{" "}
              <MajorCounts
                majors={Object.entries(counts).map(([majorCode, count]) => ({ majorCode, count }))}
              />
            </p>
          </Card>
          <Typography.Title level={3}>Thành viên</Typography.Title>
          <Table
            rowKey="studentId"
            dataSource={group.members}
            pagination={false}
            columns={[
              { title: "Mã SV", dataIndex: "studentCode" },
              {
                title: "Họ tên",
                render: (_, m) => (
                  <>
                    {m.fullName} {m.isLeader && <StarFilled title="Trưởng nhóm" />}
                  </>
                ),
              },
              { title: "Ngành", dataIndex: "majorCode" },
            ]}
          />
        </>
      ) : (
        !loading && <Empty description="Không tìm thấy nhóm" />
      )}
    </Spin>
  );
}
~~~

### MyAppliesPage.tsx

Danh sách đơn của sinh viên.

[frontend/src/pages/student/MyAppliesPage.tsx dòng 1–92](../../frontend/src/pages/student/MyAppliesPage.tsx#L1-L92)

~~~tsx
import { useCallback, useEffect, useState } from "react";
import { Button, Empty, Popconfirm, Select, Space, Table, Typography } from "antd";
import { Link } from "react-router-dom";
import { appliesApi, meApi } from "@/api";
import type { ApplyStatus, RoomApply } from "@/api";
import { ApplyStatusTag } from "@/components/StatusTag";
import { applyStatusLabel } from "@/components/labels";
import { formatDateTime } from "@/components/format";
import { useApiAction, useShowError } from "@/components/useApiAction";

export function MyAppliesPage() {
  const [items, setItems] = useState<RoomApply[]>([]);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<ApplyStatus>();
  const [loading, setLoading] = useState(false);
  const showError = useShowError();
  const [cancel, cancelling] = useApiAction(appliesApi.cancel, "Đã hủy đơn");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await meApi.applies({ page, pageSize: size, status });
      setItems(data.items);
      setTotal(data.totalItems);
    } catch (e) {
      showError(e);
    } finally {
      setLoading(false);
    }
  }, [page, size, status, showError]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <>
      <Typography.Title level={2}>Đơn của tôi</Typography.Title>
      <Space direction="vertical" style={{ width: "100%" }}>
        <Select
          allowClear
          placeholder="Tất cả trạng thái"
          style={{ width: 200 }}
          value={status}
          onChange={(s) => {
            setStatus(s);
            setPage(1);
          }}
          options={Object.entries(applyStatusLabel).map(([value, label]) => ({ value, label: label.text }))}
        />
        <Table
          rowKey="id"
          loading={loading}
          dataSource={items}
          locale={{ emptyText: <Empty description="Không có đơn" /> }}
          pagination={{
            current: page,
            pageSize: size,
            total,
            showSizeChanger: true,
            onChange: (p, s) => {
              setPage(p);
              setSize(s);
            },
          }}
          columns={[
            { title: "Phòng", render: (_, a) => <Link to={`/student/rooms/${a.roomId}`}>{a.roomCode}</Link> },
            { title: "Trạng thái", render: (_, a) => <ApplyStatusTag status={a.status} /> },
            { title: "Lời nhắn", dataIndex: "message" },
            { title: "Ngày gửi", render: (_, a) => formatDateTime(a.createdAt) },
            { title: "Ngày xử lý", render: (_, a) => formatDateTime(a.decidedAt) },
            {
              title: "Thao tác",
              render: (_, a) =>
                a.status === "Pending" && (
                  <Popconfirm
                    title="Hủy đơn này?"
                    onConfirm={async () => {
                      if (await cancel(a.id)) await load();
                    }}
                    okText="Hủy đơn"
                    cancelText="Đóng"
                  >
                    <Button loading={cancelling}>Hủy đơn</Button>
                  </Popconfirm>
                ),
            },
          ]}
        />
      </Space>
    </>
  );
}
~~~
