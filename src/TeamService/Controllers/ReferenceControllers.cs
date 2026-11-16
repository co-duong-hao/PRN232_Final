using Exe.TeamService.Infrastructure;
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
public sealed class GroupTypesController(IReferenceService service, ITeamCache cache, IConfiguration configuration, TeamMetrics metrics) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] PageQuery query, CancellationToken ct) => Ok(await service.GroupTypesAsync(query, ct));

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var (value, hit) = await cache.GetOrCreateAsync(TeamCacheKeys.GroupType(id), TimeSpan.FromMinutes(configuration.GetValue("Cache:GroupTypeMinutes", 10)), token => service.GroupTypeAsync(id, token), ct);
        metrics.CacheRequest("grouptype", hit);
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
