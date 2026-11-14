using Exe.AuthService.Dtos;
using Exe.AuthService.Services;
using Exe.Contracts;
using Exe.Shared.Web.Paging;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
namespace Exe.AuthService.Controllers;
[ApiController, Route("api/users"), Authorize(Roles=Roles.Admin)]
public sealed class UsersController(IUserService service) : ControllerBase {
 [HttpGet] public async Task<ActionResult<PagedResult<UserResponse>>> List([FromQuery] UserQuery query,CancellationToken ct)=>Ok(await service.ListAsync(query,ct));
 [HttpGet("{id:guid}")] public async Task<ActionResult<UserResponse>> Get(Guid id,CancellationToken ct)=>Ok(await service.GetAsync(id,ct));
 [HttpPost] public async Task<ActionResult<UserResponse>> Create(CreateUserRequest request,CancellationToken ct) { var result=await service.CreateAsync(request,ct); return CreatedAtAction(nameof(Get),new { id=result.Id },result); }
 [HttpPut("{id:guid}")] public async Task<ActionResult<UserResponse>> Update(Guid id,UpdateUserRequest request,CancellationToken ct)=>Ok(await service.UpdateAsync(id,request,ct));
 [HttpPost("{id:guid}/reset-password")] public async Task<IActionResult> Reset(Guid id,ResetPasswordRequest request,CancellationToken ct) { await service.ResetAsync(id,request,ct); return NoContent(); }
 [HttpDelete("{id:guid}")] public async Task<IActionResult> Delete(Guid id,CancellationToken ct) { await service.DeleteAsync(id,ct); return NoContent(); }
}
