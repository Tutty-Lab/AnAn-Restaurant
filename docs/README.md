# Bộ tài liệu nghiệm thu (harness)

Đây là **điều kiện nghiệm thu của chủ quán** cho app Lịch làm việc & Bảng chấm công
(Dienstplan + Stundenzettel). App này dùng chung một mã nguồn cho mọi cửa hàng
(mỗi quán là một bản sao của template này), nên bộ tài liệu này nằm trong
template để **mọi cửa hàng đều thừa hưởng**.

Mục tiêu: trước khi giao một bản cho chủ quán, phải chạy hết các vòng kiểm dưới
đây và tick đủ. Xuất PDF là phần rủi ro nhất — **phải test trên máy thật, không
chỉ giả lập**.

## Các file trong bộ

| File | Dùng cho ai | Nội dung |
|------|-------------|----------|
| [`nghiem-thu.md`](nghiem-thu.md) | QA / chủ quán | Checklist nghiệm thu A–G + ma trận thiết bị test PDF + "trước khi giao khách" |
| [`release-checklist.md`](release-checklist.md) | Dev | Cổng kiểm trước khi push (mục H) + smoke trên prod sau deploy |
| [`quy-tac-gio-lam.md`](quy-tac-gio-lam.md) | Tất cả | Quy tắc giờ làm & nghỉ (luật Đức) + quy tắc app/quán (đổi được) |

## 3 vòng kiểm, theo thứ tự

1. **Dev gate — trước khi push** → [`release-checklist.md`](release-checklist.md)
   (fetch + rebase, `tsc` sạch, `vitest` pass, không còn file test tạm).
2. **Nghiệm thu app A–G** → [`nghiem-thu.md`](nghiem-thu.md)
   (xuất PDF trên thiết bị thật, nội dung file, tải/lưu, trạng thái, PWA, dữ liệu,
   hiển thị).
3. **Trước khi giao khách** → cuối [`nghiem-thu.md`](nghiem-thu.md)
   (in 3 tháng full cả quán, 6 tháng random nhân viên, soát thuật toán + format).

## Lệnh nhanh

```bash
npm install
npx tsc -b                 # kiểu (TypeScript) phải sạch, 0 lỗi
npx vitest run             # tất cả test phải pass
npm run build              # build production
npm run dev                # chạy thử local (localStorage), mở http://localhost:5173
```

## Cách dùng checklist

- Mỗi mục là một ô `- [ ]`. Copy file ra một bản cho mỗi lần nghiệm thu, tick dần.
- Mục nào **chưa đạt** thì ghi chú lỗi ngay dưới dòng đó (thiết bị nào, bước nào,
  ảnh chụp màn hình).
- Chỉ ký nghiệm thu khi **tất cả** ô đã tick (hoặc có lý do miễn được chủ quán
  đồng ý bằng văn bản).
