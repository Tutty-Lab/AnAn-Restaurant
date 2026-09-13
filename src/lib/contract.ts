// ============================================================================
// Wochenvertrag -> Monats-Soll und Wochenbudgets.
//
// Viet Cuisine gibt Verträge in WOCHENstunden an (39 h/Woche = Vollzeit). Der
// Scheduler plant aber einen Monat. Diese Umrechnung steht hier an EINER Stelle,
// damit Scheduler, Prüfung und Anzeige dieselbe Zahl verwenden.
//
// Eine ISO-Woche, die über zwei Monate läuft, wird nach TAGESGEWICHT geteilt
// (Tab „Tài liệu": T6–CN = 1,5, sonst 1,0), nicht nach Anzahl der Tage: Di+Mi
// am Monatsende tragen 2 von 7,5 Gewichten (10,4 h von 39 h), Do–So am
// Monatsanfang die übrigen 5,5. So werden die Randtage nicht überbesetzt, und
// beide Teile ergeben zusammen genau den Wochenvertrag.
// ============================================================================

import type { Employee } from "../types";
import { DAY_WEIGHTS, parseIsoDate, weekdayKeyOf, type WeekdayKey } from "./demand";
import { weekStartOf } from "./weeks";

/** ISO "yyyy-MM-dd" + n Tage (UTC, ohne Zeitzonen-Verschiebung). */
function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Offene Tage je Woche: Di–So, der Montag ist zu. */
export const OPEN_DAYS_PER_WEEK = 6;
export const SCHEDULE_SLOT_MINUTES = 30;

/** Extra opening days in a calendar week do not increase a weekly contract. */
export function contractOpenDays(openDaysByWeek: readonly number[]): number {
  return openDaysByWeek.reduce((sum, openDays) => sum + Math.min(openDays, OPEN_DAYS_PER_WEEK), 0);
}

/**
 * Monats-Soll in Minuten über eine Anzahl offener Tage (Tagesanteil 1/6 je Tag).
 * Nur noch für Personen ohne Datumsliste (Altpfad, einzelne Tests); Scheduler,
 * Prüfung und Anzeige rechnen mit monthlyTargetMinutesFor.
 */
export function monthlyTargetMinutes(emp: Employee, openDaysInMonth: number): number {
  if (emp.weeklyHours != null) {
    return Math.max(0, Math.round((emp.weeklyHours * 60 * openDaysInMonth) / OPEN_DAYS_PER_WEEK));
  }
  return emp.targetMinutes;
}

export type WeekShare = {
  weekStart: string;
  /** Anteil dieser Woche, der in den Monat fällt (0..1), nach Tagesgewicht. */
  share: number;
};

/**
 * Wochenanteile DIESER Person im Monat.
 *
 * Normale Woche = Wochentage, die in mindestens zwei Wochen des Monats offen
 * sind (ein einmalig geöffneter Montag zählt nicht). Gewichtet wird mit dem
 * Wochentag (DAY_WEIGHTS), NICHT mit dem Feiertags-Gewicht – sonst ergäben die
 * beiden Monatsteile einer Woche zusammen mehr als eine Woche. Tage vor dem
 * Eintritt (startDate) fallen weg.
 */
export function weekSharesFor(emp: Employee, openDates: readonly string[]): WeekShare[] {
  const weeksByWeekday = new Map<WeekdayKey, Set<string>>();
  for (const date of openDates) {
    const weekday = weekdayKeyOf(parseIsoDate(date));
    weeksByWeekday.set(weekday, (weeksByWeekday.get(weekday) ?? new Set()).add(weekStartOf(date)));
  }
  const fullWeight = [...weeksByWeekday].reduce((sum, [weekday, weeks]) => sum + (weeks.size >= 2 ? DAY_WEIGHTS[weekday] : 0), 0);
  if (fullWeight <= 0) return [];

  const weightByWeek = new Map<string, number>();
  for (const date of openDates) {
    if (emp.startDate != null && date < emp.startDate) continue;
    const week = weekStartOf(date);
    weightByWeek.set(week, (weightByWeek.get(week) ?? 0) + DAY_WEIGHTS[weekdayKeyOf(parseIsoDate(date))]);
  }
  return [...weightByWeek]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([weekStart, weight]) => ({ weekStart, share: Math.min(1, weight / fullWeight) }));
}

/**
 * Monats-Soll dieser Person in Minuten: Wochenvertrag × Summe der Wochenanteile
 * (nach Tagesgewicht, respektiert das Startdatum). Ohne Wochenvertrag bleibt es
 * beim direkt eingetragenen targetMinutes.
 */
export function monthlyTargetMinutesFor(emp: Employee, openDates: readonly string[]): number {
  if (emp.weeklyHours == null) return emp.targetMinutes;
  const weekly = emp.weeklyHours * 60;
  return Math.max(0, Math.round(weekSharesFor(emp, openDates).reduce((sum, week) => sum + weekly * week.share, 0)));
}

/**
 * Wochenbudgets (Minuten im 30-Minuten-Raster) für eine Person mit Wochenvertrag.
 *
 * - Volle Wochen bekommen genau den Vertrag.
 * - Eine Woche am MonatsENDE wird abgerundet, eine am MonatsANFANG aufgerundet –
 *   beide Teile zusammen liegen nie über dem Wochenvertrag.
 * - Wochen ganz im Monat teilen die Rundungsreste nach größtem Rest, damit der
 *   Monat höchstens eine halbe Rastereinheit vom Soll abweicht.
 */
export function weeklyBudgetMinutes(
  emp: Employee,
  openDates: readonly string[],
  monthBounds: { first: string; last: string },
): Map<string, number> {
  const result = new Map<string, number>();
  if (emp.weeklyHours == null || emp.weeklyHours <= 0) return result;
  const capSlots = Math.floor((emp.weeklyHours * 60) / SCHEDULE_SLOT_MINUTES + 1e-9);
  const weeks = weekSharesFor(emp, openDates).map((week) => ({
    weekStart: week.weekStart,
    slots: (emp.weeklyHours! * 60 * week.share) / SCHEDULE_SLOT_MINUTES,
    endsAfterMonth: addDaysIso(week.weekStart, 6) > monthBounds.last,
    startsBeforeMonth: week.weekStart < monthBounds.first,
  }));

  const whole = new Map<string, number>();
  for (const week of weeks) {
    whole.set(week.weekStart, week.endsAfterMonth
      ? Math.floor(week.slots + 1e-9)
      : week.startsBeforeMonth ? Math.ceil(week.slots - 1e-9) : Math.floor(week.slots + 1e-9));
  }
  const interior = weeks.filter((week) => !week.endsAfterMonth && !week.startsBeforeMonth);
  const allocated = () => [...whole.values()].reduce((sum, value) => sum + value, 0);
  let rest = Math.round(weeks.reduce((sum, week) => sum + week.slots, 0)) - allocated();
  const byFraction = [...interior].sort((a, b) => (b.slots % 1) - (a.slots % 1) || a.weekStart.localeCompare(b.weekStart));
  for (const week of byFraction) {
    if (rest <= 0) break;
    if (whole.get(week.weekStart)! >= capSlots) continue;
    whole.set(week.weekStart, whole.get(week.weekStart)! + 1);
    rest -= 1;
  }
  for (const week of [...byFraction].reverse()) {
    if (rest >= 0) break;
    if (whole.get(week.weekStart)! <= 0) continue;
    whole.set(week.weekStart, whole.get(week.weekStart)! - 1);
    rest += 1;
  }
  for (const week of weeks) {
    result.set(week.weekStart, Math.min(whole.get(week.weekStart)!, capSlots) * SCHEDULE_SLOT_MINUTES);
  }
  return result;
}

/**
 * Verteilt ein MONATS-Soll (in Minuten) auf die ISO-Wochen des Monats – für
 * Personen OHNE Wochenvertrag (nach Anzahl offener Tage), oder mit
 * contractedWeeklyMinutes nach dem Tagesanteil 1/6 (Altpfad, Tests).
 *
 * Rückgabe: weekStart (ISO-Montag) -> Soll-Minuten der Woche.
 */
export function weeklyTargetMinutes(
  monthlyMin: number,
  openDaysByWeek: readonly { weekStart: string; openDays: number }[],
  contractedWeeklyMinutes?: number,
): Map<string, number> {
  const result = new Map<string, number>();
  const totalOpen = openDaysByWeek.reduce((a, w) => a + w.openDays, 0);
  if (totalOpen <= 0 || monthlyMin <= 0) {
    for (const w of openDaysByWeek) result.set(w.weekStart, 0);
    return result;
  }

  // A weekly contract never borrows minutes from another week, even for a
  // short month boundary or an extra opening day.
  if (contractedWeeklyMinutes != null) {
    const rawSlots = openDaysByWeek.map((week) => ({
      weekStart: week.weekStart,
      slots: contractedWeeklyMinutes * Math.min(week.openDays, OPEN_DAYS_PER_WEEK) /
        OPEN_DAYS_PER_WEEK / SCHEDULE_SLOT_MINUTES,
    }));
    const targetSlots = Math.round(rawSlots.reduce((sum, week) => sum + week.slots, 0));
    const allocated = rawSlots.map((week) => ({
      ...week,
      wholeSlots: Math.floor(week.slots),
      fraction: week.slots - Math.floor(week.slots),
    }));
    let remainingSlots = targetSlots - allocated.reduce((sum, week) => sum + week.wholeSlots, 0);
    for (const week of [...allocated].sort((a, b) => b.fraction - a.fraction || a.weekStart.localeCompare(b.weekStart))) {
      if (remainingSlots <= 0) break;
      week.wholeSlots += 1;
      remainingSlots -= 1;
    }
    for (const week of allocated) result.set(week.weekStart, week.wholeSlots * SCHEDULE_SLOT_MINUTES);
    return result;
  }

  const raw = openDaysByWeek.map((w) => (monthlyMin * w.openDays) / totalOpen);
  const floors = raw.map((x) => Math.floor(x));
  let rest = Math.round(monthlyMin) - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac);
  const minutes = [...floors];
  for (let k = 0; k < order.length && rest > 0; k++, rest--) minutes[order[k].i] += 1;
  openDaysByWeek.forEach((w, i) => result.set(w.weekStart, minutes[i]));
  return result;
}
