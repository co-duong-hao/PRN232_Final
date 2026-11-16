using Exe.Contracts;
using Exe.TeamService.Dtos;
using Exe.TeamService.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Exe.TeamService.Controllers;

/// <summary>Profile of the signed-in student. The frontend uses <c>id</c> to recognise the room leader.</summary>
[ApiController]
[Authorize(Roles = Roles.Student)]
public sealed class MeController(RoomService rooms) : ControllerBase
{
    [HttpGet("api/me/student")]
    public async Task<ActionResult<StudentDto>> Student(CancellationToken ct)
    {
        var student = await rooms.CurrentStudentAsync(ct);
        return Ok(new StudentDto(student.Id, student.UserId, student.StudentCode, student.FullName, student.Email,
            student.MajorId, student.Major.Code) { Gpa = student.Gpa, Roles = RoomService.RoleDtos(student) });
    }
    [HttpPut("api/me/student/profile")]
    public async Task<ActionResult<StudentDto>> Profile(StudentProfileRequest request, CancellationToken ct) => Ok(await rooms.UpdateStudentProfileAsync(request, ct));
}
