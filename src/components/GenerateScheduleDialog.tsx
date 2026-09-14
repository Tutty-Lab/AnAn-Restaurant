import { useEffect, useRef, useState } from "react";
import { MONTH_NAMES_VI } from "../lib/dateFormat";
import { monthLabel } from "../lib/shiftOps";
import { clampScheduleYear, SCHEDULE_YEARS, SCHEDULE_YEAR_RANGE_LABEL } from "../lib/years";

const selectClass =
  "w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";

/**
 * Popup „Tạo lịch làm việc": chọn tháng + năm cần tạo.
 *
 * App chỉ giữ lịch của MỘT tháng. Tạo tháng khác sẽ thay lịch đang có, và tạo
 * lại tháng đã in sẽ mở khoá – nên popup nói rõ trước khi bấm. Không dùng
 * window.confirm: trình duyệt nhúng (Messenger, Zalo) hay nuốt hộp thoại gốc.
 */
export function GenerateScheduleDialog({
  currentYear,
  currentMonth,
  hasShifts,
  isLocked,
  onConfirm,
  onClose,
}: {
  currentYear: number;
  currentMonth: number;
  hasShifts: boolean;
  isLocked: boolean;
  onConfirm: (target: { year: number; month: number }) => void;
  onClose: () => void;
}) {
  const [year, setYear] = useState(() => clampScheduleYear(currentYear));
  const [month, setMonth] = useState(currentMonth);
  const monthSelect = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    monthSelect.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sameMonth = year === currentYear && month === currentMonth;
  const current = monthLabel(currentYear, currentMonth);
  const target = monthLabel(year, month);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="generate-dialog-title"
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-lg border border-slate-200 bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 id="generate-dialog-title" className="font-semibold text-slate-900">
            Tạo lịch làm việc
          </h3>
          <button type="button" onClick={onClose} className="text-xl leading-none text-slate-400 hover:text-slate-600" aria-label="Đóng">
            ✕
          </button>
        </div>

        <div className="space-y-3 px-4 py-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Tháng</span>
              <select ref={monthSelect} className={selectClass} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                {MONTH_NAMES_VI.map((name, index) => (
                  <option key={name} value={index + 1}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Năm</span>
              <select className={selectClass} value={year} onChange={(e) => setYear(Number(e.target.value))}>
                {SCHEDULE_YEARS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-xs text-slate-500">Chỉ tạo và in lịch cho các năm {SCHEDULE_YEAR_RANGE_LABEL}.</p>

          {isLocked && (
            <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Lịch <b>{current}</b> đã in &amp; khóa. Tạo lịch sẽ <b>mở khóa và xóa dấu các tuần đã in</b> — bản đã
              treo ở quán sẽ không còn khớp.
            </div>
          )}
          {hasShifts && !sameMonth && (
            <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Lịch <b>{current}</b> đang có sẽ được <b>thay bằng lịch {target}</b> (app chỉ lưu một tháng). Xuất PDF
              tháng hiện tại trước nếu còn cần.
            </div>
          )}
          {hasShifts && sameMonth && !isLocked && (
            <p className="text-sm text-slate-600">
              Lịch <b>{target}</b> hiện có sẽ được tạo lại; các ca sửa tay sẽ mất.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={() => onConfirm({ year, month })}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 active:bg-slate-800"
          >
            Tạo lịch {target}
          </button>
        </div>
      </div>
    </div>
  );
}
