using Exe.Contracts;
using Exe.Shared.Web.Paging;
using Exe.TeamService.Dtos;
using Exe.TeamService.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Exe.TeamService.Controllers;

[ApiController]
[Authorize]
[Route("api/courses")]
public sealed class CoursesController(ICourseService service) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] CourseQuery query, CancellationToken ct) => Ok(await service.ListAsync(query, ct));

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct) => Ok(await service.GetAsync(id, ct));

    [HttpPost]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Create(CourseRequest request, CancellationToken ct)
    {
        var course = await service.CreateAsync(request, ct);
        return CreatedAtAction(nameof(Get), new { id = course.Id }, course);
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = Roles.AdminOrHead)]
    public async Task<IActionResult> Update(Guid id, UpdateCourseRequest request, CancellationToken ct) => Ok(await service.UpdateAsync(id, request, ct));

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await service.DeleteAsync(id, ct);
        return NoContent();
    }

    [HttpPost("{id:guid}/open")]
    [Authorize(Roles = Roles.AdminOrHead)]
    public async Task<IActionResult> Open(Guid id, CancellationToken ct) => Ok(await service.TransitionAsync(id, true, ct));

    [HttpPost("{id:guid}/close")]
    [Authorize(Roles = Roles.AdminOrHead)]
    public async Task<IActionResult> Close(Guid id, CancellationToken ct) => Ok(await service.TransitionAsync(id, false, ct));

    [HttpGet("{id:guid}/students")]
    [Authorize(Roles = Roles.Staff)]
    public async Task<IActionResult> Students(Guid id, [FromQuery] CourseStudentQuery query, CancellationToken ct) => Ok(await service.StudentsAsync(id, query, ct));

    [HttpPost("{id:guid}/students")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Enroll(Guid id, EnrollRequest request, CancellationToken ct) => Ok(await service.EnrollAsync(id, request.StudentIds, ct));

    [HttpDelete("{id:guid}/students/{studentId:guid}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Remove(Guid id, Guid studentId, CancellationToken ct)
    {
        await service.RemoveStudentAsync(id, studentId, ct);
        return NoContent();
    }

    [HttpGet("{id:guid}/stats")]
    [Authorize(Roles = Roles.Staff)]
    public async Task<IActionResult> Stats(Guid id, CancellationToken ct) => Ok(await service.StatsAsync(id, ct));

    [HttpGet("/api/me/courses")]
    [Authorize(Roles = Roles.Student)]
    public async Task<IActionResult> Mine([FromQuery] PageQuery query, CancellationToken ct) => Ok(await service.MyCoursesAsync(query, ct));
}
