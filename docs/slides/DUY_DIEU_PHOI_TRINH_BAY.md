# Điều phối thuyết trình PRN232 — Nhóm 6

Dùng với [deck v0.5, 29 slide](EXE_Team_Matching_Nhom6.pptx) và [lời thoại công nghệ](KICH_BAN_CONG_NGHE.md). Bản điều phối này dành khoảng 23 phút, có thể co lại bằng cách bỏ phần mở rộng EXE201 và đưa phụ lục vào hỏi đáp.

| Slide | Phút | Nội dung cần nói và điều cần chiếu |
|---|---:|---|
| 1–6 | 3 | Bối cảnh ghép nhóm EXE, vấn đề ghép thủ công, vai trò và bốn workflow. Dùng một tình huống cụ thể để dẫn vào phòng tự khóa. |
| 7–8 | 2 | Theo dấu phòng mở, khóa, hoàn tất. Nêu sự khác nhau giữa vào trực tiếp và nộp đơn sau khi khóa. |
| 9–16 | 6 | Chỉ đường đi React → Gateway → Team, gRPC gọi Matching, commit dữ liệu, rồi Kafka → Noti. Ở slide 16, mở RoomService để chứng minh điểm kiểm tra cơ cấu và vị trí phát sự kiện. |
| 17–21 | 7 | Chạy WF-01 đến WF-03 trên Web. Ghi mã phòng và mã nhóm. Mở Mailpit theo mã nhóm. Dùng WF-04 nếu còn thời gian và đã có dữ liệu phù hợp. |
| 22–26 | 4 | Chiếu kết quả test của commit báo cáo, Actions và Grafana. Nêu giới hạn publish sau khi ghi DB và khả năng thiếu email khi Kafka lỗi tại thời điểm đó. |
| 27 | 1 | Chốt bằng kết quả của nhóm vừa được tạo và chuyển sang hỏi đáp. |
| 28–29 | Hỏi đáp | Mở bảng BR01–BR22 hoặc Kafka/Redis khi có câu hỏi. |

## Bằng chứng đặt sẵn theo slide

- **12 và 16.** [CompleteAsync](../../src/TeamService/Services/RoomService.cs#L339-L373) để chỉ thứ tự kiểm tra cơ cấu, lưu nhóm và phát sự kiện. Nếu được hỏi vì sao email có thể thiếu dù nhóm đã tạo, chỉ thời điểm commit và publish.
- **22.** [RoomServiceTests](../../tests/TeamService.Tests/RoomServiceTests.cs) và [smoke test](../../tests/e2e/e2e_smoke.py). Chuẩn bị log có commit, ngày chạy, số kiểm tra đạt và mã thoát. REST smoke test qua Gateway bao phủ luồng mẫu. Kịch bản kiểm thử UI cần có bằng chứng riêng.
- **23.** [Workflow GitHub Actions](../../.github/workflows/ci-cd.yml). Mở run đúng SHA để chỉ backend, frontend, build image và điều kiện đẩy lên GHCR.
- **24.** [Dashboard Grafana](../../deploy/grafana/dashboards/exe-overview.json) và trạng thái service trong buổi demo. Nếu chiếu ảnh chụp, ghi thời điểm để người xem phân biệt với số liệu trực tiếp.

Diễn tập chuyển màn hình trước giờ báo cáo. Ghi mã phòng, mã nhóm và người nhận email của một lượt chạy thành công để có thể giải thích luồng khi môi trường trình chiếu gặp lỗi.
