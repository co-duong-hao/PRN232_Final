# T2 — Team Service: dữ liệu nền và quy trình ghép nhóm

Worker 2, đợt A. Không phụ thuộc task nào khác. Đây là task lớn nhất; làm theo thứ tự ưu tiên bên dưới.

## Mục tiêu

Team Service chạy được toàn bộ quy trình QT01–QT06 với đúng quy tắc BR, cùng CRUD dữ liệu nền.
Việc gọi Matching Service và phát sự kiện đi qua hai interface đã có sẵn; bản cài đặt thật là của T4.

## Đọc trước

- `docs/design/conventions.md` (bắt buộc, gồm luật cho worker)
- `docs/design/api-contract.md`, mục "Team Service" (toàn bộ)
- `docs/design/data-model.md`, mục "TeamDb" và "Dữ liệu mẫu → TeamDb"
- `docs/design/events.md`, bảng "Danh sách sự kiện" (để biết phát gì, cho ai, kèm `data` nào)
- `src/TeamService/Abstractions/IMatchingClient.cs`, `IEventPublisher.cs`

## Được sửa

- `src/TeamService/**`, **trừ** `src/TeamService/Abstractions/**` và `src/TeamService/Infrastructure/**`
- `tests/TeamService.Tests/**`

Trong `Program.cs`, giữ nguyên hai dòng đăng ký `IEventPublisher` và `IMatchingClient`.

## Việc cần làm (theo thứ tự ưu tiên)

1. **Nền.** `Domain/` (entity, enum), `Data/TeamDbContext` + cấu hình đủ ràng buộc trong `data-model.md`
   (unique index BR05, filter index của `RoomApplies`, hai concurrency token), `IDesignTimeDbContextFactory`,
   migration `Initial`, `Data/TeamDbSeeder` đúng dữ liệu mẫu. `Program.cs`: DbContext (SQL Server,
   `EnableRetryOnFailure`), migrate có thử lại rồi seed, bỏ qua khi môi trường là `Testing`.
2. **Quy trình phòng** (`IRoomService`, `IRoomApplyService`, `IGroupService` và controllers): QT01, QT02,
   QT03 (gửi, duyệt, từ chối, hủy), QT04, QT05, QT06, kiểm tra cơ cấu, gợi ý phòng. Làm đúng thứ tự kiểm
   tra và mã lỗi trong `api-contract.md`.
3. **Course**: CRUD, mở, đóng, nạp và gỡ sinh viên, danh sách sinh viên có `hasRoom`, `/api/me/courses`.
4. **Dữ liệu nền**: Semester, Subject, Major, Student, GroupType (kèm `majors`).
5. **Danh sách phòng, đơn, nhóm** có lọc, sắp xếp, phân trang.
6. **Stats** của Course.

Yêu cầu kỹ thuật:

- BR05 phải được bảo đảm bằng unique index; bắt `DbUpdateException` do trùng index và chuyển thành 409 `BR05`.
- Mọi thay đổi thành viên, trưởng phòng, trạng thái phòng tăng `Room.Version`; không dùng SQL thô hay lock hint.
- Phát sự kiện qua `IEventPublisher` sau khi `SaveChanges` thành công, đúng `recipients` và `data` trong
  `events.md`. Tạo `EventEnvelope` ở một chỗ (ví dụ `RoomEventFactory`) thay vì rải khắp service.
- Ngưỡng khóa phòng đọc từ `Room:LockThreshold` qua `IOptions`.
- Dựng `GroupTypeRule` từ GroupType ở một chỗ duy nhất, dùng chung cho kiểm tra cơ cấu, QT06 và gợi ý phòng.

### Test (`tests/TeamService.Tests`, SQLite in-memory, mock hai interface)

Ít nhất các trường hợp sau, mỗi trường hợp một test:

- QT01: tạo phòng thành công, mã đúng dạng `FA26-EXE101-R001`, người tạo là trưởng phòng.
- BR02: sinh viên ngoài Course không tạo/vào/xin vào phòng được.
- BR05: sinh viên đã ở phòng A không tạo được phòng mới, không vào được phòng B.
- BR08: người thứ ba vào thì phòng thành `Locked`; rời còn hai người thì về `Open`.
- BR11: phòng đủ `MaxMemberCount`; ngành SE đã đủ `MaxQuantity`.
- BR12: vào phòng thì các đơn `Pending` khác bị hủy.
- BR13: trưởng phòng không rời được khi còn người; người cuối cùng rời thì phòng `Cancelled`.
- QT03: chỉ trưởng phòng duyệt được; duyệt thì người xin thành thành viên.
- QT06: `Satisfied = false` ra `BR16`; `Satisfied = true` tạo `Group`, đủ `StudentInGroup`, phòng `Completed`.
- BR18: không rời được phòng `Completed`.
- Sự kiện: QT02 khiến phòng khóa phát đúng `RoomMemberJoined` và `RoomLocked` với đúng người nhận.
- `Course.Status` khác `Forming` thì các thao tác phòng ra `COURSE_NOT_FORMING`.

## Xong khi

- `dotnet build ExeTeamMatching.sln` không lỗi; `dotnet test tests/TeamService.Tests` xanh.
- `src/TeamService/Data/Migrations` có migration `Initial` sinh bằng `dotnet ef`.
- Các mục 1–5 hoàn tất. Mục 6 chưa kịp thì ghi rõ trong báo cáo.

## Ngoài phạm vi

Redis, gRPC client, background job (T4). Giảng viên xếp sinh viên thủ công. Giao diện.
