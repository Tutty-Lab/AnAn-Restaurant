# Quy tắc giờ làm & nghỉ

Hai nhóm quy tắc: **(1) LUẬT** (không được vi phạm) và **(2) quy tắc app/quán**
(đổi được tuỳ quán). Thuật toán xếp lịch và phần nghiệm thu đều đối chiếu theo đây.

---

## 1. Giờ làm & nghỉ — quán ăn Đức (LUẬT, bản gọn)

- **Tối đa 10h/ngày** (bình thường **8h**) — không hơn, kể cả làm thêm.
- **Tối đa 6 ngày/tuần**, phải có **1 ngày nghỉ**.
- Làm **> 6h → nghỉ 30 phút**; làm **> 8h → nghỉ 60 phút** (nghỉ **không tính lương**).
- **Nghỉ ≥ 11h** giữa hai ca.
- **Làm đêm / Chủ Nhật / lễ → có phụ cấp** (đêm **~25%**).
- **Dưới 18 tuổi**: tối đa **8h/ngày**, **không làm sau 22h**.
- **Ghi giờ làm và giữ ≥ 2 năm** — dùng **Stundenzettel xuất PDF hàng tháng** là đủ.

> Đây là bản rút gọn để kiểm nhanh. Không thay thế tư vấn pháp lý; khi quán có
> tình huống đặc biệt (ca đêm dài, người < 18, hợp đồng riêng) thì kiểm với kế
> toán/luật.

### Suy ra cho thuật toán (phải luôn đúng)
- Không xếp ai **> 10h/ngày** (giới hạn luật; từng quán có thể chặn thấp hơn – AnAn chặn **9 giờ công/ngày**, xem mục 2).
- Không xếp ai **> 6 ngày liên tiếp** (phải chèn ngày nghỉ).
- **Pause** tự tính theo ngưỡng 6h/8h và **trừ khỏi giờ trả lương**.
- Khoảng cách hai ca của cùng người **≥ 11h**.

---

## 2. Quy tắc app / quán — KHÔNG phải luật (đổi được tuỳ quán)

Restaurant AnAn:

- **Giờ mở:** T2–T6 11:00–14:30 và 17:00–22:30 · T7 11:00–22:30 · CN và ngày lễ 12:00–22:30.
- **Tối đa 9 giờ công/ngày** (quán yêu cầu, thấp hơn giới hạn luật 10h); app chặn cả khi xếp tự động lẫn khi sửa tay.
- **Peak hour chủ yếu buổi tối**; ngày đông nhất **T6, T7, CN** (hệ số 1,5) – ưu tiên nhiều người buổi tối của 3 ngày này.
- **Trong giờ mở luôn ít nhất 2 người trong quán**, gồm ít nhất 1 **bếp** và **2 phục vụ** (người chưa gán nhóm tính như phục vụ).
- **Buổi trưa chỉ cần 2 nhân viên bếp.**
- **Nhóm:** Bếp, Phục vụ, Lái xe – admin gán trong tab Nhân viên.
- **Lái xe** chỉ làm **18:00–21:00**, **Chủ Nhật 18:00–22:00** (ngày lễ như Chủ Nhật); không tính vào số người trong quán; mỗi tối 1–2 lái xe.
- **Toàn thời gian:** ưu tiên ca và giờ làm cố định (cùng thứ, cùng giờ mỗi tuần).
- **Azubi:** 39 giờ/tuần; trong kỳ học không đi làm.
- **Nhân viên còn lại** (bán thời gian, minijob, lái xe): ưu tiên làm vào peak hour.
- **Hợp đồng theo tháng** (ví dụ 92,70h) xếp theo bậc 30′ và không vượt hợp đồng.

> Các quy tắc này là vận hành của quán, không phải luật — có thể chỉnh theo từng
> cửa hàng (số người tối thiểu, khung giờ cao điểm, số ngày mở…). Khi đổi, nhớ
> cập nhật lại phần **"trước khi giao khách"** trong [`nghiem-thu.md`](nghiem-thu.md).
