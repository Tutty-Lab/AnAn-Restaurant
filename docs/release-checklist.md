# Checklist trước khi push (dev gate) — mục H

> ⚠️ **Có session song song**: nhiều người/nhiều phiên có thể cùng sửa một repo.
> Luôn đồng bộ với `origin/main` **trước khi** push, **không bao giờ force-push đè
> commit người khác**.

## H.1 Đồng bộ & không đè commit người khác

- [ ] `git fetch origin`
- [ ] `git rebase origin/main` (hoặc merge) — đưa việc của mình **lên trên** bản mới nhất.
- [ ] Giải quyết hết conflict, chạy lại kiểm bên dưới.
- [ ] `git push` **thường** (KHÔNG `--force` / `--force-with-lease` đè lên commit người khác).

```bash
git fetch origin
git rebase origin/main
# … xử lý conflict nếu có, rồi chạy lại tsc + vitest …
git push
```

## H.2 Kiểm mã trước khi push

- [ ] `npx tsc -b` — **sạch, 0 lỗi**.
- [ ] `npx vitest run` — **tất cả test pass**.
      Số test hiện tại của bản này: **______** _(mỗi cửa hàng một con số khác nhau
      — ví dụ Miss Do 140, Viet Cuisine ~125; ghi lại con số thực và đảm bảo
      không giảm sau thay đổi của mình)._
- [ ] **Không còn file test tạm** trong `src/lib/__tests__/` (ví dụ `_probe`,
      `_audit`, `_headcount`, `_min`, `scratch_*`…). Kiểm nhanh:

```bash
ls src/lib/__tests__ | grep -Ei '_probe|_audit|_headcount|scratch|tmp|_min' || echo "sạch"
```

- [ ] Không commit file rác ngoài `src` (bundle `.cjs`, `_x.ts`, output tạm).

## H.3 Sau khi Vercel deploy xong

- [ ] Mở **prod** (bản `… đổi` trên header) và **kiểm nhanh**:
  - [ ] Header hiện **bản build mới** (khớp lần deploy).
  - [ ] **Tạo lịch** chạy, **Hợp lệ** xanh.
  - [ ] **Xuất 1 PDF** (một người) — có kẻ bảng, tải/lưu được.
  - [ ] **Console không lỗi**.
- [ ] Nếu prod dùng **Supabase**: xác nhận **đồng bộ** ok, **không** ghi đè dữ liệu
      thật của chủ quán bằng dữ liệu test.

---

Xong H → chuyển sang nghiệm thu app đầy đủ: [`nghiem-thu.md`](nghiem-thu.md).
