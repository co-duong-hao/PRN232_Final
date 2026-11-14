# Matching Service (gRPC)

Hợp đồng: `src/Shared/Contracts/Protos/matching.proto`. Service không có database và không gọi service
khác; kết quả chỉ phụ thuộc vào dữ liệu trong request. Logic nằm trong lớp thuần C# (không phụ thuộc
gRPC) để unit test trực tiếp; lớp gRPC chỉ ánh xạ message.

## AnalyzeComposition

Đầu vào: `rule` (GroupType) và `member_major_codes` (mỗi thành viên một phần tử).

Tính:

| Trường | Cách tính |
|---|---|
| `member_count` | số phần tử của `member_major_codes` |
| `missing_member_count` | `max(0, min_member_count − member_count)` |
| `distinct_major_count` | số mã ngành khác nhau |
| `missing_major_count` | `max(0, min_major_count − distinct_major_count)` |
| `missing_majors` | mỗi `major_rule` có số hiện tại < `min_quantity`: (`major_code`, hiện tại, `min_quantity`) |
| `exceeding_majors` | mỗi `major_rule` có số hiện tại > `max_quantity`: (`major_code`, hiện tại, `max_quantity`) |
| `satisfied` | `violations` rỗng |

`violations` (tiếng Việt, theo đúng thứ tự này):

- `BR14: thiếu {n} thành viên ({hiện tại}/{min}).`
- `BR14: vượt số thành viên tối đa ({hiện tại}/{max}).` khi `member_count > max_member_count`
- `BR14: thiếu {n} ngành ({hiện tại}/{min}).`
- `BR15: ngành {code} thiếu {n} sinh viên ({hiện tại}/{min}).`
- `BR15: ngành {code} vượt tối đa ({hiện tại}/{max}).`

So sánh mã ngành không phân biệt hoa thường. `rule` thiếu thì trả `INVALID_ARGUMENT`.

Ví dụ với rule min 4, max 6, 3 ngành, SE 2–3:

| Thành viên | satisfied | violations |
|---|---|---|
| SE, SE, GD, MKT | true | (rỗng) |
| SE, SE, GD | false | thiếu 1 thành viên; thiếu 1 ngành |
| SE, GD, MKT, AI | false | ngành SE thiếu 1 sinh viên |
| SE, SE, SE, SE, GD, MKT | false | ngành SE vượt tối đa |

## RecommendRooms

Đầu vào: `rule`, `student_major_code`, `rooms` (các phòng `Open` hoặc `Locked` của Course), `limit`.

Với mỗi phòng:

1. `can_join` = `member_count < max_member_count` **và** (ngành của sinh viên không có `major_rule`
   **hoặc** số sinh viên ngành đó trong phòng `< max_quantity`). Phòng có `can_join = false` bị loại khỏi
   kết quả.
2. `score` là tổng:
   - +50 nếu ngành của sinh viên có `major_rule` và phòng đang dưới `min_quantity` của ngành đó
     → reason `Phòng đang thiếu ngành {code}.`
   - +30 nếu phòng chưa có ngành của sinh viên và `distinct_major_count < min_major_count`
     → reason `Thêm bạn giúp phòng đủ số ngành.`
   - +10 nếu `status` là `Open` → reason `Vào trực tiếp, không cần duyệt.`
   - +`min(member_count, min_member_count) × 2` (phòng gần đủ người được ưu tiên)
     → reason `Phòng đã có {n} thành viên.`
3. Sắp xếp `score` giảm dần, rồi `room_code` tăng dần. Lấy `limit` phòng đầu (`limit ≤ 0` thì 5).

`rule` hoặc `student_major_code` thiếu thì trả `INVALID_ARGUMENT`.
