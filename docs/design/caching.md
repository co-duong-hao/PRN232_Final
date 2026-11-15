# Cache bằng Redis (Team Service)

Redis chỉ làm **cache** cho Team Service; message broker là Kafka (`events.md`). Cache giúp giảm truy vấn lặp
lại và là phần dễ trình bày: lần gọi đầu đọc database, các lần sau đọc Redis cho tới khi dữ liệu đổi.

## Nguyên tắc

- Dùng `IDistributedCache` (`Microsoft.Extensions.Caching.StackExchangeRedis`), đăng ký bằng
  `AddStackExchangeRedisCache` với `Redis:ConnectionString` và `Redis:InstanceName` (`exe-team:`).
- Bọc trong một lớp `ITeamCache` duy nhất (get-or-create + xóa key), giá trị lưu JSON. Service nghiệp vụ không
  gọi `IDistributedCache` trực tiếp.
- **Cache không được làm hỏng nghiệp vụ.** Redis lỗi hoặc không kết nối được: log Warning, đọc thẳng database
  và trả kết quả bình thường. Ghi cache lỗi thì bỏ qua.
- Dữ liệu ghi xong mới xóa key (sau `SaveChanges`), không cập nhật cache tại chỗ.
- Chỉ cache dữ liệu đọc; mọi kiểm tra quy tắc nghiệp vụ khi ghi (BR05, BR11, QT06...) vẫn đọc database.

## Các key

| Key (sau tiền tố `exe-team:`) | Nội dung | Thời hạn | Xóa khi |
|---|---|---|---|
| `grouptype:{id}` | `GroupTypeDto` (gồm `majors`) | `Cache:GroupTypeMinutes` (10 phút) | sửa hoặc xóa GroupType đó |
| `course:{id}:stats` | `CourseStatsDto` | `Cache:CourseStatsSeconds` (30 giây) | có thay đổi thành viên, trạng thái phòng, nhóm hoặc danh sách sinh viên của Course đó |

Nơi dùng:

- `GET /api/group-types/{id}` đọc qua cache.
- Kiểm tra cơ cấu, hoàn tất phòng (QT06), gợi ý phòng: lấy quy định GroupType (`GroupTypeRule`) từ cùng key
  `grouptype:{id}` thay vì join bảng mỗi lần. Phần thành viên của phòng vẫn đọc database.
- `GET /api/courses/{id}/stats` đọc qua cache.

## Quan sát được khi demo

- `GET /api/courses/{id}/stats` và `GET /api/group-types/{id}` trả header `X-Cache: HIT` hoặc `X-Cache: MISS`.
  Gọi hai lần liên tiếp: lần đầu `MISS`, lần sau `HIT`; một sinh viên vào phòng thì lần gọi tiếp lại là `MISS`.
- Log mức Debug ghi `Cache hit/miss {Key}`.
- Xem trực tiếp trong Redis: `docker compose exec redis redis-cli --scan --pattern "exe-team:*"`.
