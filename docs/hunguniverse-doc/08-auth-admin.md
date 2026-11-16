# Quản trị tài khoản

Tài liệu tham chiếu cho PRN232 Final v0.4 tại commit 2e3789f.

[Mục lục bộ tài liệu](01-architecture.md)

## Cách hoạt động

API quản trị tài khoản phân quyền theo `Admin`. Các thao tác tạo, sửa, đổi mật khẩu và đọc danh sách có những hợp đồng riêng.

Danh mục `Role` ở AuthService phục vụ quyền hệ thống. `TeamRole` ở TeamDb biểu diễn kỹ năng hoặc vai trò tuyển thành viên.

Khi kiểm tra account bị vô hiệu hóa, xác minh cả trạng thái tài khoản và kết quả đăng nhập với yêu cầu mới.

## Cách kiểm tra

1. Thử danh sách `/api/users` bằng tài khoản admin và sinh viên để đối chiếu quyền.
2. Kiểm tra tính nhất quán giữa mã vai trò nhập vào và danh mục do `/api/roles` trả về.

## Đối chiếu mã nguồn

Các trích đoạn dưới đây hỗ trợ tra cứu. Đường dẫn mở phần tương ứng trong repo.

### UsersController.cs

Các endpoint quản trị tài khoản.

[src/AuthService/Controllers/UsersController.cs dòng 1–45](../../src/AuthService/Controllers/UsersController.cs#L1-L45)

~~~csharp
using Exe.AuthService.Dtos;
using Exe.AuthService.Services;
using Exe.Contracts;
using Exe.Shared.Web.Paging;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Exe.AuthService.Controllers;

[ApiController, Route("api/users"), Authorize(Roles = Roles.Admin)]
public sealed class UsersController(IUserService service) : ControllerBase
{
    [HttpGet]

    public async Task<ActionResult<PagedResult<UserResponse>>> List([FromQuery] UserQuery query, CancellationToken ct) => Ok(await service.ListAsync(query, ct));
    [HttpGet("{id:guid}")]

    public async Task<ActionResult<UserResponse>> Get(Guid id, CancellationToken ct) => Ok(await service.GetAsync(id, ct));
    [HttpPost]

    public async Task<ActionResult<UserResponse>> Create(CreateUserRequest request, CancellationToken ct)
    {
        var result = await service.CreateAsync(request, ct);
        return CreatedAtAction(nameof(Get), new { id = result.Id }, result);
    }

    [HttpPut("{id:guid}")]

    public async Task<ActionResult<UserResponse>> Update(Guid id, UpdateUserRequest request, CancellationToken ct) => Ok(await service.UpdateAsync(id, request, ct));
    [HttpPost("{id:guid}/reset-password")]

    public async Task<IActionResult> Reset(Guid id, ResetPasswordRequest request, CancellationToken ct)
    {
        await service.ResetAsync(id, request, ct);
        return NoContent();
    }

    [HttpDelete("{id:guid}")]

    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await service.DeleteAsync(id, ct);
        return NoContent();
    }
}
~~~

### RolesController.cs

Danh sách vai trò hệ thống.

[src/AuthService/Controllers/RolesController.cs dòng 1–15](../../src/AuthService/Controllers/RolesController.cs#L1-L15)

~~~csharp
using Exe.AuthService.Dtos;
using Exe.AuthService.Services;
using Exe.Contracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Exe.AuthService.Controllers;

[ApiController, Route("api/roles"), Authorize(Roles = Roles.Admin)]
public sealed class RolesController(IUserService service) : ControllerBase
{
    [HttpGet]

    public async Task<ActionResult<IReadOnlyList<RoleResponse>>> List(CancellationToken ct) => Ok(await service.RolesAsync(ct));
}
~~~

### UserService.cs

Thực thi luồng quản trị tài khoản.

[src/AuthService/Services/UserService.cs dòng 1–119](../../src/AuthService/Services/UserService.cs#L1-L119)

~~~csharp
using Exe.AuthService.Domain;
using Exe.AuthService.Dtos;
using Exe.AuthService.Repositories;
using Exe.Contracts;
using Exe.Shared.Web.Auth;
using Exe.Shared.Web.Errors;
using Exe.Shared.Web.Paging;
using Microsoft.AspNetCore.Identity;

namespace Exe.AuthService.Services;

public sealed class UserService(IUserRepository repo, IPasswordHasher<User> hasher, ICurrentUser current) : IUserService
{
    public static UserResponse Map(User u) => new(u.Id, u.Email, u.FullName, u.Status, u.UserRoles.Select(x => x.Role.Code).OrderBy(x => x).ToArray(), u.CreatedAt);

    private async Task<User> Find(Guid id, CancellationToken ct) => await repo.FindAsync(id, ct) ?? throw new NotFoundException("Không tìm thấy tài khoản.");

    private async Task<List<Role>> Resolve(string[] codes, CancellationToken ct)
    {
        var roles = await repo.RolesAsync(ct);
        var result = roles.Where(x => codes.Contains(x.Code, StringComparer.Ordinal)).ToList();
        if (result.Count != codes.Distinct(StringComparer.Ordinal).Count())
            throw new BadRequestException("Role không tồn tại.");
        return result;
    }


    public async Task<PagedResult<UserResponse>> ListAsync(UserQuery q, CancellationToken ct)
    {
        var query = repo.Query();
        if (!string.IsNullOrWhiteSpace(q.Q))
        {
            var s = q.Q.Trim().ToLowerInvariant();
            query = query.Where(x => x.Email.Contains(s) || x.FullName.ToLower().Contains(s));
        }

        if (!string.IsNullOrWhiteSpace(q.Role))
            query = query.Where(x => x.UserRoles.Any(r => r.Role.Code == q.Role));
        if (q.Status.HasValue)
            query = query.Where(x => x.Status == q.Status);
        query = (q.SortBy?.ToLowerInvariant(), q.Descending) switch
        {
            ("fullname", false) => query.OrderBy(x => x.FullName),
            ("fullname", true) => query.OrderByDescending(x => x.FullName),
            ("createdat", false) => query.OrderBy(x => x.CreatedAt),
            ("createdat", true) => query.OrderByDescending(x => x.CreatedAt),
            (_, true) => query.OrderByDescending(x => x.Email),
            _ => query.OrderBy(x => x.Email)
        };
        var page = await query.ToPagedResultAsync(q, ct);
        return new(page.Items.Select(Map).ToList(), page.Page, page.PageSize, page.TotalItems);
    }


    public async Task<UserResponse> GetAsync(Guid id, CancellationToken ct) => Map(await Find(id, ct));

    public async Task<UserResponse> CreateAsync(CreateUserRequest r, CancellationToken ct)
    {
        var email = r.Email.Trim().ToLowerInvariant();
        if (await repo.FindEmailAsync(email, ct) is not null)
            throw new BusinessRuleException("EMAIL_EXISTS", "Email đã tồn tại.");
        if (r.Password.Length < 8)
            throw new BadRequestException("Mật khẩu phải có ít nhất 8 ký tự.");
        var roles = await Resolve(r.Roles, ct);
        var u = new User
        {
            Email = email,
            FullName = r.FullName
        };
        u.PasswordHash = hasher.HashPassword(u, r.Password);
        foreach (var role in roles)
            u.UserRoles.Add(new UserRole { User = u, Role = role });
        repo.Add(u);
        await repo.SaveAsync(ct);
        return Map(u);
    }


    public async Task<UserResponse> UpdateAsync(Guid id, UpdateUserRequest r, CancellationToken ct)
    {
        var u = await Find(id, ct);
        var roles = await Resolve(r.Roles, ct);
        if (id == current.UserId && (r.Status != UserStatus.Active || !roles.Any(x => x.Code == Roles.Admin)))
            throw new BusinessRuleException("CANNOT_MODIFY_SELF", "Không thể tự hạ quyền hoặc vô hiệu hóa tài khoản.");
        if (!Enum.IsDefined(r.Status))
            throw new BadRequestException("Trạng thái không hợp lệ.");
        u.FullName = r.FullName;
        u.Status = r.Status;
        foreach (var old in u.UserRoles.Where(x => !roles.Any(r => r.Id == x.RoleId)).ToList())
            u.UserRoles.Remove(old);
        foreach (var role in roles.Where(r => !u.UserRoles.Any(x => x.RoleId == r.Id)))
            u.UserRoles.Add(new UserRole { User = u, Role = role });
        await repo.SaveAsync(ct);
        return Map(u);
    }


    public async Task ResetAsync(Guid id, ResetPasswordRequest r, CancellationToken ct)
    {
        if (r.Password.Length < 8)
            throw new BadRequestException("Mật khẩu phải có ít nhất 8 ký tự.");
        var u = await Find(id, ct);
        u.PasswordHash = hasher.HashPassword(u, r.Password);
        await repo.SaveAsync(ct);
    }


    public async Task DeleteAsync(Guid id, CancellationToken ct)
    {
        var u = await Find(id, ct);
        if (id == current.UserId)
            throw new BusinessRuleException("CANNOT_MODIFY_SELF", "Không thể tự vô hiệu hóa tài khoản.");
        u.Status = UserStatus.Inactive;
        await repo.SaveAsync(ct);
    }


    public async Task<IReadOnlyList<RoleResponse>> RolesAsync(CancellationToken ct) => (await repo.RolesAsync(ct)).OrderBy(x => x.Code).Select(x => new RoleResponse(x.Id, x.Code, x.Name)).ToList();
}
~~~

### UserRepository.cs

Truy cập dữ liệu người dùng.

[src/AuthService/Repositories/UserRepository.cs dòng 1–20](../../src/AuthService/Repositories/UserRepository.cs#L1-L20)

~~~csharp
using Exe.AuthService.Data;
using Exe.AuthService.Domain;
using Microsoft.EntityFrameworkCore;

namespace Exe.AuthService.Repositories;

public sealed class UserRepository(AuthDbContext db) : IUserRepository
{
    public IQueryable<User> Query() => db.Users.Include(x => x.UserRoles).ThenInclude(x => x.Role);

    public Task<User?> FindAsync(Guid id, CancellationToken ct) => Query().FirstOrDefaultAsync(x => x.Id == id, ct);

    public Task<User?> FindEmailAsync(string email, CancellationToken ct) => Query().FirstOrDefaultAsync(x => x.Email == email, ct);

    public Task<List<Role>> RolesAsync(CancellationToken ct) => db.Roles.ToListAsync(ct);

    public void Add(User user) => db.Users.Add(user);

    public Task SaveAsync(CancellationToken ct) => db.SaveChangesAsync(ct);
}
~~~

### CreateUserRequest.cs

Validation đầu vào tạo tài khoản.

[src/AuthService/Dtos/CreateUserRequest.cs dòng 1–24](../../src/AuthService/Dtos/CreateUserRequest.cs#L1-L24)

~~~csharp
using System.ComponentModel.DataAnnotations;
using Exe.AuthService.Domain;
using Exe.Shared.Web.Paging;

namespace Exe.AuthService.Dtos;

public sealed record CreateUserRequest
{
    [Required, EmailAddress, MaxLength(256)]

    public string Email { get; init; } = "";

    [Required, MaxLength(200)]

    public string FullName { get; init; } = "";

    [Required, MinLength(8)]

    public string Password { get; init; } = "";

    [Required]

    public string[] Roles { get; init; } = [];
}
~~~

### UpdateUserRequest.cs

Validation đầu vào cập nhật tài khoản.

[src/AuthService/Dtos/UpdateUserRequest.cs dòng 1–20](../../src/AuthService/Dtos/UpdateUserRequest.cs#L1-L20)

~~~csharp
using System.ComponentModel.DataAnnotations;
using Exe.AuthService.Domain;
using Exe.Shared.Web.Paging;

namespace Exe.AuthService.Dtos;

public sealed record UpdateUserRequest
{
    [Required, MaxLength(200)]

    public string FullName { get; init; } = "";

    [Required]

    public UserStatus Status { get; init; }

    [Required]

    public string[] Roles { get; init; } = [];
}
~~~

### ResetPasswordRequest.cs

Đầu vào cho câu lệnh đổi mật khẩu do quản trị viên gọi.

[src/AuthService/Dtos/ResetPasswordRequest.cs dòng 1–12](../../src/AuthService/Dtos/ResetPasswordRequest.cs#L1-L12)

~~~csharp
using System.ComponentModel.DataAnnotations;
using Exe.AuthService.Domain;
using Exe.Shared.Web.Paging;

namespace Exe.AuthService.Dtos;

public sealed record ResetPasswordRequest
{
    [Required, MinLength(8)]

    public string Password { get; init; } = "";
}
~~~

### UserQuery.cs

Các bộ lọc danh sách tài khoản.

[src/AuthService/Dtos/UserQuery.cs dòng 1–12](../../src/AuthService/Dtos/UserQuery.cs#L1-L12)

~~~csharp
using System.ComponentModel.DataAnnotations;
using Exe.AuthService.Domain;
using Exe.Shared.Web.Paging;

namespace Exe.AuthService.Dtos;

public sealed class UserQuery : PageQuery
{
    public string? Role { get; set; }

    public UserStatus? Status { get; set; }
}
~~~
