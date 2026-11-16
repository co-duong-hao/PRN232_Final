# Kiến trúc EXE Team Matching

Tài liệu dùng để truy vết từ một thao tác của sinh viên đến mã nguồn. Xem [hợp đồng API](design/api-contract.md) để tra toàn bộ endpoint và [bản đồ dịch vụ](hunguniverse-doc/01-architecture.md) để xem sơ đồ tổng thể.

## Hoàn tất phòng thành nhóm

| Bước | Hành vi | Mã nguồn |
|---|---|---|
| Gửi yêu cầu | Màn hình phòng gọi API hoàn tất với token của trưởng phòng. | [RoomDetailPage](../frontend/src/pages/student/RoomDetailPage.tsx#L73-L81) |
| Xác thực và định tuyến | Gateway dùng JWT middleware và YARP. Team Service áp dụng phân quyền tại API và kiểm tra người gọi trong nghiệp vụ. | [Gateway](../src/Gateway/Program.cs#L5-L21), [RoomsController](../src/TeamService/Controllers/RoomsController.cs#L45-L54) |
| Kiểm tra cơ cấu | Team Service đọc quy tắc loại nhóm qua cache, gọi Matching Service qua gRPC và trả BR16 khi cơ cấu chưa đạt. | [CompleteAsync](../src/TeamService/Services/RoomService.cs#L339-L350), [AnalyzeComposition](../src/MatchingService/Services/MatchingGrpcService.cs#L14-L43) |
| Ghi nhóm | Team tạo Group từ thành viên phòng, đánh dấu trưởng nhóm và cập nhật trạng thái phòng trong giao dịch SQL. | [Ghi Group và Room](../src/TeamService/Services/RoomService.cs#L351-L368) |
| Gửi thông báo | Sau khi giao dịch thành công, Team phát `RoomCompleted` cho các thành viên. Noti đọc Kafka, kết xuất email và gửi qua SMTP đến Mailpit trong môi trường demo. | [Phát sự kiện](../src/TeamService/Services/RoomService.cs#L369-L373), [Xử lý người nhận](../src/NotiService/Workers/EventProcessor.cs#L32-L46), [Mẫu RoomCompleted](../src/NotiService/Email/EmailTemplateRenderer.cs#L22) |

## Ranh giới dữ liệu và xử lý lỗi

- Auth sở hữu AuthDb và phát JWT sau khi kiểm tra thông tin đăng nhập. Team sở hữu TeamDb và dùng `UserId` để liên hệ với tài khoản. [Auth Service](../src/AuthService/Services/AuthService.cs), [TeamDbContext](../src/TeamService/Data/TeamDbContext.cs)
- Matching xử lý tập thành viên và quy tắc do Team cung cấp. Team sử dụng deadline gRPC để giới hạn thời gian chờ và trả lỗi phụ thuộc khi dịch vụ không sẵn sàng. [GrpcMatchingClient](../src/TeamService/Infrastructure/Matching/GrpcMatchingClient.cs)
- Redis tăng tốc tra cứu quy tắc nhóm và thống kê Course. Có thể quan sát `X-Cache` ở API thống kê. Job của Team Service xử lý đến hạn theo vòng lặp riêng. [TeamCache](../src/TeamService/Infrastructure/Caching/TeamCache.cs), [CoursesController](../src/TeamService/Controllers/CoursesController.cs#L67-L75), [CourseCloseJob](../src/TeamService/Infrastructure/Jobs/CourseCloseJob.cs#L10)
- Ghi dữ liệu và phát Kafka diễn ra ở hai thời điểm. Lỗi publish sau khi commit có thể khiến nhóm đã tồn tại nhưng email chưa được tạo. Kiểm tra mã nhóm trước khi thao tác lại và so sánh log Team với log Noti. [Publisher](../src/TeamService/Infrastructure/Messaging/KafkaEventPublisher.cs), [Consumer và offset](../src/NotiService/Workers/EventConsumerWorker.cs#L38-L62)

## Kiểm chứng khi báo cáo

1. Trước khi phòng đủ thành viên, mở màn hình cơ cấu để xem lý do chưa đạt. Ghi HTTP 409 và `BR16` nếu kiểm tra qua API.
2. Duyệt sinh viên GD, chuyển trưởng phòng cho SV02, rồi hoàn tất với SV02. Ghi mã phòng và mã nhóm.
3. Mở Mailpit và đối chiếu email có đúng mã nhóm ở bước 2. Nếu nhóm tồn tại nhưng thiếu email, xem log publish, consumer và SMTP.
