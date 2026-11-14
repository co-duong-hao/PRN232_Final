# Mô hình dữ liệu

Hai database tách biệt trên cùng một SQL Server. Không có khóa ngoại giữa hai database;
`Student.UserId` chỉ là tham chiếu logic sang `User.Id`.

## AuthDb (Auth Service)

| Bảng | Cột | Ràng buộc |
|---|---|---|
| `Users` | `Id` Guid PK, `Email` nvarchar(256), `PasswordHash` nvarchar(max), `FullName` nvarchar(200), `Status` (`Active` \| `Inactive`), `CreatedAt` | unique `Email` (so sánh không phân biệt hoa thường: lưu chữ thường) |
| `Roles` | `Id` Guid PK, `Code` nvarchar(50), `Name` nvarchar(100) | unique `Code` |
| `UserRoles` | `UserId`, `RoleId` | PK (`UserId`, `RoleId`) |

Băm mật khẩu bằng `Microsoft.AspNetCore.Identity.PasswordHasher<User>` (đã có trong ASP.NET Core).

## TeamDb (Team Service)

| Bảng | Cột | Ràng buộc |
|---|---|---|
| `Semesters` | `Id`, `Code` (20), `Name` (100), `StartDate`, `EndDate` | unique `Code` |
| `Subjects` | `Id`, `Code` (20), `Name` (200) | unique `Code` |
| `Majors` | `Id`, `Code` (20), `Name` (100) | unique `Code` |
| `Students` | `Id`, `UserId` Guid, `StudentCode` (20), `FullName` (200), `Email` (256), `MajorId` | unique `UserId`, unique `StudentCode`; FK `MajorId` (BR03) |
| `GroupTypes` | `Id`, `Name` (100), `MinMemberCount`, `MaxMemberCount`, `MinMajorCount` | |
| `GroupTypeMajors` | `GroupTypeId`, `MajorId`, `MinQuantity`, `MaxQuantity` | PK (`GroupTypeId`, `MajorId`) |
| `Courses` | `Id`, `Code` (50), `SemesterId`, `SubjectId`, `GroupTypeId`, `Status` (`Planned` \| `Forming` \| `Closed`), `StartTime`, `Deadline`, `RoomSequence` int | unique `Code`; unique (`SemesterId`, `SubjectId`) (BR01); `RoomSequence` là concurrency token |
| `StudentInCourses` | `CourseId`, `StudentId`, `EnrolledAt` | PK (`CourseId`, `StudentId`) |
| `Rooms` | `Id`, `CourseId`, `Code` (60), `LeaderId` (StudentId), `Status` (`Open` \| `Locked` \| `Completed` \| `Cancelled`), `MemberCount` int, `Version` int, `CreatedAt` | unique `Code` (BR04); `Version` là concurrency token |
| `StudentInRooms` | `RoomId`, `StudentId`, `CourseId`, `JoinedAt` | PK (`RoomId`, `StudentId`); **unique (`CourseId`, `StudentId`)** (BR05) |
| `RoomApplies` | `Id`, `RoomId`, `StudentId`, `Message` (500), `Status` (`Pending` \| `Approved` \| `Rejected` \| `Cancelled`), `DecidedBy` (StudentId, null), `DecidedAt` (null), `CreatedAt` | unique (`RoomId`, `StudentId`) có filter `[Status] = 'Pending'` |
| `Groups` | `Id`, `CourseId`, `RoomId`, `GroupTypeId`, `Code` (60), `Name` (200), `CreatedAt` | unique `RoomId` (BR17); unique `Code` |
| `StudentInGroups` | `GroupId`, `StudentId`, `IsLeader` | PK (`GroupId`, `StudentId`) |

Ghi chú thiết kế:

- **BR05 ở tầng database.** `StudentInRooms.CourseId` là bản sao của `Room.CourseId`, chỉ để tạo unique
  index. Khi phòng hoàn tất, các dòng `StudentInRooms` được giữ lại, nên sinh viên đã có nhóm không vào
  được phòng khác (BR18). Khi sinh viên rời phòng, dòng của họ bị xóa.
- **BR11 và ghi đồng thời.** Mọi thay đổi thành viên, trưởng phòng hoặc trạng thái của phòng đều tăng
  `Room.Version` và cập nhật `Room.MemberCount` trong cùng `SaveChanges`. Hai yêu cầu cùng sửa một phòng
  thì yêu cầu sau nhận `DbUpdateConcurrencyException` (409 `CONCURRENCY_CONFLICT`).
- **Mã phòng.** `Course.RoomSequence` tăng 1 mỗi lần tạo phòng; mã là `{Course.Code}-R{RoomSequence:000}`.
  Vì là concurrency token, tạo phòng đồng thời thì thử lại tối đa 3 lần.
- **Ngành không có trong `GroupTypeMajors`** thì không bị giới hạn riêng (min 0, max = `MaxMemberCount`).
- Xóa dữ liệu nền đang được tham chiếu trả 409 `IN_USE`; cấu hình `DeleteBehavior.Restrict`.

## Dữ liệu mẫu

GUID cố định để hai service khớp nhau. `NN` là số thứ tự hai chữ số.

### AuthDb

Mật khẩu của mọi tài khoản lấy từ cấu hình `Seed:DefaultPassword`.

| Id | Email | FullName | Role |
|---|---|---|---|
| `00000000-0000-0000-0000-000000000001` | `admin@exe.local` | Quản trị viên | Admin |
| `00000000-0000-0000-0000-000000000002` | `hod@exe.local` | Trưởng bộ môn | HeadOfDepartment |
| `00000000-0000-0000-0000-000000000003` | `lecturer@exe.local` | Giảng viên | Lecturer |
| `10000000-0000-0000-0000-0000000000NN` | `studentNN@exe.local` | Sinh viên NN | Student (NN = 01..12) |

Bốn role có `Code` trùng hằng số trong `Roles`.

### TeamDb

- Semester `FA26` "Fall 2026", 2026-09-07 → 2026-12-27.
- Subject `EXE101` "Trải nghiệm khởi nghiệp 1", `EXE201` "Trải nghiệm khởi nghiệp 2".
- Major `SE` "Kỹ thuật phần mềm", `AI` "Trí tuệ nhân tạo", `GD` "Thiết kế đồ họa", `MKT` "Marketing".
- Student: `Id` = `20000000-0000-0000-0000-0000000000NN`, `UserId` = `10000000-0000-0000-0000-0000000000NN`,
  `Email` = `studentNN@exe.local`, `FullName` = "Sinh viên NN".

  | NN | Major | StudentCode |
  |---|---|---|
  | 01–05 | SE | `SE1800NN` |
  | 06–07 | AI | `AI1800NN` |
  | 08–10 | GD | `GD1800NN` |
  | 11–12 | MKT | `MK1800NN` |

- GroupType "Nhóm EXE chuẩn": `MinMemberCount` 4, `MaxMemberCount` 6, `MinMajorCount` 3;
  GroupTypeMajor `SE`: min 2, max 3.
- Course `FA26-EXE101`: `Id` = `30000000-0000-0000-0000-000000000001`, `Status` Forming,
  `StartTime` 2026-11-01, `Deadline` 2026-12-15, GroupType ở trên, đủ 12 sinh viên.
- Course `FA26-EXE201`: `Status` Planned, cùng GroupType, chưa có sinh viên.
