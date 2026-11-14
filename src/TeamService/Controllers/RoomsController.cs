using Exe.Contracts;
using Exe.TeamService.Dtos;
using Exe.TeamService.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Exe.TeamService.Controllers;

[ApiController]
[Authorize]
public sealed class RoomsController(IRoomService rooms, IRoomApplyService applies) : ControllerBase
{
    [HttpGet("api/rooms/{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct) => Ok(await rooms.GetAsync(id, ct));

    [HttpPost("api/courses/{courseId:guid}/rooms")]
    [Authorize(Roles = Roles.Student)]
    public async Task<IActionResult> Create(Guid courseId, CancellationToken ct)
    {
        var room = await rooms.CreateAsync(courseId, ct);
        return CreatedAtAction(nameof(Get), new { id = room.Id }, room);
    }

    [HttpPost("api/rooms/{id:guid}/join")]
    [Authorize(Roles = Roles.Student)]
    public async Task<IActionResult> Join(Guid id, CancellationToken ct) => Ok(await rooms.JoinAsync(id, ct));

    [HttpPost("api/rooms/{id:guid}/leave")]
    [Authorize(Roles = Roles.Student)]
    public async Task<IActionResult> Leave(Guid id, CancellationToken ct)
    {
        await rooms.LeaveAsync(id, ct);
        return NoContent();
    }

    [HttpPut("api/rooms/{id:guid}/leader")]
    [Authorize(Roles = Roles.Student)]
    public async Task<IActionResult> ChangeLeader(Guid id, ChangeLeaderRequest request, CancellationToken ct) => Ok(await rooms.ChangeLeaderAsync(id, request.StudentId, ct));

    [HttpGet("api/rooms/{id:guid}/composition")]
    public async Task<IActionResult> Composition(Guid id, CancellationToken ct) => Ok(await rooms.CompositionAsync(id, ct));

    [HttpPost("api/rooms/{id:guid}/complete")]
    [Authorize(Roles = Roles.Student)]
    public async Task<IActionResult> Complete(Guid id, CancellationToken ct)
    {
        var group = await rooms.CompleteAsync(id, ct);
        return Created($"/api/groups/{group.Id}", group);
    }

    [HttpGet("api/courses/{courseId:guid}/rooms/recommendations")]
    [Authorize(Roles = Roles.Student)]
    public async Task<IActionResult> Recommend(Guid courseId, [FromQuery] int limit = 10, CancellationToken ct = default) => Ok(await rooms.RecommendAsync(courseId, limit, ct));

    [HttpPost("api/rooms/{id:guid}/applies")]
    [Authorize(Roles = Roles.Student)]
    public async Task<IActionResult> Apply(Guid id, CreateApplyRequest request, CancellationToken ct)
    {
        var apply = await applies.CreateAsync(id, request.Message, ct);
        return Created($"/api/room-applies/{apply.Id}", apply);
    }

    [HttpPost("api/room-applies/{id:guid}/approve")]
    [Authorize(Roles = Roles.Student)]
    public async Task<IActionResult> Approve(Guid id, CancellationToken ct) => Ok(await applies.DecideAsync(id, true, ct));

    [HttpPost("api/room-applies/{id:guid}/reject")]
    [Authorize(Roles = Roles.Student)]
    public async Task<IActionResult> Reject(Guid id, CancellationToken ct) => Ok(await applies.DecideAsync(id, false, ct));

    [HttpPost("api/room-applies/{id:guid}/cancel")]
    [Authorize(Roles = Roles.Student)]
    public async Task<IActionResult> Cancel(Guid id, CancellationToken ct) => Ok(await applies.CancelAsync(id, ct));
}
