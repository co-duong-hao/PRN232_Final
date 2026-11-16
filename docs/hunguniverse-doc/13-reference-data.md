# Danh mục và loại nhóm

Tài liệu tham chiếu cho PRN232 Final v0.4 tại commit 2e3789f.

[Mục lục bộ tài liệu](01-architecture.md)

## Cách hoạt động

Semester, Subject, Major và TeamRole dùng chung controller danh mục. Chức năng ghi áp dụng quyền quản lý phù hợp.

GroupType quy định số thành viên tối thiểu và tối đa, số ngành tối thiểu và giới hạn mỗi ngành. Đây là dữ liệu cho MatchingService.

Khi sửa hoặc xóa loại nhóm hợp lệ, code xóa mục cache tương ứng. Quy trình tạo loại nhóm nên thử cả các bộ tham số không thể thỏa mãn, như số ngành lớn hơn số thành viên tối đa.

## Cách kiểm tra

1. Đọc `/api/team-roles` và xác nhận giá trị vừa truy vấn là vai trò tuyển thành viên.
2. Thử sửa GroupType của một Course đang dùng để xác nhận API trả lỗi theo thiết kế.

## Đối chiếu mã nguồn

Các trích đoạn dưới đây hỗ trợ tra cứu. Đường dẫn mở phần tương ứng trong repo.

### ReferenceControllers.cs

Các endpoint danh mục, hồ sơ và loại nhóm.

[src/TeamService/Controllers/ReferenceControllers.cs dòng 1–110](../../src/TeamService/Controllers/ReferenceControllers.cs#L1-L110)

~~~csharp
using Exe.Contracts;
using Exe.TeamService.Infrastructure.Caching;
using Exe.Shared.Web.Paging;
using Exe.TeamService.Dtos;
using Exe.TeamService.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Exe.TeamService.Controllers;

[ApiController]
[Authorize]
[Route("api/{kind:regex(^(semesters|subjects|majors|team-roles)$)}")]
public sealed class LookupsController(IReferenceService service) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List(string kind, [FromQuery] PageQuery query, CancellationToken ct) => Ok(await service.ListAsync(kind, query, ct));

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(string kind, Guid id, CancellationToken ct) => Ok(await service.GetAsync(kind, id, ct));

    [HttpPost]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Create(string kind, LookupRequest request, CancellationToken ct)
    {
        var result = await service.SaveAsync(kind, null, request, ct);
        return CreatedAtAction(nameof(Get), new { kind, id = result.Id }, result);
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Update(string kind, Guid id, LookupRequest request, CancellationToken ct) => Ok(await service.SaveAsync(kind, id, request, ct));

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Delete(string kind, Guid id, CancellationToken ct)
    {
        await service.DeleteAsync(kind, id, ct);
        return NoContent();
    }
}

[ApiController]
[Authorize(Roles = Roles.Staff)]
[Route("api/students")]
public sealed class StudentsController(IReferenceService service) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] StudentQuery query, CancellationToken ct) => Ok(await service.StudentsAsync(query, ct));

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct) => Ok(await service.StudentAsync(id, ct));

    [HttpPost]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Create(StudentRequest request, CancellationToken ct)
    {
        var result = await service.SaveStudentAsync(null, request, ct);
        return CreatedAtAction(nameof(Get), new { id = result.Id }, result);
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Update(Guid id, StudentRequest request, CancellationToken ct) => Ok(await service.SaveStudentAsync(id, request, ct));

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await service.DeleteStudentAsync(id, ct);
        return NoContent();
    }
}

[ApiController]
[Authorize]
[Route("api/group-types")]
public sealed class GroupTypesController(IReferenceService service, ITeamCache cache, IConfiguration configuration) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] PageQuery query, CancellationToken ct) => Ok(await service.GroupTypesAsync(query, ct));

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var (value, hit) = await cache.GetOrCreateAsync(TeamCacheKeys.GroupType(id), TimeSpan.FromMinutes(configuration.GetValue("Cache:GroupTypeMinutes", 10)), token => service.GroupTypeAsync(id, token), ct);
        Response.Headers["X-Cache"] = hit ? "HIT" : "MISS";
        return Ok(value);
    }

    [HttpPost]
    [Authorize(Roles = Roles.AdminOrHead)]
    public async Task<IActionResult> Create(GroupTypeRequest request, CancellationToken ct)
    {
        var result = await service.SaveGroupTypeAsync(null, request, ct);
        return CreatedAtAction(nameof(Get), new { id = result.Id }, result);
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = Roles.AdminOrHead)]
    public async Task<IActionResult> Update(Guid id, GroupTypeRequest request, CancellationToken ct) => Ok(await service.SaveGroupTypeAsync(id, request, ct));

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = Roles.AdminOrHead)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await service.DeleteGroupTypeAsync(id, ct);
        return NoContent();
    }
}
~~~

### ReferenceService.cs

Tra cứu và chỉnh sửa danh mục dùng chung.

[src/TeamService/Services/ReferenceService.cs dòng 13–148](../../src/TeamService/Services/ReferenceService.cs#L13-L148)

~~~csharp
    private IQueryable<LookupDto> Lookups(string kind) => kind switch
    {
        "semesters" => db.Semesters.Select(x => new LookupDto { Id = x.Id, Code = x.Code, Name = x.Name, StartDate = x.StartDate, EndDate = x.EndDate }),
        "subjects" => db.Subjects.Select(x => new LookupDto { Id = x.Id, Code = x.Code, Name = x.Name }),
        "team-roles" => db.TeamRoles.Select(x => new LookupDto { Id = x.Id, Code = x.Code, Name = x.Name }),
        "majors" => db.Majors.Select(x => new LookupDto { Id = x.Id, Code = x.Code, Name = x.Name }),
        _ => throw new NotFoundException("Không tìm thấy tài nguyên.")
    };

    public async Task<PagedResult<LookupDto>> ListAsync(string kind, PageQuery query, CancellationToken ct)
    {
        var source = Lookups(kind);
        if (!string.IsNullOrWhiteSpace(query.Q))
        {
            source = source.Where(x => x.Code.Contains(query.Q) || x.Name.Contains(query.Q));
        }
        source = query.SortBy?.ToLowerInvariant() switch
        {
            "name" when kind != "semesters" => query.Descending ? source.OrderByDescending(x => x.Name) : source.OrderBy(x => x.Name),
            "startdate" when kind == "semesters" => query.Descending ? source.OrderByDescending(x => x.StartDate) : source.OrderBy(x => x.StartDate),
            _ => query.Descending ? source.OrderByDescending(x => x.Code) : source.OrderBy(x => x.Code)
        };
        return await source.ToPagedResultAsync(query, ct);
    }

    public async Task<LookupDto> GetAsync(string kind, Guid id, CancellationToken ct)
    {
        return await Lookups(kind).SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw new NotFoundException("Không tìm thấy tài nguyên.");
    }

    public async Task<LookupDto> SaveAsync(string kind, Guid? id, LookupRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Code) || string.IsNullOrWhiteSpace(request.Name) || request.Code.Length > 20 ||
            request.Name.Length > (kind == "subjects" ? 200 : 100) || (kind == "semesters" && (!request.StartDate.HasValue || !request.EndDate.HasValue || request.EndDate < request.StartDate)))
        {
            throw new BadRequestException("Dữ liệu không hợp lệ.");
        }
        if (await Lookups(kind).AnyAsync(x => x.Code == request.Code && x.Id != id, ct))
        {
            throw new BusinessRuleException("CODE_EXISTS", "Mã đã tồn tại.");
        }
        var key = id ?? Guid.NewGuid();
        switch (kind)
        {
            case "semesters":
                var semester = id.HasValue ? await db.Semesters.FindAsync([key], ct) : new Semester { Id = key };
                if (semester is null)
                {
                    throw new NotFoundException("Không tìm thấy học kỳ.");
                }
                semester.Code = request.Code;
                semester.Name = request.Name;
                semester.StartDate = request.StartDate!.Value;
                semester.EndDate = request.EndDate!.Value;
                if (!id.HasValue)
                {
                    db.Semesters.Add(semester);
                }
                break;
            case "subjects":
                var subject = id.HasValue ? await db.Subjects.FindAsync([key], ct) : new Subject { Id = key };
                if (subject is null)
                {
                    throw new NotFoundException("Không tìm thấy môn học.");
                }
                subject.Code = request.Code;
                subject.Name = request.Name;
                if (!id.HasValue)
                {
                    db.Subjects.Add(subject);
                }
                break;
            case "majors":
                var major = id.HasValue ? await db.Majors.FindAsync([key], ct) : new Major { Id = key };
                if (major is null)
                {
                    throw new NotFoundException("Không tìm thấy ngành.");
                }
                major.Code = request.Code;
                major.Name = request.Name;
                if (!id.HasValue)
                {
                    db.Majors.Add(major);
                }
                break;
            case "team-roles":
                var role = id.HasValue ? await db.TeamRoles.FindAsync([key], ct) : new TeamRole { Id = key };
                if (role is null) throw new NotFoundException("Không tìm thấy vai trò.");
                role.Code = request.Code; role.Name = request.Name;
                if (!id.HasValue) db.TeamRoles.Add(role);
                break;
            default:
                throw new NotFoundException("Không tìm thấy tài nguyên.");
        }
        await db.SaveChangesAsync(ct);
        return await GetAsync(kind, key, ct);
    }

    public async Task DeleteAsync(string kind, Guid id, CancellationToken ct)
    {
        switch (kind)
        {
            case "semesters":
                var semester = await db.Semesters.FindAsync([id], ct) ?? throw new NotFoundException("Không tìm thấy học kỳ.");
                if (await db.Courses.AnyAsync(x => x.SemesterId == id, ct))
                {
                    throw new BusinessRuleException("IN_USE", "Học kỳ đang được sử dụng.");
                }
                db.Semesters.Remove(semester);
                break;
            case "subjects":
                var subject = await db.Subjects.FindAsync([id], ct) ?? throw new NotFoundException("Không tìm thấy môn học.");
                if (await db.Courses.AnyAsync(x => x.SubjectId == id, ct))
                {
                    throw new BusinessRuleException("IN_USE", "Môn học đang được sử dụng.");
                }
                db.Subjects.Remove(subject);
                break;
            case "majors":
                var major = await db.Majors.FindAsync([id], ct) ?? throw new NotFoundException("Không tìm thấy ngành.");
                if (await db.Students.AnyAsync(x => x.MajorId == id, ct) || await db.GroupTypeMajors.AnyAsync(x => x.MajorId == id, ct))
                {
                    throw new BusinessRuleException("IN_USE", "Ngành đang được sử dụng.");
                }
                db.Majors.Remove(major);
                break;
            case "team-roles":
                var role = await db.TeamRoles.FindAsync([id], ct) ?? throw new NotFoundException("Không tìm thấy vai trò.");
                if (await db.StudentTeamRoles.AnyAsync(x => x.TeamRoleId == id, ct) || await db.RoomNeededRoles.AnyAsync(x => x.TeamRoleId == id, ct)) throw new BusinessRuleException("IN_USE", "Vai trò đang được sử dụng.");
                db.TeamRoles.Remove(role); break;
            default: throw new NotFoundException("Không tìm thấy tài nguyên.");
        }
        await db.SaveChangesAsync(ct);
    }

    private IQueryable<StudentDto> StudentQuery() => db.Students.Select(x => new StudentDto { Id = x.Id, UserId = x.UserId, StudentCode = x.StudentCode, FullName = x.FullName, Email = x.Email, MajorId = x.MajorId, MajorCode = x.Major.Code, Gpa = x.Gpa, Roles = x.Roles.Select(r => new RoleDto(r.TeamRole.Id, r.TeamRole.Code, r.TeamRole.Name)).ToArray() });
~~~

### ReferenceService.cs

Đọc và ghi cấu hình GroupType cùng quy định theo ngành.

[src/TeamService/Services/ReferenceService.cs dòng 218–310](../../src/TeamService/Services/ReferenceService.cs#L218-L310)

~~~csharp
    private static GroupTypeDto MapGroupType(GroupType x)
    {
        return new GroupTypeDto(x.Id, x.Name, x.MinMemberCount, x.MaxMemberCount, x.MinMajorCount,
            x.Majors.Select(m => new GroupTypeMajorDto(m.MajorId, m.Major.Code, m.MinQuantity, m.MaxQuantity)).ToArray());
    }

    public async Task<PagedResult<GroupTypeDto>> GroupTypesAsync(PageQuery query, CancellationToken ct)
    {
        var source = db.GroupTypes.Include(x => x.Majors).ThenInclude(x => x.Major).AsQueryable();
        if (!string.IsNullOrWhiteSpace(query.Q))
        {
            source = source.Where(x => x.Name.Contains(query.Q));
        }
        source = query.Descending ? source.OrderByDescending(x => x.Name) : source.OrderBy(x => x.Name);
        var page = await source.ToPagedResultAsync(query, ct);
        return new PagedResult<GroupTypeDto>(page.Items.Select(MapGroupType).ToArray(), page.Page, page.PageSize, page.TotalItems);
    }

    public async Task<GroupTypeDto> GroupTypeAsync(Guid id, CancellationToken ct)
    {
        var type = await db.GroupTypes.Include(x => x.Majors).ThenInclude(x => x.Major).SingleOrDefaultAsync(x => x.Id == id, ct)
            ?? throw new NotFoundException("Không tìm thấy loại nhóm.");
        return MapGroupType(type);
    }

    public async Task<GroupTypeDto> SaveGroupTypeAsync(Guid? id, GroupTypeRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Name) || request.Name.Length > 100 || request.MinMemberCount < 1 ||
            request.MinMemberCount > request.MaxMemberCount || request.MinMajorCount < 1 || request.Majors is null ||
            request.Majors.Any(x => x.MinQuantity < 0 || x.MinQuantity > x.MaxQuantity || x.MaxQuantity > request.MaxMemberCount) ||
            request.Majors.Sum(x => x.MinQuantity) > request.MaxMemberCount || request.Majors.Select(x => x.MajorId).Distinct().Count() != request.Majors.Count)
        {
            throw new BadRequestException("Cơ cấu loại nhóm không hợp lệ.");
        }
        var ids = request.Majors.Select(x => x.MajorId).ToArray();
        if (await db.Majors.CountAsync(x => ids.Contains(x.Id), ct) != ids.Length)
        {
            throw new NotFoundException("Không tìm thấy ngành.");
        }
        var type = id.HasValue ? await db.GroupTypes.Include(x => x.Majors).SingleOrDefaultAsync(x => x.Id == id.Value, ct) : new GroupType();
        if (type is null)
        {
            throw new NotFoundException("Không tìm thấy loại nhóm.");
        }
        if (id.HasValue && await db.Courses.AnyAsync(x => x.GroupTypeId == id && x.Status != CourseStatus.Planned, ct))
        {
            throw new BusinessRuleException("IN_USE", "Loại nhóm đang được Course sử dụng.");
        }
        type.Name = request.Name;
        type.MinMemberCount = request.MinMemberCount;
        type.MaxMemberCount = request.MaxMemberCount;
        type.MinMajorCount = request.MinMajorCount;
        if (!id.HasValue)
        {
            db.GroupTypes.Add(type);
        }
        foreach (var old in type.Majors.ToArray())
        {
            var replacement = request.Majors.SingleOrDefault(x => x.MajorId == old.MajorId);
            if (replacement is null)
            {
                db.GroupTypeMajors.Remove(old);
            }
            else
            {
                old.MinQuantity = replacement.MinQuantity;
                old.MaxQuantity = replacement.MaxQuantity;
            }
        }
        foreach (var item in request.Majors.Where(x => type.Majors.All(m => m.MajorId != x.MajorId)))
        {
            type.Majors.Add(new GroupTypeMajor { MajorId = item.MajorId, MinQuantity = item.MinQuantity, MaxQuantity = item.MaxQuantity });
        }
        await db.SaveChangesAsync(ct);
        await cache.RemoveAsync(TeamCacheKeys.GroupType(type.Id), ct);
        db.ChangeTracker.Clear();
        return await GroupTypeAsync(type.Id, ct);
    }

    public async Task DeleteGroupTypeAsync(Guid id, CancellationToken ct)
    {
        var type = await db.GroupTypes.Include(x => x.Majors).SingleOrDefaultAsync(x => x.Id == id, ct)
            ?? throw new NotFoundException("Không tìm thấy loại nhóm.");
        if (await db.Courses.AnyAsync(x => x.GroupTypeId == id, ct) || await db.Groups.AnyAsync(x => x.GroupTypeId == id, ct))
        {
            throw new BusinessRuleException("IN_USE", "Loại nhóm đang được sử dụng.");
        }
        db.GroupTypeMajors.RemoveRange(type.Majors);
        db.GroupTypes.Remove(type);
        await db.SaveChangesAsync(ct);
        await cache.RemoveAsync(TeamCacheKeys.GroupType(id), ct);
    }
}
~~~

### ReferenceDtos.cs

Mô hình đầu vào và đầu ra danh mục.

[src/TeamService/Dtos/ReferenceDtos.cs dòng 1–26](../../src/TeamService/Dtos/ReferenceDtos.cs#L1-L26)

~~~csharp
using Exe.Shared.Web.Paging;

namespace Exe.TeamService.Dtos;

public sealed record LookupRequest(string Code, string Name, DateTime? StartDate, DateTime? EndDate);
public sealed record LookupDto(Guid Id, string Code, string Name, DateTime? StartDate, DateTime? EndDate)
{
    public LookupDto() : this(default, "", "", null, null) { }
}
public sealed record StudentRequest(Guid UserId, string StudentCode, string FullName, string Email, Guid MajorId);
public sealed record RoleDto(Guid Id, string Code, string Name);
public sealed record StudentProfileRequest(decimal? Gpa, IReadOnlyList<Guid> RoleIds);
public sealed record StudentDto(Guid Id, Guid UserId, string StudentCode, string FullName, string Email, Guid MajorId, string MajorCode)
{
    public StudentDto() : this(default, default, "", "", "", default, "") { }
    public decimal? Gpa { get; init; }
    public IReadOnlyList<RoleDto> Roles { get; init; } = [];
}
public sealed class StudentQuery : PageQuery
{
    public Guid? MajorId { get; set; }
}
public sealed record GroupTypeMajorDto(Guid MajorId, string MajorCode, int MinQuantity, int MaxQuantity);
public sealed record GroupTypeMajorRequest(Guid MajorId, int MinQuantity, int MaxQuantity);
public sealed record GroupTypeRequest(string Name, int MinMemberCount, int MaxMemberCount, int MinMajorCount, IReadOnlyList<GroupTypeMajorRequest> Majors);
public sealed record GroupTypeDto(Guid Id, string Name, int MinMemberCount, int MaxMemberCount, int MinMajorCount, IReadOnlyList<GroupTypeMajorDto> Majors);
~~~
