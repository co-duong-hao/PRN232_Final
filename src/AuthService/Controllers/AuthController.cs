using Exe.AuthService.Dtos;
using Exe.AuthService.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
namespace Exe.AuthService.Controllers;
[ApiController, Route("api/auth"), Authorize]
public sealed class AuthController(IAuthService service) : ControllerBase {
 [HttpPost("login"), AllowAnonymous] public async Task<ActionResult<LoginResponse>> Login(LoginRequest request,CancellationToken ct)=>Ok(await service.LoginAsync(request,ct));
 [HttpGet("me")] public async Task<ActionResult<UserResponse>> Me(CancellationToken ct)=>Ok(await service.MeAsync(ct));
}
