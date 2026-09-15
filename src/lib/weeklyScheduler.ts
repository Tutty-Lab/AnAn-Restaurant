import type { Employee, Shift } from "../types";
import { DAY_WEIGHTS, datesOfMonth, parseIsoDate, weekdayKeyOf, type WeekdayKey } from "./demand";
import { monthlyBudgetMinutes, weeklyBudgetMinutes } from "./contract";
import { calculatePause } from "./time";
import { mayWorkOn } from "./availability";
import { consecutiveRunLengthWith, maxConsecutiveRun } from "./consecutive";
import { effectiveWeekdayKey, resolveDay, type DayBlocks, type DayWindow, type OverrideMap, type WorkHoursConfig } from "./workHours";
import { publicHolidays } from "./holidays";
import { weekStartOf } from "./weeks";
import {
  CLOSING_START,
  PEAK_LEVEL,
  STAFF_GROUPS,
  driverWindowOf,
  presentGroups,
  slotTargets,
  staffGroupOf,
  staffingWindows,
  staffRange,
  weightedDailyTargets,
  workingAt,
  workBlocksFor,
  workloadAt,
  type StaffGroup,
} from "./staffing";

type WeeklyInput = {
  year: number;
  month: number;
  workHours: WorkHoursConfig;
  overrides?: OverrideMap;
  employees: Employee[];
  holidays?: Set<string>;
};
type Option = { shifts: Shift[]; styleCost: number };
type Choice = { date: string; paid: number; option: Option };
type Allocation = { paid: number; cost: number; mask: number; choices: Choice[] };
type Day = ReturnType<typeof resolveDay>;

/** Alles, was jede Bewertung braucht und sich innerhalb eines Laufs nicht ändert. */
type Ctx = {
  holidays: Set<string>;
  days: Map<string, Day>;
  dailyTargets: Map<string, number>;
  groupOf: Map<string, StaffGroup>;
  present: ReadonlySet<StaffGroup>;
  /** Offene Tage einer vollen Woche laut Wochenplan (AnAn: 7). */
  fullWeekDays: number;
  /** Vollzeit: festes Muster je Wochentag -> Signatur der Dienste. */
  patterns: Map<string, Map<WeekdayKey, string>>;
};

const SLOT = 30;
const MIN_SHIFT = 180;
/** Fahrer: kürzester Dienst im Fahrerfenster – damit der Monatsvertrag im 30-Minuten-Raster aufgeht. */
const DRIVER_MIN_SHIFT = 120;
/** Höchste bezahlte Zeit je Tag (siehe validation.ts). */
const MAX_PAID = 540;
/** Cost per (person deviation)² per 30-minute slot against the demand curve. */
const SLOT_DEVIATION_COST = 300;
/** Small preference for one continuous shift over a split shift on the same day. */
const SPLIT_SHIFT_COST = 8;
/**
 * Gewichte der personenbezogenen Vorlieben. Exportiert, damit Auswertungen
 * Varianten vergleichen können; die App ändert sie nie.
 */
export const SCHEDULER_TUNING = {
  /** Teilzeit/Minijob: je 30 Minuten außerhalb der Abendspitze (× Abstand zur Spitze). */
  peakSlotCost: 150,
  /** Teilzeit/Minijob: je 30 Minuten an einem ruhigen Tag (× Abstand zum stärksten Gewicht). */
  peakDayCost: 100,
  /** Vollzeit: Dienst weicht vom festen Wochenmuster ab. */
  patternShiftCost: 3000,
  /** Vollzeit: Arbeit an einem Wochentag, der im Muster frei ist. */
  patternDayCost: 3000,
  /** Durchläufe „Woche je Person neu planen". */
  refitPasses: 3,
  /** Fahrer: je 30 Minuten, die ein Dienst kürzer ist als das Fahrerfenster. */
  driverShortCost: 1000,
  /**
   * Reihenfolge der Wochen, gemessen Sep 2026–Aug 2027 mit der echten Belegschaft
   * (Khung sai 73 → 22): Randwochen mit ≤ 2 Tagen zuerst (sonst sperrt eine volle
   * Woche den einzelnen Randtag, 7 Tage am Stück), lange angebrochene Wochen für
   * Vollzeit/Azubi erst nach den vollen Wochen (sonst legt die erste volle Woche
   * für alle denselben freien Montag fest – Montagabend ohne Küche).
   */
  shortEdgeDays: 2,
  /** true = lange angebrochene Wochen (mehr als shortEdgeDays Tage) erst nach den vollen Wochen planen. */
  partialAfterFull: true,
  /** false = diese Reihenfolge nur für Vollzeit und Azubi (feste Muster); alle anderen planen zeitlich. */
  partialAfterFullAll: false,
  /** true = auch Wochenverträge (Azubi 39 h) planen die lange Randwoche zuletzt – mit zeitlichem Rückfall, wenn Stunden fehlen. */
  partialAfterFullWeekly: true,
  /** Kürzester Abendteil eines geteilten Dienstes in einer angebrochenen Woche (wie in vollen Wochen: 3 h). */
  partialEveningMin: 180,
  /** true = Teilzeit/Minijob vor Azubi und Vollzeit planen (nehmen sich die Stoßzeiten). */
  peakFirst: true,
  /**
   * false = Teilzeit/Minijob der Küche erst nach der Vollzeit. Gemessen Okt 2026–
   * Mär 2027: Mittagsküche ≠ 2 an 8 statt 16 Tagen, Teilzeit in der Abendspitze
   * 67 % statt 55 % – die Regel „mittags 2 in der Küche" geht vor der Vorliebe.
   */
  peakFirstKitchen: false,
  /** false = Teilzeit/Minijob im Service erst nach Azubi und Vollzeit (füllen die Service-Lücken). */
  peakFirstService: true,
};

const MAX_DAY_WEIGHT = Math.max(...Object.values(DAY_WEIGHTS));
const GROUP_INDEX: Record<StaffGroup, number> = { KITCHEN: 0, SERVICE: 1, DRIVER: 2 };
const groupMask = (groups: readonly StaffGroup[]) => groups.reduce((mask, group) => mask | (1 << GROUP_INDEX[group]), 0);

function hash(value: string): number {
  let result = 0;
  for (const char of value) result = (result * 31 + char.charCodeAt(0)) >>> 0;
  return result;
}

function dayOf(date: string): WeekdayKey {
  return weekdayKeyOf(parseIsoDate(date));
}

const openMinutesOfBlocks = (blocks: DayBlocks) =>
  blocks.reduce((sum, block) => sum + (block.endMinutes - block.startMinutes), 0);

/** Teilzeit und Minijob arbeiten bevorzugt in der Stoßzeit (Vorgabe des Betriebs). */
export function prefersPeak(employee: Employee): boolean {
  return employee.employmentType === "TEILZEIT" || employee.employmentType === "MINIJOB";
}

function fixedPaid(window: DayWindow): number {
  const presence = window.endMinutes - window.startMinutes;
  for (const pause of [0, 30, 60]) {
    const paid = presence - pause;
    if (paid > 0 && calculatePause(paid) === pause) return paid;
  }
  return 0;
}

/**
 * Valid pause starts (§ 4 ArbZG): at least 1 h after the start and before the
 * end, at most 6 h of work before and after the pause, on the 30-minute grid.
 */
function pauseStartCandidates(startMinutes: number, endMinutes: number, pauseMinutes: number): number[] {
  if (pauseMinutes <= 0) return [];
  return Array.from(
    { length: Math.max(0, Math.floor((endMinutes - pauseMinutes - 60 - (startMinutes + 60)) / SLOT) + 1) },
    (_, index) => startMinutes + 60 + index * SLOT,
  ).filter((start) => start - startMinutes <= 360 && endMinutes - start - pauseMinutes <= 360);
}

function makeShift(
  employeeId: string,
  date: string,
  startMinutes: number,
  paidMinutes: number,
  shiftType: "EARLY" | "LATE",
  effectiveWeekday?: WeekdayKey,
): Shift {
  const pauseMinutes = calculatePause(paidMinutes);
  const endMinutes = startMinutes + paidMinutes + pauseMinutes;
  const weekday = effectiveWeekday ?? dayOf(date);
  // First guess: quietest part of the demand curve, never the closing window.
  // improveCoverage later moves pauses by the REAL headcount of the day.
  const pauseStartMinutes = pauseMinutes > 0 ? pauseStartCandidates(startMinutes, endMinutes, pauseMinutes).sort((a, b) => {
    const score = (start: number) => Array.from({ length: pauseMinutes / SLOT }, (_, index) => start + index * SLOT)
      .reduce((sum, minute) => sum + workloadAt(minute, weekday) + (minute >= CLOSING_START ? 100 : 0), 0);
    return score(a) - score(b) || ((a / SLOT + hash(employeeId)) % 7) - ((b / SLOT + hash(employeeId)) % 7);
  })[0] : undefined;
  return {
    id: `weekly-${employeeId}-${date}-${startMinutes}-${paidMinutes}`,
    employeeId, date, startMinutes,
    endMinutes,
    ...(pauseStartMinutes == null ? {} : { pauseStartMinutes }),
    pauseMinutes, paidMinutes, shiftType, generated: true,
  };
}

/** Every start on the 30-minute grid inside the block (plus the block-end anchor). */
function startsInBlock(block: DayWindow, presence: number): number[] {
  const starts: number[] = [];
  for (let start = block.startMinutes; start + presence <= block.endMinutes; start += SLOT) starts.push(start);
  const endAnchored = block.endMinutes - presence;
  if (endAnchored >= block.startMinutes && !starts.includes(endAnchored)) starts.push(endAnchored);
  return starts;
}

const signatureOf = (shifts: readonly Shift[]) =>
  [...shifts].sort((a, b) => a.startMinutes - b.startMinutes).map((shift) => `${shift.startMinutes}-${shift.endMinutes}`).join("|");

/**
 * Personenbezogene Vorlieben eines Tagesdienstes (unabhängig von den anderen):
 *  - geteilter Dienst: kleiner Aufschlag,
 *  - Teilzeit/Minijob: Zeit außerhalb der Abendspitze und an ruhigen Tagen kostet,
 *  - Vollzeit: Abweichung vom festen Wochenmuster kostet.
 */
function styleCostOf(employee: Employee, date: string, weekday: WeekdayKey, shifts: readonly Shift[], ctx: Ctx): number {
  if (shifts.length === 0) return 0;
  let cost = (shifts.length - 1) * SPLIT_SHIFT_COST;
  if (prefersPeak(employee)) {
    let paidSlots = 0;
    for (const shift of shifts) {
      for (let minute = shift.startMinutes; minute < shift.endMinutes; minute += SLOT) {
        if (!workingAt(shift, minute)) continue;
        paidSlots++;
        cost += (PEAK_LEVEL - workloadAt(minute, weekday)) * SCHEDULER_TUNING.peakSlotCost;
      }
    }
    cost += (MAX_DAY_WEIGHT - DAY_WEIGHTS[weekday]) * paidSlots * SCHEDULER_TUNING.peakDayCost;
  }
  if (staffGroupOf(employee) === "DRIVER") {
    // Am liebsten das ganze Fahrerfenster; kürzer nur, um den Vertrag genau zu treffen.
    const window = driverWindowOf(weekday);
    const present = shifts.reduce((sum, shift) => sum + shift.endMinutes - shift.startMinutes, 0);
    cost += Math.max(0, window.endMinutes - window.startMinutes - present) / SLOT * SCHEDULER_TUNING.driverShortCost;
  }
  if (employee.employmentType === "VOLLZEIT") {
    const pattern = ctx.patterns.get(employee.id);
    if (pattern && pattern.size > 0) {
      const expected = pattern.get(dayOf(date));
      if (expected == null) cost += SCHEDULER_TUNING.patternDayCost;
      else if (expected !== signatureOf(shifts)) cost += SCHEDULER_TUNING.patternShiftCost;
    }
  }
  return cost;
}

function optionsFor(
  employee: Employee,
  date: string,
  paid: number,
  blocks: DayBlocks,
  partialWeek: boolean,
  weekday: WeekdayKey,
  ctx: Ctx,
): Option[] {
  if (paid <= 0 || paid > MAX_PAID) return [];
  // Fahrer arbeiten nur im Fahrerfenster (18–21 Uhr, sonntags/feiertags 18–22 Uhr).
  blocks = workBlocksFor(employee, blocks, weekday);
  const add =(shifts: Shift[]) => options.push({ shifts, styleCost: styleCostOf(employee, date, weekday, shifts, ctx) });
  const options: Option[] = [];
  if (employee.fixedShift) {
    if (fixedPaid(employee.fixedShift) === paid) add([makeShift(employee.id, date, employee.fixedShift.startMinutes, paid, "EARLY", weekday)]);
    return options;
  }
  const placements = (block: DayWindow, duration: number, early: boolean): Shift[] =>
    startsInBlock(block, duration + calculatePause(duration))
      .map((start) => makeShift(employee.id, date, start, duration, early ? "EARLY" : "LATE", weekday));

  blocks.forEach((block, index) => {
    for (const shift of placements(block, paid, index === 0 && block.startMinutes < 16 * 60)) add([shift]);
  });
  // Split shift: one part in the first block, one in the last; the lunch closure is unpaid.
  const minimumEvening = partialWeek ? SCHEDULER_TUNING.partialEveningMin : MIN_SHIFT;
  if (paid >= MIN_SHIFT + minimumEvening && blocks.length >= 2) {
    const first = blocks[0];
    const last = blocks[blocks.length - 1];
    for (let morning = MIN_SHIFT; morning <= Math.min(paid - minimumEvening, first.endMinutes - first.startMinutes); morning += SLOT) {
      const evenings = placements(last, paid - morning, false);
      for (const early of placements(first, morning, true)) {
        for (const late of evenings) {
          if (early.endMinutes <= late.startMinutes) add([early, late]);
        }
      }
    }
  }
  // Ngày mở liên tục (T7, CN, lễ – blocks.length === 1): một ca liền, giờ nghỉ xếp trong ca theo luật.
  return options;
}

/**
 * Everything about a day that does not depend on the shifts, computed once:
 * the 30-minute slots of the open blocks, their in-house target headcount
 * (demand curve) and, per staffing window, which slots and groups it covers.
 */
type DayModel = {
  minutes: number[];
  targets: number[];
  windows: { slots: number[]; overlap: number[]; minStaff: number; maxStaff: number; mask: number }[];
};
const dayModelCache = new Map<string, DayModel>();
function dayModel(blocks: DayBlocks, weekday: WeekdayKey, targetHours: number, present: ReadonlySet<StaffGroup>): DayModel {
  const presentKey = STAFF_GROUPS.filter((group) => present.has(group)).join("");
  const key = `${weekday}|${presentKey}|${blocks.map((b) => `${b.startMinutes}-${b.endMinutes}`).join(",")}|${targetHours.toFixed(4)}`;
  const cached = dayModelCache.get(key);
  if (cached) return cached;
  const slotList = slotTargets(blocks, weekday, targetHours, SLOT);
  const minutes = slotList.map(([minute]) => minute);
  const windows = staffingWindows(blocks, weekday, present).map((window) => {
    const slots: number[] = [];
    const overlap: number[] = [];
    minutes.forEach((minute, index) => {
      const covered = Math.min(window.endMinutes, minute + SLOT) - Math.max(window.startMinutes, minute);
      if (covered > 0) { slots.push(index); overlap.push(covered); }
    });
    return { slots, overlap, minStaff: window.minStaff, maxStaff: window.maxStaff, mask: groupMask(window.groups) };
  });
  const model = { minutes, targets: slotList.map(([, target]) => target), windows };
  if (dayModelCache.size > 5000) dayModelCache.clear();
  dayModelCache.set(key, model);
  return model;
}

/**
 * Day cost from headcounts per 30-minute slot and group (shifts and pauses lie on that grid):
 *  - staffing windows: every missing/extra person-minute of the window's groups costs 500,
 *  - demand curve: squared deviation of the IN-HOUSE headcount from the slot target,
 *  - paid hours: squared deviation of the in-house hours from the day's weighted hours.
 * Drivers only count for their own window.
 */
function dayCost(shifts: Shift[], blocks: DayBlocks, weekday: WeekdayKey, targetHours: number | undefined, ctx: Ctx): number {
  if (blocks.length === 0) return 0;
  const model = dayModel(blocks, weekday, targetHours ?? 0, ctx.present);
  const n = model.minutes.length;
  const counts = [new Array<number>(n).fill(0), new Array<number>(n).fill(0), new Array<number>(n).fill(0)];
  let paid = 0;
  for (const shift of shifts) {
    const group = GROUP_INDEX[ctx.groupOf.get(shift.employeeId) ?? "SERVICE"];
    if (group !== GROUP_INDEX.DRIVER) paid += shift.paidMinutes;
    const row = counts[group];
    for (let i = 0; i < n; i++) if (workingAt(shift, model.minutes[i])) row[i]++;
  }
  let cost = 0;
  for (const window of model.windows) {
    for (let k = 0; k < window.slots.length; k++) {
      const slot = window.slots[k];
      let staff = 0;
      for (let g = 0; g < counts.length; g++) if (window.mask & (1 << g)) staff += counts[g][slot];
      cost += (Math.max(0, window.minStaff - staff) + Math.max(0, staff - window.maxStaff)) * window.overlap[k] * 500;
    }
  }
  for (let i = 0; i < n; i++) {
    const inHouse = counts[GROUP_INDEX.KITCHEN][i] + counts[GROUP_INDEX.SERVICE][i];
    cost += (inHouse - model.targets[i]) ** 2 * SLOT_DEVIATION_COST;
  }
  cost += (paid / 60 - (targetHours ?? 0)) ** 2 * 1500;
  return cost;
}

function dayLimit(employee: Employee): number {
  return Math.min(6, employee.maxDaysPerWeek ?? 6);
}

function chooseWeek(
  employee: Employee,
  dates: string[],
  target: number,
  existing: Shift[],
  ctx: Ctx,
): Choice[] {
  const { days, holidays, dailyTargets } = ctx;
  const eligible = dates.filter((date) => mayWorkOn(employee, date));
  const limit = Math.min(dayLimit(employee), eligible.length);
  if (target <= 0 || limit <= 0) return [];
  const fixed = employee.fixedShift ? fixedPaid(employee.fixedShift) : 0;
  if (employee.fixedShift && fixed === 0) return [];
  const preferredCount = fixed
    ? Math.min(limit, Math.floor(target / fixed))
    : Math.min(limit, Math.max(1, Math.floor(target / MIN_SHIFT)));

  // Jeder Tag darf 3–9 h tragen (bis zum Wochenrest); die Wunschlänge ist nur
  // weich (lengthCost). Eine Untergrenze aus dem Wochendurchschnitt zwang
  // Vollzeitkräfte an jedem Werktag in einen geteilten Dienst – abends passen
  // Mo–Fr nur 5,5 h – und damit alle in die Mittagsküche (erlaubt: 2).
  const minShift = staffGroupOf(employee) === "DRIVER" ? DRIVER_MIN_SHIFT : MIN_SHIFT;
  const durations = fixed
    ? [fixed]
    : target < minShift
      ? [target]
      : Array.from({ length: Math.floor((Math.min(MAX_PAID, target) - minShift) / SLOT) + 1 }, (_, i) => minShift + i * SLOT);

  const worked = new Set(existing.filter((shift) => shift.employeeId === employee.id).map((shift) => shift.date));
  const validMasks = new Map<number, boolean>();
  const valid = (mask: number) => {
    const cached = validMasks.get(mask);
    if (cached != null) return cached;
    const set = new Set(worked);
    let ok = true;
    eligible.forEach((date, index) => {
      if ((mask & (1 << index)) === 0) return;
      if (consecutiveRunLengthWith(set, date) > 6) ok = false;
      set.add(date);
    });
    validMasks.set(mask, ok);
    return ok;
  };

  // Ideale Dienstlänge je Tag folgt demselben Faktor wie das Tagesziel
  // (Gewicht × Öffnungsdauer, Tab „Tài liệu") – bei gleicher Wochensumme.
  const factorOf = (date: string) =>
    DAY_WEIGHTS[effectiveWeekdayKey(date, holidays)] * openMinutesOfBlocks(days.get(date)!.blocks);
  const averageFactor = eligible.reduce((sum, date) => sum + factorOf(date), 0) / eligible.length;
  const partialWeek = dates.length < ctx.fullWeekDays;

  let states = new Map<number, Allocation>([[0, { paid: 0, cost: 0, mask: 0, choices: [] }]]);
  for (let index = 0; index < eligible.length; index++) {
    const date = eligible[index];
    const day = days.get(date)!;
    const occupied = existing.filter((shift) => shift.date === date);
    const weekday = effectiveWeekdayKey(date, holidays);
    const ideal = averageFactor > 0 ? target / Math.max(1, preferredCount) * factorOf(date) / averageFactor : 0;
    const before = dayCost(occupied, day.blocks, weekday, dailyTargets.get(date), ctx);
    const candidates: { choice: Choice; cost: number }[] = [];
    // Continuous days (T7, CN, lễ – one long block) get the softest length
    // preference, so lunch-only and evening-only shifts can shape the day.
    const lengthCost = day.blocks.length === 1 ? 40 : 150;
    for (const paid of durations) {
      let best: Option | undefined;
      let score = Infinity;
      for (const option of optionsFor(employee, date, paid, day.blocks, partialWeek, weekday, ctx)) {
        const cost = dayCost([...occupied, ...option.shifts], day.blocks, weekday, dailyTargets.get(date), ctx) - before + option.styleCost;
        if (cost < score) { best = option; score = cost; }
      }
      if (best) candidates.push({
        choice: { date, paid, option: best },
        cost: score + ((paid - ideal) / SLOT) ** 2 * lengthCost,
      });
    }
    const next = new Map(states);
    for (const state of states.values()) {
      if (state.choices.length >= limit) continue;
      const mask = state.mask | (1 << index);
      if (!valid(mask)) continue;
      for (const candidate of candidates) {
        const paid = state.paid + candidate.choice.paid;
        if (paid > target) continue;
        const key = paid * 128 + mask;
        const cost = state.cost + candidate.cost;
        if (cost >= (next.get(key)?.cost ?? Infinity)) continue;
        next.set(key, { paid, cost, mask, choices: [...state.choices, candidate.choice] });
      }
    }
    states = next;
  }
  // Exact weekly minutes take priority. An impossible quota stays short and
  // is reported by validation, never transferred to another week.
  let best: Allocation | undefined;
  let bestCost = Infinity;
  for (const state of states.values()) {
    // Die Tageszahl hält, die Länge je Tag folgt dem Gewicht.
    const cost = state.cost + (state.choices.length - preferredCount) ** 2 * 50000;
    if (!best || state.paid > best.paid || (state.paid === best.paid && cost < bestCost)) {
      best = state;
      bestCost = cost;
    }
  }
  return best?.choices ?? [];
}

/**
 * Final per-day polish, keeping every person's paid minutes for the day:
 *  1. move a person's shift(s) to a better start (all 30-minute options),
 *  2. move each pause to the valid pause start that fits the REAL headcount,
 *  3. continuous days: hand the closing role from one person to another.
 * Personal preferences (styleCostOf) are part of every comparison.
 */
function improveCoverage(result: Shift[], employees: Employee[], ctx: Ctx): Shift[] {
  const { days, holidays, dailyTargets } = ctx;
  const byId = new Map(employees.map((employee) => [employee.id, employee] as const));
  const output: Shift[] = [];
  for (const [date, day] of days) {
    let onDay = result.filter((shift) => shift.date === date);
    const weekday = effectiveWeekdayKey(date, holidays);
    const target = dailyTargets.get(date);
    const partialWeek = [...days].filter(([otherDate, otherDay]) => !otherDay.closed && weekStartOf(otherDate) === weekStartOf(date)).length < ctx.fullWeekDays;
    const style = (employeeId: string, shifts: readonly Shift[]) => {
      const employee = byId.get(employeeId);
      return employee ? styleCostOf(employee, date, weekday, shifts, ctx) : 0;
    };
    for (let pass = 0; pass < 4; pass++) {
      const baseline = dayCost(onDay, day.blocks, weekday, target, ctx);
      let changed = false;
      for (const employee of employees) {
        const own = onDay.filter((shift) => shift.employeeId === employee.id);
        if (own.length === 0) continue;
        const paid = own.reduce((sum, shift) => sum + shift.paidMinutes, 0);
        const others = onDay.filter((shift) => shift.employeeId !== employee.id);
        let bestCost = dayCost(onDay, day.blocks, weekday, target, ctx) + style(employee.id, own);
        let best: Shift[] | undefined;
        for (const option of optionsFor(employee, date, paid, day.blocks, partialWeek, weekday, ctx)) {
          const cost = dayCost([...others, ...option.shifts], day.blocks, weekday, target, ctx) + option.styleCost;
          if (cost < bestCost - 1e-9) { best = option.shifts; bestCost = cost; }
        }
        if (best) { onDay = [...others, ...best]; changed = true; }
      }
      for (let i = 0; i < onDay.length; i++) {
        const shift = onDay[i];
        if (shift.pauseMinutes <= 0) continue;
        const others = onDay.filter((_, k) => k !== i);
        let bestCost = dayCost(onDay, day.blocks, weekday, target, ctx);
        let best: Shift | undefined;
        for (const start of pauseStartCandidates(shift.startMinutes, shift.endMinutes, shift.pauseMinutes)) {
          if (start === shift.pauseStartMinutes) continue;
          const moved = { ...shift, pauseStartMinutes: start };
          const cost = dayCost([...others, moved], day.blocks, weekday, target, ctx);
          if (cost < bestCost - 1e-9) { best = moved; bestCost = cost; }
        }
        if (best) { onDay = [...others.slice(0, i), best, ...others.slice(i)]; changed = true; }
      }
      // Continuous days: hand over the closing role. A single-person move never
      // sees "B closes instead, A starts earlier".
      if (day.blocks.length === 1) {
        const blockEnd = day.blocks[0].endMinutes;
        for (const closer of onDay.filter((shift) => shift.endMinutes === blockEnd)) {
          for (const other of onDay.filter((shift) => shift.endMinutes !== blockEnd)) {
            if (!onDay.includes(closer) || !onDay.includes(other)) continue;
            const empA = byId.get(closer.employeeId);
            const empB = byId.get(other.employeeId);
            if (!empA || !empB || empA.fixedShift || empB.fixedShift || empA.id === empB.id) continue;
            const rest = onDay.filter((shift) => shift !== closer && shift !== other);
            const newClosers = optionsFor(empB, date, other.paidMinutes, day.blocks, partialWeek, weekday, ctx)
              .filter((option) => option.shifts[option.shifts.length - 1].endMinutes === blockEnd);
            if (newClosers.length === 0) continue;
            const movesA = optionsFor(empA, date, closer.paidMinutes, day.blocks, partialWeek, weekday, ctx);
            let bestCost = dayCost(onDay, day.blocks, weekday, target, ctx) + style(empA.id, [closer]) + style(empB.id, [other]);
            let best: Shift[] | undefined;
            for (const optionB of newClosers) for (const optionA of movesA) {
              const cost = dayCost([...rest, ...optionB.shifts, ...optionA.shifts], day.blocks, weekday, target, ctx) + optionA.styleCost + optionB.styleCost;
              if (cost < bestCost - 1e-9) { best = [...optionB.shifts, ...optionA.shifts]; bestCost = cost; }
            }
            if (best) { onDay = [...rest, ...best]; changed = true; }
          }
        }
      }
      if (!changed || dayCost(onDay, day.blocks, weekday, target, ctx) >= baseline) break;
    }
    output.push(...onDay);
  }
  return output;
}

/**
 * Letzte Lücke im Soll schließen: fehlt jemandem noch mindestens eine
 * Rastereinheit (z. B. weil eine Randwoche einen Tag wegen 7 Tagen am Stück
 * sperrte), wird ein bestehender Dienst um 30 Minuten verlängert – am Anfang oder
 * am Ende, dort, wo es die Tagesbewertung am wenigsten stört. Grenzen bleiben:
 * Öffnungs-/Fahrerfenster, 9 h je Tag, Wochenvertrag, keine Überschneidung.
 */
function topUpShortfalls(result: Shift[], employees: Employee[], budgets: Map<string, Map<string, number>>, ctx: Ctx): Shift[] {
  let shifts = [...result];
  const paidOf = (list: Shift[]) => list.reduce((sum, shift) => sum + shift.paidMinutes, 0);
  for (const employee of employees) {
    if (employee.fixedShift) continue;
    const weekly = budgets.get(employee.id) ?? new Map<string, number>();
    const budgetTotal = [...weekly.values()].reduce((sum, minutes) => sum + minutes, 0);
    for (let round = 0; round < 20; round++) {
      const own = shifts.filter((shift) => shift.employeeId === employee.id);
      if (budgetTotal - paidOf(own) < SLOT) break;
      let best: { old: Shift; next: Shift; delta: number } | undefined;
      for (const shift of own) {
        const day = ctx.days.get(shift.date);
        if (!day || day.closed) continue;
        const week = weekStartOf(shift.date);
        if (employee.weeklyHours != null && paidOf(own.filter((s) => weekStartOf(s.date) === week)) + SLOT > (weekly.get(week) ?? 0)) continue;
        const ownDay = own.filter((s) => s.date === shift.date);
        if (paidOf(ownDay) + SLOT > MAX_PAID) continue;
        const weekday = effectiveWeekdayKey(shift.date, ctx.holidays);
        const blocks = workBlocksFor(employee, day.blocks, weekday);
        const paid = shift.paidMinutes + SLOT;
        const presence = paid + calculatePause(paid);
        const others = shifts.filter((s) => s.date === shift.date && s !== shift);
        const sameDayOwn = ownDay.filter((s) => s !== shift);
        const before = dayCost([...others, shift], day.blocks, weekday, ctx.dailyTargets.get(shift.date), ctx)
          + styleCostOf(employee, shift.date, weekday, ownDay, ctx);
        for (const start of new Set([shift.startMinutes, shift.endMinutes - presence])) {
          const end = start + presence;
          if (!blocks.some((block) => start >= block.startMinutes && end <= block.endMinutes)) continue;
          if (sameDayOwn.some((s) => s.startMinutes < end && start < s.endMinutes)) continue;
          const next = makeShift(employee.id, shift.date, start, paid, shift.shiftType === "EARLY" ? "EARLY" : "LATE", weekday);
          const delta = dayCost([...others, next], day.blocks, weekday, ctx.dailyTargets.get(shift.date), ctx)
            + styleCostOf(employee, shift.date, weekday, [...sameDayOwn, next], ctx) - before;
          if (!best || delta < best.delta) best = { old: shift, next, delta };
        }
      }
      if (!best) break;
      shifts = [...shifts.filter((s) => s !== best!.old), best.next];
    }
  }
  return shifts;
}

/**
 * Ganzen Arbeitstag verlegen: fehlt an einem Tag jemand aus einem Bereich
 * (Fahrer, Service, Küche), wird der Dienst einer Person desselben Bereichs von
 * einem anderen Tag derselben Woche dorthin verlegt – gleiche bezahlte Zeit,
 * gleiche Tageszahl, höchstens 6 Tage am Stück. Nur wenn beide Tage zusammen
 * besser werden. So fährt z. B. an jedem Abend ein Fahrer, statt an einem Tag
 * zwei und am nächsten keiner.
 */
function moveWorkDays(result: Shift[], employees: Employee[], ctx: Ctx): Shift[] {
  let shifts = [...result];
  const weekdayOf = (date: string) => effectiveWeekdayKey(date, ctx.holidays);
  const dayScore = (date: string, list: Shift[]) =>
    dayCost(list, ctx.days.get(date)!.blocks, weekdayOf(date), ctx.dailyTargets.get(date), ctx);
  const openDates = [...ctx.days].filter(([, day]) => !day.closed).map(([date]) => date);
  /** Bereiche, deren Mindestbesetzung an diesem Tag irgendwo unterschritten ist. */
  const shortGroups = (date: string): Set<StaffGroup> => {
    const day = ctx.days.get(date)!;
    const onDay = shifts.filter((s) => s.date === date);
    const out = new Set<StaffGroup>();
    for (const window of staffingWindows(day.blocks, weekdayOf(date), ctx.present)) {
      const staff = onDay.filter((s) => window.groups.includes(ctx.groupOf.get(s.employeeId) ?? "SERVICE"));
      if (staffRange(staff, window.startMinutes, window.endMinutes).min < window.minStaff) {
        for (const group of window.groups) out.add(group);
      }
    }
    return out;
  };

  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    const short = new Map(openDates.map((date) => [date, shortGroups(date)]));
    for (const employee of employees) {
      if (employee.fixedShift) continue;
      const group = staffGroupOf(employee);
      const own = shifts.filter((s) => s.employeeId === employee.id);
      const ownDates = new Set(own.map((s) => s.date));
      let best: { from: string; to: string; next: Shift[]; delta: number } | undefined;
      for (const to of openDates) {
        if (ownDates.has(to) || !short.get(to)!.has(group) || !mayWorkOn(employee, to)) continue;
        const week = weekStartOf(to);
        const onTo = shifts.filter((s) => s.date === to);
        const baseTo = dayScore(to, onTo);
        const partialWeek = openDates.filter((d) => weekStartOf(d) === week).length < ctx.fullWeekDays;
        for (const from of ownDates) {
          if (weekStartOf(from) !== week) continue;
          const dates = new Set(ownDates);
          dates.delete(from);
          dates.add(to);
          if (maxConsecutiveRun(dates) > 6) continue;
          const ownFrom = own.filter((s) => s.date === from);
          const paid = ownFrom.reduce((sum, s) => sum + s.paidMinutes, 0);
          const onFrom = shifts.filter((s) => s.date === from);
          const deltaFrom = dayScore(from, onFrom.filter((s) => s.employeeId !== employee.id))
            - dayScore(from, onFrom) - styleCostOf(employee, from, weekdayOf(from), ownFrom, ctx);
          for (const option of optionsFor(employee, to, paid, ctx.days.get(to)!.blocks, partialWeek, weekdayOf(to), ctx)) {
            const delta = deltaFrom + dayScore(to, [...onTo, ...option.shifts]) + option.styleCost - baseTo;
            if (delta < -1e-6 && (!best || delta < best.delta)) best = { from, to, next: option.shifts, delta };
          }
        }
      }
      if (best) {
        const chosen = best;
        shifts = [...shifts.filter((s) => !(s.employeeId === employee.id && s.date === chosen.from)), ...chosen.next];
        short.set(chosen.from, shortGroups(chosen.from));
        short.set(chosen.to, shortGroups(chosen.to));
        moved = true;
      }
    }
    if (!moved) break;
  }
  return shifts;
}

/**
 * 30 Minuten verschieben: ein Dienst derselben Person wird kürzer, ein anderer an
 * einem anderen Tag länger – bei Wochenverträgen innerhalb derselben Woche, bei
 * Monatsverträgen im ganzen Monat. Wochen- bzw. Monatssumme bleibt gleich. So schließt z. B. ein Azubi die letzte halbe Stunde Service am
 * Montagmittag mit Zeit von einem Sonntag, an dem der Service zu dritt ist.
 * Nur wenn die Tagesbewertung beider Tage zusammen besser wird.
 */
function rebalanceWithinWeeks(result: Shift[], employees: Employee[], ctx: Ctx): Shift[] {
  let shifts = [...result];
  const weekdayOf = (date: string) => effectiveWeekdayKey(date, ctx.holidays);
  const dayScore = (date: string, list: Shift[]) =>
    dayCost(list, ctx.days.get(date)!.blocks, weekdayOf(date), ctx.dailyTargets.get(date), ctx);

  for (const employee of employees) {
    if (employee.fixedShift) continue;
    const minPaid = staffGroupOf(employee) === "DRIVER" ? DRIVER_MIN_SHIFT : MIN_SHIFT;
    /** Derselbe Dienst um ±30 Minuten, am Anfang oder am Ende – nur gültige Varianten. */
    const resized = (shift: Shift, change: number): Shift[] => {
      const paid = shift.paidMinutes + change;
      const day = ctx.days.get(shift.date);
      if (!day || paid < minPaid || paid > MAX_PAID) return [];
      const weekday = weekdayOf(shift.date);
      const blocks = workBlocksFor(employee, day.blocks, weekday);
      const presence = paid + calculatePause(paid);
      const sameDayOwn = shifts.filter((s) => s.employeeId === employee.id && s.date === shift.date && s !== shift);
      if (sameDayOwn.reduce((sum, s) => sum + s.paidMinutes, 0) + paid > MAX_PAID) return [];
      const variants: Shift[] = [];
      for (const start of new Set([shift.startMinutes, shift.endMinutes - presence])) {
        const end = start + presence;
        if (!blocks.some((block) => start >= block.startMinutes && end <= block.endMinutes)) continue;
        if (sameDayOwn.some((s) => s.startMinutes < end && start < s.endMinutes)) continue;
        variants.push(makeShift(employee.id, shift.date, start, paid, shift.shiftType === "EARLY" ? "EARLY" : "LATE", weekday));
      }
      return variants;
    };
    /** Kostenänderung eines Tages, wenn `old` durch `next` ersetzt wird (Besetzung + Vorlieben). */
    const change = (old: Shift, next: Shift) => {
      const onDay = shifts.filter((s) => s.date === old.date);
      const own = onDay.filter((s) => s.employeeId === employee.id);
      const swap = (list: Shift[]) => list.map((s) => (s === old ? next : s));
      const weekday = weekdayOf(old.date);
      return dayScore(old.date, swap(onDay)) + styleCostOf(employee, old.date, weekday, swap(own), ctx)
        - dayScore(old.date, onDay) - styleCostOf(employee, old.date, weekday, own, ctx);
    };

    for (let round = 0; round < 12; round++) {
      const own = shifts.filter((s) => s.employeeId === employee.id);
      const shorter = own.flatMap((shift) => resized(shift, -SLOT).map((next) => ({ old: shift, next, delta: change(shift, next) })));
      const longer = own.flatMap((shift) => resized(shift, SLOT).map((next) => ({ old: shift, next, delta: change(shift, next) })));
      let best: { a: (typeof shorter)[number]; b: (typeof longer)[number]; delta: number } | undefined;
      for (const a of shorter) for (const b of longer) {
        if (a.old.date === b.old.date) continue;
        // Wochenvertrag: nur innerhalb der Woche. Monatsvertrag: im ganzen Monat – so
        // holt ein Fahrer die halbe Stunde am Sonntagabend einer kurzen Randwoche aus
        // einer anderen Woche, in der zwei Fahrer gleichzeitig unterwegs sind.
        if (employee.weeklyHours != null && weekStartOf(a.old.date) !== weekStartOf(b.old.date)) continue;
        const delta = a.delta + b.delta;
        if (delta < -1e-6 && (!best || delta < best.delta)) best = { a, b, delta };
      }
      if (!best) break;
      const chosen = best;
      shifts = shifts.map((s) => (s === chosen.a.old ? chosen.a.next : s === chosen.b.old ? chosen.b.next : s));
    }
  }
  return shifts;
}

/**
 * Reihenfolge der Planung: feste Schicht → Teilzeit/Minijob im Service und als
 * Fahrer (nehmen sich zuerst die Stoßzeiten) → Azubi → Vollzeit (feste Muster) →
 * Teilzeit/Minijob der Küche (füllen den Abend, ohne die Mittagsküche zu sprengen).
 */
function planningRank(employee: Employee): number {
  if (employee.fixedShift) return 0;
  if (prefersPeak(employee)) {
    const group = staffGroupOf(employee);
    const early = SCHEDULER_TUNING.peakFirst &&
      (group === "KITCHEN" ? SCHEDULER_TUNING.peakFirstKitchen : group === "SERVICE" ? SCHEDULER_TUNING.peakFirstService : true);
    return early ? 1 : 4;
  }
  if (employee.employmentType === "AZUBI") return 2;
  return 3;
}

export function generateWeeklySchedule(input: WeeklyInput, existing: Shift[] = []): Shift[] {
  const holidays = input.holidays ?? publicHolidays(input.year);
  const days = new Map(datesOfMonth(input.year, input.month).map((date) => [
    date, resolveDay(input.workHours, date, holidays, input.overrides ?? {}),
  ]));
  const openDates = [...days].filter(([, day]) => !day.closed).map(([date]) => date);
  const byWeek = new Map<string, string[]>();
  for (const date of openDates) {
    const week = weekStartOf(date);
    byWeek.set(week, [...(byWeek.get(week) ?? []), date]);
  }
  const fullWeekDays = Object.values(input.workHours.closedWeekdays).filter((closed) => !closed).length;
  const hasHoliday = (dates: string[]) => dates.some((date) => holidays.has(date));
  // Kurze Randwochen (≤ 3 offene Tage) zuerst, danach alle Wochen zeitlich.
  // Der Laden hat täglich offen: plant man die volle Woche zuerst, sperrt sie den
  // einzelnen Sonntag davor bzw. Montag danach (7 Tage am Stück) und dessen
  // Stunden fehlen. Eine LANGE Randwoche (z. B. Mo–Sa am Monatsende) dagegen
  // zuerst geplant sperrt den Sonntag davor – sie kommt zeitlich dran.
  const sortWeeks = (partialAfterFull: boolean) => {
    const orderGroup = (dates: string[]) => dates.length <= SCHEDULER_TUNING.shortEdgeDays
      ? 0
      : dates.length >= fullWeekDays || !partialAfterFull ? 1 : 2;
    return [...byWeek].sort((a, b) => orderGroup(a[1]) - orderGroup(b[1]) || a[0].localeCompare(b[0]));
  };
  const weeks = sortWeeks(SCHEDULER_TUNING.partialAfterFull);
  const chronologicalWeeks = sortWeeks(false);
  // Monatsverträge holen einen fehlenden Randtag über topUpShortfalls in einer
  // anderen Woche nach. Ein Wochenvertrag kann das nicht (harte Wochengrenze) –
  // dort plant die Schleife unten bei Fehlstunden zeitlich neu.
  const weeksFor = (employee: Employee) =>
    (SCHEDULER_TUNING.partialAfterFullAll || employee.employmentType === "VOLLZEIT" || employee.employmentType === "AZUBI") &&
    (employee.weeklyHours == null || SCHEDULER_TUNING.partialAfterFullWeekly)
      ? weeks
      : chronologicalWeeks;
  const employees = [...input.employees].sort((a, b) => planningRank(a) - planningRank(b) || a.id.localeCompare(b.id));
  let result = [...existing];
  const monthDates = [...days.keys()];
  const monthBounds = { first: monthDates[0], last: monthDates[monthDates.length - 1] };
  // Wochenbudget je Person: Wochenvertrag × Anteil der Woche (Azubi) oder
  // Monatsvertrag im 30-Minuten-Raster auf die Wochen verteilt (contract.ts).
  const budgets = new Map(employees.map((employee) => [
    employee.id,
    employee.weeklyHours != null
      ? weeklyBudgetMinutes(employee, openDates, monthBounds, input.workHours)
      : monthlyBudgetMinutes(employee, openDates, input.workHours),
  ] as const));
  const groupOf = new Map(input.employees.map((employee) => [employee.id, staffGroupOf(employee)] as const));
  const ctx: Ctx = {
    holidays,
    days,
    dailyTargets: new Map(),
    groupOf,
    present: presentGroups(input.employees),
    fullWeekDays,
    patterns: new Map(),
  };
  const isInHouse = (employeeId: string) => groupOf.get(employeeId) !== "DRIVER";

  // Tab „Tài liệu": giờ ngày = giờ tuần × (hệ số × phút mở) ÷ Σ(hệ số × phút mở),
  // chuẩn hoá trong từng ISO-week; chỉ tính giờ trong quán (không tính lái xe).
  const spreadByWeight = (weekDates: string[], total: number) => {
    const targets = weightedDailyTargets(
      weekDates,
      total,
      (date) => effectiveWeekdayKey(date, holidays),
      (date) => openMinutesOfBlocks(days.get(date)!.blocks),
    );
    for (const [date, hours] of targets) ctx.dailyTargets.set(date, hours);
  };
  for (const [weekStart, weekDates] of byWeek) {
    const weekMinutes = [...budgets].reduce((sum, [employeeId, weekly]) => sum + (isInHouse(employeeId) ? weekly.get(weekStart) ?? 0 : 0), 0);
    spreadByWeight(weekDates, weekMinutes / 60);
  }
  const paidMinutesOf = (list: Shift[]) => list.reduce((sum, shift) => sum + shift.paidMinutes, 0);
  for (const employee of employees) {
    const weekly = budgets.get(employee.id)!;
    const plan = (order: [string, string[]][]): { shifts: Shift[]; pattern?: Map<WeekdayKey, string> } => {
      ctx.patterns.delete(employee.id);
      const planned: Shift[] = [];
      for (const [weekStart, weekDates] of order) {
        const choices = chooseWeek(employee, weekDates, weekly.get(weekStart) ?? 0, [...result, ...planned], ctx);
        const shifts = choices.flatMap((choice) => choice.option.shifts);
        planned.push(...shifts);
        // Das feste Muster entsteht in der ersten vollen Woche ohne Feiertag.
        if (employee.employmentType === "VOLLZEIT" && !ctx.patterns.has(employee.id) && weekDates.length === fullWeekDays && !hasHoliday(weekDates) && shifts.length > 0) {
          const pattern = new Map<WeekdayKey, string>();
          for (const choice of choices) pattern.set(dayOf(choice.date), signatureOf(choice.option.shifts));
          ctx.patterns.set(employee.id, pattern);
        }
      }
      return { shifts: planned, pattern: ctx.patterns.get(employee.id) };
    };
    const preferred = weeksFor(employee);
    let best = plan(preferred);
    // Wochenvertrag: fehlt nach „Randwoche zuletzt" Zeit (ein Randtag blieb wegen
    // 7 Tagen am Stück gesperrt), zeitlich neu planen – die Stunden gehen vor.
    const budgetTotal = [...weekly.values()].reduce((sum, minutes) => sum + minutes, 0);
    if (preferred !== chronologicalWeeks && employee.weeklyHours != null && budgetTotal - paidMinutesOf(best.shifts) >= SLOT) {
      const alternative = plan(chronologicalWeeks);
      if (paidMinutesOf(alternative.shifts) > paidMinutesOf(best.shifts)) best = alternative;
    }
    if (best.pattern) ctx.patterns.set(employee.id, best.pattern);
    else ctx.patterns.delete(employee.id);
    result.push(...best.shifts);
  }
  // Refit to actual available hours (new hires can reduce a week's budget).
  for (const [, weekDates] of byWeek) {
    const actual = result.filter((s) => weekDates.includes(s.date) && isInHouse(s.employeeId)).reduce((sum, s) => sum + s.paidMinutes, 0) / 60;
    spreadByWeight(weekDates, actual);
  }
  for (let pass = 0; pass < SCHEDULER_TUNING.refitPasses; pass++) {
    let changed = false;
    for (const [weekStart, weekDates] of weeks) for (const employee of [...employees].reverse()) {
      const own = result.filter((s) => s.employeeId === employee.id && weekStartOf(s.date) === weekStart);
      const paid = own.reduce((sum, s) => sum + s.paidMinutes, 0);
      if (!paid || employee.fixedShift) continue;
      const others = result.filter((s) => !own.includes(s));
      const choices = chooseWeek(employee, weekDates, paid, others, ctx);
      const next = choices.flatMap((choice) => choice.option.shifts);
      if (next.reduce((sum, s) => sum + s.paidMinutes, 0) !== paid) continue;
      const score = (shifts: Shift[]) => weekDates.reduce((sum, date) => {
        const weekday = effectiveWeekdayKey(date, holidays);
        const ownDay = shifts.filter((s) => s.date === date);
        return sum + dayCost([...others.filter((s) => s.date === date), ...ownDay], days.get(date)!.blocks, weekday, ctx.dailyTargets.get(date), ctx)
          + styleCostOf(employee, date, weekday, ownDay, ctx);
      }, 0);
      if (score(next) < score(own) - 0.01) {
        result = [...others, ...next];
        changed = true;
      }
    }
    if (!changed) break;
  }
  result = topUpShortfalls(result, employees, budgets, ctx);
  result = moveWorkDays(result, employees, ctx);
  result = rebalanceWithinWeeks(result, employees, ctx);
  return improveCoverage(result, employees, ctx)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startMinutes - b.startMinutes || a.employeeId.localeCompare(b.employeeId));
}
