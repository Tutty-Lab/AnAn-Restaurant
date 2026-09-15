# Checklist nghiệm thu app (A–G)

> Điều kiện nghiệm thu của chủ quán. Tick đủ mới được giao.
> Quán: __________________   Bản build: __________________   Người test: __________________   Ngày: __________

---

## A. Xuất PDF — test THẬT trên nhiều máy (không chỉ giả lập)

### A.1 Ma trận thiết bị (mở app → xuất PDF → mở file)

Đánh dấu ✅ / ❌ cho từng máy. **Bắt buộc test máy thật**, không chỉ DevTools.

| Thiết bị / trình duyệt | Mở app | Xuất ra PDF | Có kẻ bảng (không serif) | Tải/lưu được về máy | Tên file đúng |
|---|---|---|---|---|---|
| PC — Chrome | | | | | |
| PC — Edge | | | | | |
| macOS — Safari | | | | | |
| PC/Mac — Firefox | | | | | |
| iPhone — Safari | | | | | |
| iPad — Safari | | | | | |
| Android — Chrome | | | | | |
| Android — Samsung Internet | | | | | |
| In-app — Zalo | | | | | |
| In-app — Facebook | | | | | |
| In-app — Messenger | | | | | |
| In-app — Instagram | | | | | |

### A.2 Các tình huống xuất

- [ ] **Lần đầu mở / mạng chậm** (font chưa cache) — PDF vẫn **có kẻ bảng**, chữ **không bị serif** (không rớt về Times).
- [ ] Xuất **"cả quán"** (nhiều người → nhiều trang): có **tiến độ X/N**, **không treo**, **đủ số trang**, mọi trang **có kẻ bảng**.
- [ ] Xuất **một người** → đúng **1 trang**, **có kẻ bảng**.
- [ ] Xuất **Stundenzettel — cả tháng** → có kẻ bảng.
- [ ] Xuất **Stundenzettel — từng tuần** → có kẻ bảng.
- [ ] Xuất **Lịch làm việc (Dienstplan) — cả tháng**.
- [ ] Xuất **Lịch làm việc (Dienstplan) — từng tuần**.
- [ ] Trong lúc tạo: nút **bị disable**, hiện chữ **"Đang tạo PDF…"**; xong thì **mở lại** nút.
- [ ] Xuất khi **chưa có lịch** → nút **disable** / báo **"Chưa có lịch"** (không crash).

---

## B. Nội dung file PDF

- [ ] Kẻ bảng **đủ ngang + dọc**, không ô nào mất nét (trên **mọi máy**).
- [ ] **Không** dính `vercel.app` / ngày in / số trang / tiêu đề trình duyệt (header–footer của trình duyệt).
- [ ] **Tên tiếng Việt đúng dấu**: Nguyễn, Kiều, Hữu, Đức, Thị…
- [ ] **Tên quán + địa chỉ** đúng.
- [ ] **Ngày tách ca sáng/chiều** hiển thị rõ (đường kẻ tách trong ô / mỗi ca một hàng), mỗi ngày một khối.
- [ ] **Ngày Chủ Nhật** (ca liền mạch, không tách) hiển thị đúng, **Pause đúng**.
- [ ] Ngày **nghỉ** ghi **"Frei"**; ngày **lễ** ghi **tên lễ**; ngày **đóng cửa** ghi **chú thích** đúng.
- [ ] Số phút **nghỉ giải lao (Pause)** đúng theo **luật đang set** (>6h→30′, >8h→60′; xem [`quy-tac-gio-lam.md`](quy-tac-gio-lam.md)).
- [ ] **Gesamtstunden** mỗi người = **tổng cột giờ** = **khớp định mức** (Soll).
- [ ] **Số trang PDF = số nhân viên**; ô **Sollstunden/Differenz để trống** (điền tay).
- [ ] **Số kiểu Đức** — dấu phẩy thập phân: `6,50` (không phải `6.50`).

---

## C. Tải / lưu file

- [ ] **Máy tính**: tải thẳng về, **đúng tên file**.
- [ ] **Điện thoại**: **lưu được về máy** (không mở sang link rồi kẹt) — test **iPhone + Android + in-app**.
- [ ] **Tên file sạch dấu**, ví dụ: `Stundenzettel_tat_ca_2026-09.pdf`.
- [ ] Nút **In đã gỡ hẳn**, **chỉ còn Xuất PDF**.

---

## D. Trạng thái · cảnh báo · thông báo

- [ ] **Hợp lệ** hiện **xanh** khi đúng; **lỗi (đỏ)** vs **cảnh báo (vàng)** phân biệt đúng.
- [ ] Warning/lỗi gộp sau nút **(i)**; mở ra ghi **"vì sao"** cho **từng người**.
- [ ] Bấm **"Tạo lịch"** xong hiện **toast thành công**.
- [ ] Banner **tách ca Chủ Nhật** (nếu có) + nút **tạo lại** hoạt động.
- [ ] Số liệu **Dashboard** đúng: số NV, VZ/TZ/MJ, tổng định mức, đã xếp, chưa xếp.
- [ ] **Không có lỗi trong Console** khi: mở app / tạo lịch / xuất PDF.

---

## E. Bản build & cache (PWA)

- [ ] Header hiện **bản `<ngày giờ>`** khớp **lần deploy mới nhất**.
- [ ] Sau deploy, mở lại **tự lên bản mới** (không kẹt cache cũ).
- [ ] **Offline** vẫn **mở được app**, **dữ liệu còn**.

---

## F. Dữ liệu · khóa · đăng nhập · đồng bộ

- [ ] Mở lần đầu có sẵn **dữ liệu mẫu nhân viên của quán** (mỗi quán một danh sách riêng); đổi **Tháng/Năm** cập nhật đúng.
- [ ] Xuất lịch **một tuần** ⇒ **khóa** lịch tháng; **mở khóa** lại được; **tạo lịch mới** cũng mở khóa.
- [ ] **Thêm / sửa / xoá nhân viên** (kể cả **"Ngày vào làm"**, **ca cố định**) cập nhật đúng.
- [ ] **Ngày nghỉ / đóng cửa / half-day** (override) áp đúng, **lưu lại**.
- [ ] **"Xoá dữ liệu"** hoạt động; **prod đồng bộ Supabase**; báo **trạng thái đồng bộ / lỗi**.
- [ ] **Mật khẩu khóa app** hoạt động.

---

## G. Hiển thị & khung xem

- [ ] **Theo ngày / Theo tuần / Bảng tháng / Độ phủ** render đúng.
- [ ] Trên **điện thoại không vỡ layout**; bảng rộng **cuộn ngang** được.
- [ ] **Sửa tay 1 ca** lưu đúng + đánh dấu **"đã sửa tay"**.
- [ ] **Sáng/tối (light/dark)** không lỗi màu.
- [ ] ⚠️ **CHỈ ĐƯỢC IN LỊCH cho các năm 2026–2030** (ngoài khoảng này phải chặn).

---

## Trước khi giao khách (bắt buộc chạy tay)

- [ ] **In ra 3 tháng full cả quán** (mỗi tháng, tất cả nhân viên).
- [ ] **In ra 6 tháng random các nhân viên** (chọn ngẫu nhiên người + tháng).
- [ ] **Check thuật toán** — xem [`quy-tac-gio-lam.md`](quy-tac-gio-lam.md):
  - [ ] Không ai > **10h/ngày**; không ai > **6 ngày liên tiếp**.
  - [ ] Pause đúng ngưỡng; Gesamtstunden khớp định mức.
  - [ ] Phủ **peak hour / peak day**; **mở cửa & đóng cửa luôn ≥ 2 người**.
- [ ] **Check format** — đối chiếu mục **B** ở trên trên vài file vừa in.

---

### Ký nghiệm thu

- Người test: __________________  Ngày: __________  (đã tick đủ A–G + "trước khi giao khách")
- Chủ quán duyệt: __________________  Ngày: __________
