import { useMemo } from "react";
import type { Schedule, Shift } from "../types";
import { parseIsoDate, WEEKDAY_SHORT_VI, weekdayKeyOf } from "../lib/demand";
import { publicHolidayNames, publicHolidays } from "../lib/holidays";
import { GROUP_LABEL_VI, IN_HOUSE, presentGroups, staffGroupOf, staffingWindows, staffRange, validPause, type StaffGroup } from "../lib/staffing";
import { effectiveWeekdayKey, resolveDay } from "../lib/workHours";
import { minutesToTime } from "../lib/time";

type Check = { label: string; groups: readonly StaffGroup[]; actual: number; required: number; allowed: number; ok: boolean };

/** Một nhóm trong một ô 30′: số người thực làm (ít nhất trong ô), ai làm, ai đang nghỉ. */
type GroupSlot = { working: number; names: string[]; pausing: string[] };

type Slot = {
  from: number;
  to: number;
  /** Người trong quán (Bếp + Phục vụ). */
  actual: number;
  byGroup: Record<StaffGroup, GroupSlot>;
  required: number;
  allowed: number;
  closed: boolean;
  checks: Check[];
  band: "normal" | "operation" | "lunch" | "rush";
};

const SLOT = 30;

/** Màu từng nhóm – cùng tông với nhãn nhóm ở tab Nhân viên. */
const GROUP_COLOR: Record<StaffGroup, { bar: string; text: string; swatch: string }> = {
  KITCHEN: { bar: "bg-orange-500", text: "text-orange-700", swatch: "bg-orange-500" },
  SERVICE: { bar: "bg-sky-500", text: "text-sky-700", swatch: "bg-sky-500" },
  DRIVER: { bar: "bg-violet-500", text: "text-violet-700", swatch: "bg-violet-500" },
};
const GROUP_SHORT: Record<StaffGroup, string> = { KITCHEN: "B", SERVICE: "P", DRIVER: "LX" };

const isInHouseRule = (groups: readonly StaffGroup[]) =>
  groups.length === IN_HOUSE.length && IN_HOUSE.every((group) => groups.includes(group));

function bandOf(labels: string[]): Slot["band"] {
  if (labels.includes("Tối")) return "rush";
  if (labels.includes("Bếp trưa")) return "lunch";
  if (labels.length) return "operation";
  return "normal";
}

function slotBackground(slot: Slot): string {
  if (slot.closed) return "bg-slate-100 text-slate-400";
  if (slot.band === "rush") return "bg-amber-50";
  if (slot.band === "lunch") return "bg-orange-50/60";
  if (slot.band === "operation") return "bg-slate-50";
  return "bg-white";
}

const fmtRange = (min: number, max: number) => `${min}${Number.isFinite(max) ? (max === min ? "" : `–${max}`) : "+"}`;

export function CoverageChart({ schedule, dates }: { schedule: Schedule; dates: string[] }) {
  const holidayNames = useMemo(() => publicHolidayNames(schedule.year), [schedule.year]);
  const present = useMemo(() => presentGroups(schedule.employees), [schedule.employees]);
  const rows = useMemo(() => {
    const holidays = publicHolidays(schedule.year);
    const overrides = Object.fromEntries(schedule.dateOverrides.map((override) => [override.date, override]));
    const employeesById = new Map(schedule.employees.map((employee) => [employee.id, employee]));
    const groupOf = (shift: Shift) => staffGroupOf(employeesById.get(shift.employeeId));
    const nameOf = (shift: Shift) => employeesById.get(shift.employeeId)?.name ?? "?";
    return dates.map((date) => {
      const day = resolveDay(schedule.workHours, date, holidays, overrides);
      if (day.closed) return { date, slots: [] as Slot[] };
      const shifts = schedule.shifts.filter((shift) => shift.date === date);
      const ofGroups = (groups: readonly StaffGroup[]) => shifts.filter((shift) => groups.includes(groupOf(shift)));
      // Ngày lễ mở cửa được xếp như Chủ nhật – khung yêu cầu theo CN.
      const windows = staffingWindows(day.blocks, effectiveWeekdayKey(date, holidays), present);
      const slots: Slot[] = [];
      for (let from = day.window.startMinutes; from < day.window.endMinutes; from += SLOT) {
        const to = Math.min(from + SLOT, day.window.endMinutes);
        const isOpen = day.blocks.some((block) => from >= block.startMinutes && to <= block.endMinutes);
        const active = isOpen ? windows.filter((window) => window.startMinutes < to && window.endMinutes > from) : [];
        const checks: Check[] = active.map((window) => {
          const { min, max } = staffRange(ofGroups(window.groups), Math.max(from, window.startMinutes), Math.min(to, window.endMinutes));
          return {
            label: window.label, groups: window.groups, actual: min,
            required: window.minStaff, allowed: window.maxStaff,
            ok: min >= window.minStaff && max <= window.maxStaff,
          };
        });
        const groupSlot = (group: StaffGroup): GroupSlot => {
          if (!isOpen) return { working: 0, names: [], pausing: [] };
          const own = ofGroups([group]).filter((shift) => shift.startMinutes < to && shift.endMinutes > from);
          const pausing = own.filter((shift) => validPause(shift) &&
            shift.pauseStartMinutes! < to && shift.pauseStartMinutes! + shift.pauseMinutes > from);
          return {
            working: staffRange(own, from, to).min,
            names: own.filter((shift) => !pausing.includes(shift)).map(nameOf),
            pausing: pausing.map(nameOf),
          };
        };
        const inHouseChecks = active.filter((window) => isInHouseRule(window.groups));
        const finiteAllowed = inHouseChecks.map((window) => window.maxStaff).filter(Number.isFinite);
        slots.push({
          from,
          to,
          actual: isOpen ? staffRange(ofGroups(IN_HOUSE), from, to).min : 0,
          byGroup: { KITCHEN: groupSlot("KITCHEN"), SERVICE: groupSlot("SERVICE"), DRIVER: groupSlot("DRIVER") },
          required: inHouseChecks.length ? Math.max(...inHouseChecks.map((window) => window.minStaff)) : 0,
          allowed: finiteAllowed.length ? Math.min(...finiteAllowed) : Infinity,
          closed: !isOpen,
          checks,
          band: bandOf(active.map((window) => window.label)),
        });
      }
      return { date, slots };
    });
  }, [dates, schedule, present]);

  const scale = Math.max(6, ...rows.flatMap((row) => row.slots.flatMap((slot) => [slot.actual, slot.required])));
  const shownGroups = (["KITCHEN", "SERVICE", "DRIVER"] as const).filter((group) => group !== "DRIVER" || present.has("DRIVER"));

  if (schedule.shifts.length === 0) {
    return <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">Tạo lịch trước để xem độ phủ.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
        <span className="font-semibold text-slate-800">Mỗi cột = 30 phút</span>
        <span className="inline-flex items-center gap-1.5"><span className={`h-3 w-3 ${GROUP_COLOR.KITCHEN.swatch}`} /> Bếp</span>
        <span className="inline-flex items-center gap-1.5"><span className={`h-3 w-3 ${GROUP_COLOR.SERVICE.swatch}`} /> Phục vụ (gồm chưa gán)</span>
        {present.has("DRIVER") && (
          <span className="inline-flex items-center gap-1.5"><span className={`h-3 w-1.5 ${GROUP_COLOR.DRIVER.swatch}`} /> Lái xe (không tính vào quán)</span>
        )}
        <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-slate-700" /> Mức yêu cầu</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border border-slate-400 text-[8px] leading-[10px]">z</span> có người đang nghỉ</span>
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">Cao điểm tối</span>
        <span className="rounded bg-orange-100 px-1.5 py-0.5 text-orange-800">Bếp trưa</span>
        <span className="text-slate-400">Rê chuột vào cột để xem tên từng người</span>
      </div>

      {rows.map(({ date, slots }) => {
        // Nhãn = thứ THẬT của ngày (03.10.2026 là T7), không phải thứ dùng để xếp lịch.
        const weekday = WEEKDAY_SHORT_VI[weekdayKeyOf(parseIsoDate(date))];
        const holiday = holidayNames.get(date);
        return (
          <section key={date} className="rounded-lg border border-slate-200 bg-white shadow-sm" aria-label={`Độ phủ ${date}`}>
            <header className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
              <h3 className="text-sm font-semibold text-slate-900">
                {date.split("-").reverse().join(".")} · {weekday}
                {holiday && (
                  <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                    Lễ: {holiday} (xếp như CN)
                  </span>
                )}
              </h3>
              {slots.length > 0 && <span className="text-xs text-slate-500">Thực tế / yêu cầu</span>}
            </header>
            {slots.length === 0 ? (
              <div className="px-3 py-5 text-center text-sm text-slate-400">Đóng cửa</div>
            ) : (
              <div className="overflow-x-auto px-2 pb-2">
                <div className="flex min-w-max pt-2" role="list" aria-label={`Số người làm theo từng 30 phút ngày ${date}`}>
                  {slots.map((slot) => {
                    const failed = slot.checks.filter((check) => !check.ok);
                    const requirement = slot.required > 0 ? fmtRange(slot.required, slot.allowed) : "—";
                    const anyPause = shownGroups.some((group) => slot.byGroup[group].pausing.length > 0);
                    const detail = slot.closed
                      ? "đóng cửa"
                      : [
                          `${slot.actual} người trong quán`,
                          ...shownGroups.map((group) => {
                            const g = slot.byGroup[group];
                            return `${GROUP_LABEL_VI[group]} ${g.working}: ${g.names.join(", ") || "—"}${g.pausing.length ? ` · đang nghỉ: ${g.pausing.join(", ")}` : ""}`;
                          }),
                          ...slot.checks.map((check) => `${check.ok ? "✓" : "✗"} ${check.label}: ${check.actual} / cần ${fmtRange(check.required, check.allowed)}`),
                        ].join("\n");
                    const kitchenHeight = (slot.byGroup.KITCHEN.working / scale) * 100;
                    const serviceHeight = (slot.byGroup.SERVICE.working / scale) * 100;
                    return (
                      <div
                        key={slot.from}
                        className={`w-12 shrink-0 border-r border-slate-100 text-center ${slotBackground(slot)} ${failed.length ? "ring-1 ring-inset ring-rose-400" : ""}`}
                        title={`${minutesToTime(slot.from)}–${minutesToTime(slot.to)}\n${detail}`}
                        aria-label={`${minutesToTime(slot.from)}: ${detail.replace(/\n/g, "; ")}`}
                        role="listitem"
                      >
                        <div className="h-4 text-[9px] font-medium text-slate-500">
                          {slot.band === "rush" ? "CĐ" : slot.band === "lunch" ? "Trưa" : slot.band === "operation" ? "Mức" : ""}
                          {anyPause && <span className="ml-0.5 text-slate-400" title="có người đang nghỉ">z</span>}
                        </div>
                        <div className="relative mx-1 h-20 border-b border-slate-300">
                          {!slot.closed && slot.required > 0 && (
                            <span className="absolute left-0 right-1.5 z-10 border-t-2 border-dashed border-slate-700" style={{ bottom: `${slot.required / scale * 100}%` }} />
                          )}
                          {!slot.closed && (
                            <>
                              {/* Cột chồng: bếp ở dưới, phục vụ ở trên; lái xe là vạch tím riêng bên phải. */}
                              <span className={`absolute left-1 right-2.5 bottom-0 ${GROUP_COLOR.KITCHEN.bar}`} style={{ height: `${kitchenHeight}%` }} />
                              <span className={`absolute left-1 right-2.5 ${GROUP_COLOR.SERVICE.bar}`} style={{ bottom: `${kitchenHeight}%`, height: `${serviceHeight}%` }} />
                              {slot.byGroup.DRIVER.working > 0 && (
                                <span className={`absolute right-0 w-1.5 bottom-0 ${GROUP_COLOR.DRIVER.bar}`} style={{ height: `${slot.byGroup.DRIVER.working / scale * 100}%` }} />
                              )}
                            </>
                          )}
                          {!slot.closed && <span className="absolute inset-x-0 z-20 text-xs font-bold text-slate-900" style={{ bottom: `${Math.min(88, slot.actual / scale * 100 + 2)}%` }}>{slot.actual}</span>}
                          {slot.closed && <span className="absolute inset-0 flex items-center justify-center text-[9px]">Đóng</span>}
                        </div>
                        <div className="pt-1 text-[9px] font-medium text-slate-600">{minutesToTime(slot.from)}</div>
                        {!slot.closed && (
                          <div className="text-[9px] font-semibold leading-tight">
                            <span className={GROUP_COLOR.KITCHEN.text}>{GROUP_SHORT.KITCHEN}{slot.byGroup.KITCHEN.working}</span>
                            <span className="text-slate-300">·</span>
                            <span className={GROUP_COLOR.SERVICE.text}>{GROUP_SHORT.SERVICE}{slot.byGroup.SERVICE.working}</span>
                            {slot.byGroup.DRIVER.working > 0 && (
                              <div className={GROUP_COLOR.DRIVER.text}>{GROUP_SHORT.DRIVER}{slot.byGroup.DRIVER.working}</div>
                            )}
                          </div>
                        )}
                        <div className={`pb-1 text-[9px] ${failed.length ? "font-bold text-rose-700" : "text-slate-500"}`}>
                          {slot.closed ? "cần —" : failed.length ? failed.map((check) => `${check.groups.length === 1 ? GROUP_LABEL_VI[check.groups[0]] : "cần"} ${fmtRange(check.required, check.allowed)}`).join(" ") : `cần ${requirement}`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
