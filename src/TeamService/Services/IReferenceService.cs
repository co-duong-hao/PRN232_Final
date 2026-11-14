using Exe.Shared.Web.Paging;
using Exe.TeamService.Dtos;

namespace Exe.TeamService.Services;

public interface IReferenceService
{
    Task<PagedResult<LookupDto>> ListAsync(string kind, PageQuery query, CancellationToken ct);
    Task<LookupDto> GetAsync(string kind, Guid id, CancellationToken ct);
    Task<LookupDto> SaveAsync(string kind, Guid? id, LookupRequest request, CancellationToken ct);
    Task DeleteAsync(string kind, Guid id, CancellationToken ct);
    Task<PagedResult<StudentDto>> StudentsAsync(StudentQuery query, CancellationToken ct);
    Task<StudentDto> StudentAsync(Guid id, CancellationToken ct);
    Task<StudentDto> SaveStudentAsync(Guid? id, StudentRequest request, CancellationToken ct);
    Task DeleteStudentAsync(Guid id, CancellationToken ct);
    Task<PagedResult<GroupTypeDto>> GroupTypesAsync(PageQuery query, CancellationToken ct);
    Task<GroupTypeDto> GroupTypeAsync(Guid id, CancellationToken ct);
    Task<GroupTypeDto> SaveGroupTypeAsync(Guid? id, GroupTypeRequest request, CancellationToken ct);
    Task DeleteGroupTypeAsync(Guid id, CancellationToken ct);
}
