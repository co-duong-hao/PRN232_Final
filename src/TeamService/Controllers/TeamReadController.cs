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
