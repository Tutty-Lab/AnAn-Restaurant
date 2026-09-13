import type { Shift } from "../types";
import { DAY_WEIGHTS, type WeekdayKey } from "./demand";
import type { DayBlocks, DayWindow } from "./workHours";

export type StaffingWindow = {
  label: string;
  startMinutes: number;
  endMinutes: number;
  minStaff: number;
  maxStaff: number;
};

export const CLOSING_START = 21 * 60 + 30;
export const CLOSING_MIN = 3;
export const CLOSING_MAX = 4;

/**
 * Eine Besetzungsregel: WO (Zeitspanne je Öffnungsblock) und WIE VIELE.
 *
 * minStaff/maxStaff sind der Wert eines Normaltags (Gewicht 1,0). Bei
 * scaled = true werden sie mit dem Tagesgewicht (DAY_WEIGHTS) multipliziert und
 * aufgerundet – Fr–So (1,5) tragen so automatisch das Anderthalbfache.
 *
 * Einzige Quelle für Scheduler, Độ phủ-Bericht und Tab „Tài liệu": wer die
 * Besetzung eines Ladens ändert, ändert nur diese Liste.
 */
export type StaffingRule = {
  label: string;
  /** Kurzbeschreibung der Zeitspanne für den Tab „Tài liệu". */
  when: string;
  minStaff: number;
  maxStaff: number;
  scaled: boolean;
  /** Nur an diesen (effektiven) Wochentagen; fehlt = an jedem offenen Tag. */
  weekdays?: readonly WeekdayKey[];
  windows: (blocks: DayBlocks) => DayWindow[];
};

/** Schneidet eine feste Uhrzeitspanne mit jedem Öffnungsblock. */
const clip = (from: number, to: number) => (blocks: DayBlocks): DayWindow[] =>
  blocks
    .map((block) => ({ startMinutes: Math.max(from, block.startMinutes), endMinutes: Math.min(to, block.endMinutes) }))
    .filter((window) => window.endMinutes > window.startMinutes);

/** Die ersten 60 Minuten eines Blocks (Aufsperren bzw. Wiederöffnen am Abend). */
const firstHour = (block: DayWindow): DayWindow =>
  ({ startMinutes: block.startMinutes, endMinutes: Math.min(block.startMinutes + 60, block.endMinutes) });

export const STAFFING_RULES: readonly StaffingRule[] = [
  {
    label: "Trong giờ mở cửa", when: "suốt mỗi khung mở", minStaff: 2, maxStaff: Infinity, scaled: false,
    windows: (blocks) => blocks.map((block) => ({ startMinutes: block.startMinutes, endMinutes: block.endMinutes })),
  },
  {
    label: "Mở cửa", when: "60′ đầu khung sáng", minStaff: 2, maxStaff: Infinity, scaled: false,
    windows: (blocks) => blocks.filter((block) => block.startMinutes < 16 * 60).map(firstHour),
  },
  {
    label: "Cuối ca trưa", when: "30′ cuối khung trưa", minStaff: 2, maxStaff: Infinity, scaled: false,
    windows: (blocks) => blocks.filter((block) => block.endMinutes < 18 * 60)
      .map((block) => ({ startMinutes: block.endMinutes - 30, endMinutes: block.endMinutes })),
  },
  {
    label: "Đầu ca tối", when: "60′ đầu khung tối", minStaff: 2, maxStaff: Infinity, scaled: false,
    windows: (blocks) => blocks.filter((block) => block.startMinutes >= 16 * 60).map(firstHour),
  },
  // Evening rush: a floor AND a ceiling. The ceiling matters most – without it
  // the optimizer piles everyone into 18–20 h and the morning falls to its minimum.
  // Trần 8 (×1,5 = 12): đủ rộng để đỉnh tối cao hơn trưa; đường nhu cầu quyết định số người.
  { label: "Tối", when: "18:00–20:00", minStaff: 4, maxStaff: 8, scaled: true, windows: clip(18 * 60, 20 * 60) },
  {
    label: "Trưa CN", when: "12:00–14:00 (CN/lễ)", minStaff: 4, maxStaff: 8, scaled: true,
    weekdays: ["sunday"], windows: clip(12 * 60, 14 * 60),
  },
  // Đóng cửa theo hệ số: 3–4 ngày thường, 5–6 ở T6–CN (tab „Tài liệu").
  {
    label: "Đóng cửa", when: "21:30–đóng cửa", minStaff: CLOSING_MIN, maxStaff: CLOSING_MAX, scaled: true,
    windows: clip(CLOSING_START, 22 * 60 + 30),
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

export function staffingWindows(blocks: DayBlocks, weekday: WeekdayKey): StaffingWindow[] {
  return STAFFING_RULES.filter((rule) => ruleAppliesOn(rule, weekday)).flatMap((rule) => {
    const range = ruleRange(rule, weekday);
    return rule.windows(blocks).map((window) => ({ label: rule.label, ...window, ...range }));
  });
}

// ── Đường nhu cầu trong ngày ────────────────────────────────────────────────
/**
 * Nhu cầu tương đối theo giờ (1,0 = bình thường) – dạng „ngọn núi": chuẩn bị,
 * lên dốc, đỉnh, xuống dốc. Thuật toán chia GIỜ CÔNG CỦA NGÀY (đã nhân hệ số
 * ngày) theo đường này thành số người mục tiêu cho từng 30 phút, rồi phạt độ
 * lệch theo bình phương – nhờ vậy số người lên xuống mượt, không dồn cục.
 *
 * CN (và ngày lễ mở cửa) có đỉnh trưa, nên cần người chuẩn bị TRƯỚC 12:00.
 */
export type DemandBand = { startMinutes: number; endMinutes: number; level: number; label: string };

const band = (from: string, to: string, level: number, label: string): DemandBand => {
  const toMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  return { startMinutes: toMinutes(from), endMinutes: toMinutes(to), level, label };
};

// Mượt theo từng ô 30 phút: mỗi bước lên/xuống tối đa ~0,2, để số người mục
// tiêu không có bậc gấp (bậc 0,8 → 1,1 → 1,5 từng làm T6 nhảy 6 → 9 → 11).
export const DEMAND_PROFILE: { weekday: readonly DemandBand[]; sunday: readonly DemandBand[] } = {
  weekday: [
    band("10:30", "11:00", 0.7, "Mở cửa, chuẩn bị"),
    band("11:00", "11:30", 0.85, "Chuẩn bị trưa"),
    band("11:30", "13:00", 1.0, "Trưa"),
    band("13:00", "13:30", 0.9, "Cuối trưa"),
    band("13:30", "14:30", 0.75, "Cuối trưa"),
    band("16:30", "17:00", 0.8, "Mở ca tối"),
    band("17:00", "17:30", 0.95, "Chuẩn bị tối"),
    band("17:30", "18:00", 1.15, "Trước cao điểm"),
    band("18:00", "18:30", 1.35, "Vào cao điểm"),
    band("18:30", "19:30", 1.5, "Cao điểm tối"),
    band("19:30", "20:00", 1.35, "Cao điểm tối"),
    band("20:00", "20:30", 1.2, "Sau cao điểm"),
    band("20:30", "21:00", 1.05, "Sau cao điểm"),
    band("21:00", "21:30", 0.95, "Vãn khách"),
    band("21:30", "22:30", 0.8, "Đóng cửa"),
  ],
  // CN: đông nhất là buổi TRƯA – đỉnh trưa cao hơn đỉnh tối, có dốc chuẩn bị từ 10:30.
  sunday: [
    band("10:30", "11:00", 0.9, "Mở cửa, chuẩn bị"),
    band("11:00", "11:30", 1.1, "Chuẩn bị trưa"),
    band("11:30", "12:00", 1.3, "Trước cao điểm trưa"),
    band("12:00", "12:30", 1.5, "Vào cao điểm trưa"),
    band("12:30", "13:30", 1.6, "Cao điểm trưa"),
    band("13:30", "14:00", 1.45, "Cao điểm trưa"),
    band("14:00", "14:30", 1.2, "Sau trưa"),
    band("14:30", "15:00", 1.0, "Chiều"),
    band("15:00", "16:00", 0.85, "Chiều vắng"),
    band("16:00", "16:30", 0.9, "Chiều"),
    band("16:30", "17:00", 1.0, "Chiều"),
    band("17:00", "17:30", 1.1, "Chuẩn bị tối"),
    band("17:30", "18:00", 1.2, "Trước cao điểm"),
    band("18:00", "19:30", 1.3, "Cao điểm tối"),
    band("19:30", "20:00", 1.25, "Cao điểm tối"),
    band("20:00", "20:30", 1.15, "Sau cao điểm"),
    band("20:30", "21:00", 1.05, "Sau cao điểm"),
    band("21:00", "21:30", 0.95, "Vãn khách"),
    band("21:30", "22:30", 0.85, "Đóng cửa"),
  ],
};

export function demandProfileOf(weekday: WeekdayKey): readonly DemandBand[] {
  return weekday === "sunday" ? DEMAND_PROFILE.sunday : DEMAND_PROFILE.weekday;
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

/**
 * Giờ công mục tiêu mỗi ngày, chuẩn hoá trong từng ISO-week (không mượn giữa các tuần):
 *   giờ ngày = giờ tuần × (hệ số × phút mở) ÷ Σ(hệ số × phút mở)
 * Nhân phút mở để hệ số là MẬT ĐỘ người: CN mở 11,5h không thưa hơn T6/T7 mở 10h.
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
