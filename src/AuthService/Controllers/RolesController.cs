using Exe.AuthService.Dtos;
using Exe.AuthService.Services;
using Exe.Contracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
namespace Exe.AuthService.Controllers;
[ApiController, Route("api/roles"), Authorize(Roles=Roles.Admin)]
public sealed class RolesController(IUserService service) : ControllerBase { [HttpGet] public async Task<ActionResult<IReadOnlyList<RoleResponse>>> List(CancellationToken ct)=>Ok(await service.RolesAsync(ct)); }
