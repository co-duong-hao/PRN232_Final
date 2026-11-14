using Exe.Shared.Web.Errors;
using Exe.Shared.Web.Paging;
using Exe.TeamService.Data;
using Exe.TeamService.Domain;
using Exe.TeamService.Dtos;
using Microsoft.EntityFrameworkCore;

namespace Exe.TeamService.Services;

public sealed class ReferenceService(TeamDbContext db) : IReferenceService
{
    private IQueryable<LookupDto> Lookups(string kind) => kind switch
    {
        "semesters" => db.Semesters.Select(x => new LookupDto { Id = x.Id, Code = x.Code, Name = x.Name, StartDate = x.StartDate, EndDate = x.EndDate }),
        "subjects" => db.Subjects.Select(x => new LookupDto { Id = x.Id, Code = x.Code, Name = x.Name }),
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
            default:
                throw new NotFoundException("Không tìm thấy tài nguyên.");
        }
        await db.SaveChangesAsync(ct);
    }

    private IQueryable<StudentDto> StudentQuery() => db.Students.Select(x => new StudentDto { Id = x.Id, UserId = x.UserId, StudentCode = x.StudentCode, FullName = x.FullName, Email = x.Email, MajorId = x.MajorId, MajorCode = x.Major.Code });

    public async Task<PagedResult<StudentDto>> StudentsAsync(StudentQuery query, CancellationToken ct)
    {
        var source = StudentQuery();
        if (query.MajorId.HasValue)
        {
            source = source.Where(x => x.MajorId == query.MajorId);
        }
        if (!string.IsNullOrWhiteSpace(query.Q))
        {
            source = source.Where(x => x.StudentCode.Contains(query.Q) || x.FullName.Contains(query.Q) || x.Email.Contains(query.Q));
        }
        source = string.Equals(query.SortBy, "fullName", StringComparison.OrdinalIgnoreCase)
            ? (query.Descending ? source.OrderByDescending(x => x.FullName) : source.OrderBy(x => x.FullName))
            : (query.Descending ? source.OrderByDescending(x => x.StudentCode) : source.OrderBy(x => x.StudentCode));
        return await source.ToPagedResultAsync(query, ct);
    }

    public async Task<StudentDto> StudentAsync(Guid id, CancellationToken ct)
    {
        return await StudentQuery().SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw new NotFoundException("Không tìm thấy sinh viên.");
    }

    public async Task<StudentDto> SaveStudentAsync(Guid? id, StudentRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.StudentCode) || request.StudentCode.Length > 20 || string.IsNullOrWhiteSpace(request.FullName) ||
            request.FullName.Length > 200 || string.IsNullOrWhiteSpace(request.Email) || request.Email.Length > 256 || request.UserId == Guid.Empty)
        {
            throw new BadRequestException("Dữ liệu sinh viên không hợp lệ.");
        }
        if (!await db.Majors.AnyAsync(x => x.Id == request.MajorId, ct))
        {
            throw new NotFoundException("Không tìm thấy ngành.");
        }
        if (await db.Students.AnyAsync(x => (x.StudentCode == request.StudentCode || x.UserId == request.UserId) && x.Id != id, ct))
        {
            throw new BusinessRuleException("CODE_EXISTS", "Mã sinh viên hoặc tài khoản đã tồn tại.");
        }
        var student = id.HasValue ? await db.Students.FindAsync([id.Value], ct) : new Student();
        if (student is null)
        {
            throw new NotFoundException("Không tìm thấy sinh viên.");
        }
        student.UserId = request.UserId;
        student.StudentCode = request.StudentCode;
        student.FullName = request.FullName;
        student.Email = request.Email;
        student.MajorId = request.MajorId;
        if (!id.HasValue)
        {
            db.Students.Add(student);
        }
        await db.SaveChangesAsync(ct);
        return await StudentAsync(student.Id, ct);
    }

    public async Task DeleteStudentAsync(Guid id, CancellationToken ct)
    {
        var student = await db.Students.FindAsync([id], ct) ?? throw new NotFoundException("Không tìm thấy sinh viên.");
        if (await db.StudentInCourses.AnyAsync(x => x.StudentId == id, ct) || await db.StudentInRooms.AnyAsync(x => x.StudentId == id, ct) ||
            await db.Rooms.AnyAsync(x => x.LeaderId == id, ct) || await db.RoomApplies.AnyAsync(x => x.StudentId == id || x.DecidedBy == id, ct) ||
            await db.StudentInGroups.AnyAsync(x => x.StudentId == id, ct))
        {
            throw new BusinessRuleException("IN_USE", "Sinh viên đang được sử dụng.");
        }
        db.Students.Remove(student);
        await db.SaveChangesAsync(ct);
    }

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
    }
}
