import type { Employee, Shift } from "../types";
import { DAY_WEIGHTS, type WeekdayKey } from "./demand";
import type { DayBlocks, DayWindow } from "./workHours";

// ── Nhóm nhân viên ──────────────────────────────────────────────────────────
/**
 * Bereich, nach dem die Besetzung gezählt wird. Wer noch keinem Bereich
 * zugeordnet ist (Admin trägt es später ein), zählt wie Service – so bleibt die
 * Mindestbesetzung „Phục vụ" prüfbar, bis die Zuordnung steht.
 */
export type StaffGroup = "KITCHEN" | "SERVICE" | "DRIVER";
export const STAFF_GROUPS: readonly StaffGroup[] = ["KITCHEN", "SERVICE", "DRIVER"];
/** Personen im Laden (Bếp + Phục vụ). Fahrer sind unterwegs und zählen nicht mit. */
export const IN_HOUSE: readonly StaffGroup[] = ["KITCHEN", "SERVICE"];
export const GROUP_LABEL_VI: Record<StaffGroup, string> = { KITCHEN: "Bếp", SERVICE: "Phục vụ", DRIVER: "Lái xe" };

export function staffGroupOf(employee: Employee | undefined): StaffGroup {
  if (employee?.workRole === "KITCHEN") return "KITCHEN";
  if (employee?.workRole === "DRIVER") return "DRIVER";
  return "SERVICE";
}

/** Arbeitszeit der Fahrer (Vorgabe des Betriebs): 18–21 Uhr, sonntags 18–22 Uhr. Feiertage gelten wie Sonntag. */
export const DRIVER_HOURS: { default: DayWindow; sunday: DayWindow } = {
  default: { startMinutes: 18 * 60, endMinutes: 21 * 60 },
  sunday: { startMinutes: 18 * 60, endMinutes: 22 * 60 },
};

export function driverWindowOf(weekday: WeekdayKey): DayWindow {
  return weekday === "sunday" ? DRIVER_HOURS.sunday : DRIVER_HOURS.default;
}

/** Blöcke, in denen diese Person arbeiten darf: Fahrer nur im Fahrerfenster, alle anderen in allen Öffnungsblöcken. */
export function workBlocksFor(employee: Employee | undefined, blocks: DayBlocks, weekday: WeekdayKey): DayBlocks {
  if (staffGroupOf(employee) !== "DRIVER") return blocks;
  const window = driverWindowOf(weekday);
  return blocks
    .map((block) => ({ startMinutes: Math.max(window.startMinutes, block.startMinutes), endMinutes: Math.min(window.endMinutes, block.endMinutes) }))
    .filter((block) => block.endMinutes > block.startMinutes);
}

/** Welche Bereiche es in dieser Belegschaft überhaupt gibt. */
export function presentGroups(employees: readonly Employee[]): Set<StaffGroup> {
  return new Set(employees.map(staffGroupOf));
}

export type StaffingWindow = {
  label: string;
  startMinutes: number;
  endMinutes: number;
  minStaff: number;
  maxStaff: number;
  /** Nur Personen dieser Bereiche zählen für das Fenster. */
  groups: readonly StaffGroup[];
};

/** Ab hier keine Pause mehr, wenn es sich vermeiden lässt (Abschluss des Abends). */
export const CLOSING_START = 21 * 60 + 30;

/** Mittagsgeschäft endet mit dem Mittagsblock (Mo–Fr zu ab 14:30). */
export const LUNCH_END = 14 * 60 + 30;
export const EVENING_PEAK_START = 18 * 60;
export const EVENING_PEAK_END = 21 * 60;

/**
 * Eine Besetzungsregel: WO (Zeitspanne je Öffnungsblock), WER (Bereiche) und WIE VIELE.
 *
 * minStaff/maxStaff sind der Wert eines Normaltags (Gewicht 1,0). Bei
 * scaled = true werden sie mit dem Tagesgewicht (DAY_WEIGHTS) multipliziert und
 * aufgerundet – Fr–So (1,5) tragen so automatisch das Anderthalbfache.
 *
 * Einzige Quelle für Scheduler, Độ phủ-Bericht und Tab „Tài liệu": wer die
 * Besetzung ändert, ändert nur diese Liste.
 */
export type StaffingRule = {
  label: string;
  /** Kurzbeschreibung der Zeitspanne für den Tab „Tài liệu". */
  when: string;
  minStaff: number;
  maxStaff: number;
  scaled: boolean;
  groups: readonly StaffGroup[];
  /** Nur an diesen (effektiven) Wochentagen; fehlt = an jedem offenen Tag. */
  weekdays?: readonly WeekdayKey[];
  windows: (blocks: DayBlocks) => DayWindow[];
};

/** Schneidet eine feste Uhrzeitspanne mit jedem Öffnungsblock. */
const clip = (from: number, to: number) => (blocks: DayBlocks): DayWindow[] =>
  blocks
    .map((block) => ({ startMinutes: Math.max(from, block.startMinutes), endMinutes: Math.min(to, block.endMinutes) }))
    .filter((window) => window.endMinutes > window.startMinutes);

const wholeBlocks = (blocks: DayBlocks): DayWindow[] =>
  blocks.map((block) => ({ startMinutes: block.startMinutes, endMinutes: block.endMinutes }));

export const STAFFING_RULES: readonly StaffingRule[] = [
  { label: "Trong giờ mở cửa", when: "suốt mỗi khung mở", minStaff: 2, maxStaff: Infinity, scaled: false, groups: IN_HOUSE, windows: wholeBlocks },
  { label: "Bếp", when: "suốt mỗi khung mở", minStaff: 1, maxStaff: Infinity, scaled: false, groups: ["KITCHEN"], windows: wholeBlocks },
  // Phục vụ tối thiểu 2 người suốt giờ mở (quán yêu cầu). Cần ~134 h/tuần – nhóm phục vụ có ~140 h.
  { label: "Phục vụ", when: "suốt mỗi khung mở (gồm người chưa gán nhóm)", minStaff: 2, maxStaff: Infinity, scaled: false, groups: ["SERVICE"], windows: wholeBlocks },
  // Quy tắc bếp của quán: buổi trưa chỉ cần 2 người bếp – không hơn, để giờ bếp dồn cho buổi tối.
  { label: "Bếp trưa", when: "mở cửa – 14:30", minStaff: 2, maxStaff: 2, scaled: false, groups: ["KITCHEN"], windows: clip(0, LUNCH_END) },
  // Cao điểm tối: sàn và trần theo hệ số (T6–CN ×1,5). Trần giữ cho tối không hút hết người khỏi trưa.
  { label: "Tối", when: "18:00–21:00", minStaff: 4, maxStaff: 8, scaled: true, groups: IN_HOUSE, windows: clip(EVENING_PEAK_START, EVENING_PEAK_END) },
  // Lái xe: mỗi tối 1–2 người trong đúng giờ làm của lái xe.
  {
    label: "Lái xe", when: "18:00–21:00 (T2–T7)", minStaff: 1, maxStaff: 2, scaled: false, groups: ["DRIVER"],
    weekdays: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"],
    windows: clip(DRIVER_HOURS.default.startMinutes, DRIVER_HOURS.default.endMinutes),
  },
  {
    label: "Lái xe CN", when: "18:00–22:00 (CN, ngày lễ)", minStaff: 1, maxStaff: 2, scaled: false, groups: ["DRIVER"],
    weekdays: ["sunday"],
    windows: clip(DRIVER_HOURS.sunday.startMinutes, DRIVER_HOURS.sunday.endMinutes),
  },
];

/** Mindest-/Höchstzahl einer Regel an einem Wochentag (Gewicht angewandt, aufgerundet). */
export function ruleRange(rule: StaffingRule, weekday: WeekdayKey): { minStaff: number; maxStaff: number } {
  const weight = rule.scaled ? DAY_WEIGHTS[weekday] : 1;
  return {
    minStaff: Math.ceil(rule.minStaff * weight),
    maxStaff: Number.isFinite(rule.maxStaff) ? Math.ceil(rule.maxStaff * weight) : Infinity,
  };
}

export function ruleAppliesOn(rule: StaffingRule, weekday: WeekdayKey): boolean {
  return !rule.weekdays || rule.weekdays.includes(weekday);
}

/**
 * Besetzungsfenster eines Tages. present = vorhandene Bereiche: eine Regel für
 * einen Bereich ohne Personen (z. B. noch niemand in der Küche) wird übersprungen, statt
 * jeden Tag als unerfüllbar rot zu melden.
 */
export function staffingWindows(blocks: DayBlocks, weekday: WeekdayKey, present?: ReadonlySet<StaffGroup>): StaffingWindow[] {
  return STAFFING_RULES
    .filter((rule) => ruleAppliesOn(rule, weekday) && (!present || rule.groups.some((group) => present.has(group))))
    .flatMap((rule) => {
      const range = ruleRange(rule, weekday);
      return rule.windows(blocks).map((window) => ({ label: rule.label, groups: rule.groups, ...window, ...range }));
    });
}

// ── Đường nhu cầu trong ngày ────────────────────────────────────────────────
/**
 * Nhu cầu tương đối theo giờ (1,0 = bình thường) – dạng „ngọn núi": chuẩn bị,
 * lên dốc, đỉnh, xuống dốc. Thuật toán chia GIỜ CÔNG TRONG QUÁN CỦA NGÀY (đã nhân
 * hệ số ngày) theo đường này thành số người mục tiêu cho từng 30 phút, rồi phạt
 * độ lệch theo bình phương – nhờ vậy số người lên xuống mượt, không dồn cục.
 *
 * AnAn: cao điểm chủ yếu buổi TỐI; trưa nhẹ hơn tối.
 */
export type DemandBand = { startMinutes: number; endMinutes: number; level: number; label: string };

const band = (from: string, to: string, level: number, label: string): DemandBand => {
  const toMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  return { startMinutes: toMinutes(from), endMinutes: toMinutes(to), level, label };
};

/** Höchster Wert der Kurve – Maßstab für „liegt in der Stoßzeit". */
export const PEAK_LEVEL = 1.5;

const EVENING: readonly DemandBand[] = [
  band("17:00", "17:30", 0.75, "Mở ca tối, chuẩn bị"),
  band("17:30", "18:00", 1.0, "Trước cao điểm"),
  band("18:00", "18:30", 1.25, "Vào cao điểm"),
  band("18:30", "20:30", 1.5, "Cao điểm tối"),
  band("20:30", "21:00", 1.3, "Sau cao điểm"),
  band("21:00", "21:30", 1.1, "Vãn khách"),
  band("21:30", "22:00", 0.9, "Vãn khách"),
  band("22:00", "22:30", 0.7, "Đóng cửa"),
];

// Mượt theo từng ô 30 phút: mỗi bước lên/xuống tối đa ~0,25.
export const DEMAND_PROFILE: { default: readonly DemandBand[]; sunday: readonly DemandBand[] } = {
  // T2–T7. Khung 14:30–17:00 chỉ dùng ở T7 (mở liền); T2–T6 đóng giờ đó.
  default: [
    band("11:00", "11:30", 0.6, "Mở cửa, chuẩn bị"),
    band("11:30", "12:00", 0.75, "Trưa"),
    band("12:00", "13:30", 0.85, "Trưa"),
    band("13:30", "14:00", 0.75, "Cuối trưa"),
    band("14:00", "14:30", 0.6, "Cuối trưa"),
    band("14:30", "15:00", 0.55, "Chiều"),
    band("15:00", "16:30", 0.5, "Chiều vắng"),
    band("16:30", "17:00", 0.6, "Chiều"),
    ...EVENING,
  ],
  // CN và ngày lễ mở từ 12:00.
  sunday: [
    band("12:00", "12:30", 0.6, "Mở cửa, chuẩn bị"),
    band("12:30", "13:00", 0.75, "Trưa"),
    band("13:00", "14:00", 0.85, "Trưa"),
    band("14:00", "14:30", 0.7, "Cuối trưa"),
    band("14:30", "15:00", 0.6, "Chiều"),
    band("15:00", "16:30", 0.5, "Chiều vắng"),
    band("16:30", "17:00", 0.6, "Chiều"),
    ...EVENING,
  ],
};

export function demandProfileOf(weekday: WeekdayKey): readonly DemandBand[] {
  return weekday === "sunday" ? DEMAND_PROFILE.sunday : DEMAND_PROFILE.default;
}

/** Relative workload at a minute (1 outside all bands). */
export function workloadAt(minute: number, weekday: WeekdayKey): number {
  return demandProfileOf(weekday).find((b) => minute >= b.startMinutes && minute < b.endMinutes)?.level ?? 1;
}

/**
 * Số người mục tiêu cho từng 30 phút mở cửa:
 *   mục tiêu = giờ công của ngày × mức nhu cầu ÷ tổng mức cả ngày (tính theo phút).
 * Trả về [phút bắt đầu, số người mục tiêu].
 */
export function slotTargets(blocks: DayBlocks, weekday: WeekdayKey, targetHours: number, slot = 30): [number, number][] {
  const slots: [number, number][] = [];
  for (const block of blocks) {
    for (let minute = block.startMinutes; minute < block.endMinutes; minute += slot) {
      slots.push([minute, workloadAt(minute, weekday)]);
    }
  }
  const levelMinutes = slots.reduce((sum, [, level]) => sum + level * slot, 0);
  const scale = levelMinutes > 0 ? (targetHours * 60) / levelMinutes : 0;
  return slots.map(([minute, level]) => [minute, level * scale]);
}

export function validPause(shift: Shift): boolean {
  const start = shift.pauseStartMinutes;
  return start != null && shift.pauseMinutes > 0 && start > shift.startMinutes &&
    start + shift.pauseMinutes < shift.endMinutes && start - shift.startMinutes <= 360 &&
    shift.endMinutes - start - shift.pauseMinutes <= 360;
}

export function workingAt(shift: Shift, minute: number): boolean {
  return shift.startMinutes <= minute && shift.endMinutes > minute &&
    !(validPause(shift) && minute >= shift.pauseStartMinutes! && minute < shift.pauseStartMinutes! + shift.pauseMinutes);
}

export function coveragePoints(shifts: Shift[], from: number, to: number): number[] {
  return [...new Set([from, to, ...shifts.flatMap((s) => [s.startMinutes, s.endMinutes,
    ...(validPause(s) ? [s.pauseStartMinutes!, s.pauseStartMinutes! + s.pauseMinutes] : []),
  ]).filter((t) => t > from && t < to)])].sort((a, b) => a - b);
}

/** Kleinste und größte Zahl gleichzeitig arbeitender Personen in [from, to). */
export function staffRange(shifts: Shift[], from: number, to: number): { min: number; max: number } {
  const points = coveragePoints(shifts, from, to).slice(0, -1);
  const counts = points.map((minute) => new Set(shifts.filter((shift) => workingAt(shift, minute)).map((shift) => shift.employeeId)).size);
  return { min: counts.length ? Math.min(...counts) : 0, max: counts.length ? Math.max(...counts) : 0 };
}

/**
 * Giờ công mục tiêu mỗi ngày, chuẩn hoá trong từng ISO-week (không mượn giữa các tuần):
 *   giờ ngày = giờ tuần × (hệ số × phút mở) ÷ Σ(hệ số × phút mở)
 * Nhân phút mở để hệ số là MẬT ĐỘ người: T7 mở 11,5h không thưa hơn T6 mở 9h.
 * Không truyền openMinutesOf => chỉ theo hệ số.
 */
export function weightedDailyTargets(
  dates: string[],
  total: number,
  weekdayOf: (date: string) => WeekdayKey,
  openMinutesOf?: (date: string) => number,
): Map<string, number> {
  const factor = (date: string) => DAY_WEIGHTS[weekdayOf(date)] * (openMinutesOf ? openMinutesOf(date) : 1);
  const sum = dates.reduce((acc, date) => acc + factor(date), 0);
  return new Map(dates.map((date) => [date, sum > 0 ? total * factor(date) / sum : 0]));
}
