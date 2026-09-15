// ============================================================================
// Restaurant AnAn: Öffnungszeiten, Monats-/Wochenverträge, Berufsschule,
// Bereiche (Bếp / Phục vụ / Lái xe) und die Vorlieben je Anstellungsart.
// ============================================================================

import { describe, expect, it } from "vitest";
import { generateSchedule } from "../scheduler";
import { validateSchedule } from "../validation";
import { analyzeSchedule } from "../analyze";
import { DEFAULT_WORK_HOURS, effectiveWeekdayKey, resolveDay } from "../workHours";
import { publicHolidays } from "../holidays";
import { datesOfMonth, parseIsoDate, weekdayKeyOf } from "../demand";
import { monthlyBudgetMinutes, monthlyTargetMinutesFor, weeklyBudgetMinutes } from "../contract";
import { SAMPLE_EMPLOYEES } from "../sampleData";
import { staffGroupOf, workingAt, workloadAt } from "../staffing";
import { weekStartOf } from "../weeks";
import type { Employee, Shift } from "../../types";

const openDatesOf = (year: number, month: number): string[] => {
  const holidays = publicHolidays(year);
  return datesOfMonth(year, month).filter((d) => !resolveDay(DEFAULT_WORK_HOURS, d, holidays, {}).closed);
};
const byId = new Map(SAMPLE_EMPLOYEES.map((employee) => [employee.id, employee] as const));
const paidOf = (shifts: Shift[]) => shifts.reduce((sum, shift) => sum + shift.paidMinutes, 0);

describe("Öffnungszeiten", () => {
  const holidays = publicHolidays(2026);
  const blocks = (date: string) =>
    resolveDay(DEFAULT_WORK_HOURS, date, holidays, {}).blocks.map((block) => [block.startMinutes, block.endMinutes]);

  it("Mo–Fr geteilt, Sa durchgehend ab 11, So und Feiertag ab 12 – täglich offen", () => {
    expect(blocks("2026-10-05")).toEqual([[660, 870], [1020, 1350]]); // Montag
    expect(blocks("2026-10-09")).toEqual([[660, 870], [1020, 1350]]); // Freitag
    expect(blocks("2026-10-10")).toEqual([[660, 1350]]); // Samstag
    expect(blocks("2026-10-11")).toEqual([[720, 1350]]); // Sonntag
    expect(blocks("2026-10-03")).toEqual([[720, 1350]]); // Samstag + Feiertag -> wie Sonntag
    expect(effectiveWeekdayKey("2026-10-03", holidays)).toBe("sunday");
    expect(openDatesOf(2026, 10)).toHaveLength(31);
  });
});

describe("Verträge", () => {
  it("Monatsvertrag: 30-Minuten-Raster und nie über dem Vertrag", () => {
    for (const hours of [92.7, 73.94, 43.51, 173.81, 39, 28.2]) {
      const employee: Employee = { id: "m", name: "m", employmentType: "TEILZEIT", targetMinutes: Math.round(hours * 60) };
      for (const [year, month] of [[2026, 10], [2026, 11], [2027, 2]] as const) {
        const budgets = [...monthlyBudgetMinutes(employee, openDatesOf(year, month)).values()];
        expect(budgets.every((minutes) => minutes % 30 === 0)).toBe(true);
        expect(budgets.reduce((sum, minutes) => sum + minutes, 0)).toBe(Math.floor(employee.targetMinutes / 30) * 30);
      }
    }
  });

  it("Azubi: Wochen in der Berufsschule tragen nichts, das Soll sinkt entsprechend", () => {
    const azubi: Employee = {
      id: "az", name: "az", employmentType: "AZUBI", targetMinutes: 0, weeklyHours: 39,
      schoolPeriods: [{ start: "2026-10-12", end: "2026-10-25" }],
    };
    const openDates = openDatesOf(2026, 10);
    const budgets = weeklyBudgetMinutes(azubi, openDates, { first: "2026-10-01", last: "2026-10-31" });
    expect(budgets.get("2026-10-05")).toBe(39 * 60);
    expect(budgets.get("2026-10-12") ?? 0).toBe(0);
    expect(budgets.get("2026-10-19") ?? 0).toBe(0);
    const withoutSchool = monthlyTargetMinutesFor({ ...azubi, schoolPeriods: undefined }, openDates);
    expect(withoutSchool - monthlyTargetMinutesFor(azubi, openDates)).toBe(78 * 60);
  });
});

describe("Oktober 2026 mit der Belegschaft des Restaurants", () => {
  const year = 2026;
  const month = 10;
  const openDates = openDatesOf(year, month);
  const holidays = publicHolidays(year);
  const shifts = generateSchedule({ year, month, workHours: DEFAULT_WORK_HOURS, employees: SAMPLE_EMPLOYEES });
  const analysis = analyzeSchedule({ year, month, workHours: DEFAULT_WORK_HOURS, employees: SAMPLE_EMPLOYEES, shifts });

  it("keine harten Fehler; Verträge nie überschritten und höchstens 30 Minuten darunter", () => {
    const result = validateSchedule(SAMPLE_EMPLOYEES, shifts, year, openDates, DEFAULT_WORK_HOURS);
    expect(result.errors.filter((error) => error.severity !== "warning")).toEqual([]);
    for (const employee of SAMPLE_EMPLOYEES) {
      const own = shifts.filter((shift) => shift.employeeId === employee.id);
      const soll = monthlyTargetMinutesFor(employee, openDates, DEFAULT_WORK_HOURS);
      if (employee.weeklyHours == null) expect(paidOf(own), employee.name).toBeLessThanOrEqual(employee.targetMinutes);
      expect(Math.abs(paidOf(own) - soll), employee.name).toBeLessThan(30);
      if (employee.weeklyHours != null) {
        for (const week of new Set(own.map((shift) => weekStartOf(shift.date)))) {
          expect(paidOf(own.filter((shift) => weekStartOf(shift.date) === week))).toBeLessThanOrEqual(employee.weeklyHours * 60);
        }
      }
    }
  });

  it("im Laden während jeder Öffnung mindestens 2 Personen und Küche; Service meist zu zweit", () => {
    const gaps = analysis.days.flatMap((day) => day.peaks
      .filter((peak) => ["Trong giờ mở cửa", "Bếp"].includes(peak.label) && !peak.ok)
      .map((peak) => `${day.date} ${peak.label} ${peak.minStaff}`));
    expect(gaps).toEqual([]);
    // 2 Service über alle Öffnungszeiten braucht ~134 h/Woche, der Service hat ~140 h –
    // einzelne Lücken (Mo–Mi mittags, Monatsränder) bleiben und werden im Độ phủ rot gemeldet.
    const service = analysis.days.flatMap((day) => day.peaks.filter((peak) => peak.label === "Phục vụ"));
    expect(service.every((peak) => peak.required === 2)).toBe(true);
    expect(service.every((peak) => peak.minStaff >= 1)).toBe(true);
    // Gezählt je Öffnungsblock: schon 30 Minuten mit nur einer Servicekraft machen den Block rot (Okt 2026: 81 %).
    expect(service.filter((peak) => peak.ok).length / service.length).toBeGreaterThanOrEqual(0.75);
  });

  it("mittags an fast jedem Tag genau 2 Personen in der Küche", () => {
    const lunchChecks = analysis.days.flatMap((day) => day.peaks.filter((peak) => peak.label === "Bếp trưa"));
    expect(lunchChecks).toHaveLength(31);
    expect(lunchChecks.filter((peak) => peak.ok).length / lunchChecks.length).toBeGreaterThanOrEqual(0.9);
  });

  it("Vollzeit behält feste Dienste je Wochentag", () => {
    const fullWeeks = [...new Set(openDates.map(weekStartOf))]
      .filter((week) => openDates.filter((date) => weekStartOf(date) === week).length === 7);
    for (const employee of SAMPLE_EMPLOYEES.filter((e) => e.employmentType === "VOLLZEIT")) {
      const byWeekday = new Map<string, Map<string, number>>();
      for (const date of openDates) {
        if (!fullWeeks.includes(weekStartOf(date)) || holidays.has(date)) continue;
        const signature = shifts.filter((shift) => shift.employeeId === employee.id && shift.date === date)
          .map((shift) => `${shift.startMinutes}-${shift.endMinutes}`).join("+") || "frei";
        const weekday = weekdayKeyOf(parseIsoDate(date));
        const counts = byWeekday.get(weekday) ?? new Map<string, number>();
        counts.set(signature, (counts.get(signature) ?? 0) + 1);
        byWeekday.set(weekday, counts);
      }
      const counts = [...byWeekday.values()];
      const same = counts.reduce((sum, count) => sum + Math.max(...count.values()), 0);
      const total = counts.reduce((sum, count) => sum + [...count.values()].reduce((a, b) => a + b, 0), 0);
      expect(same / total, employee.name).toBeGreaterThanOrEqual(0.65);
    }
  });

  it("Fahrer arbeiten nur 18–21 Uhr (sonntags/feiertags bis 22 Uhr) und fahren fast jeden Abend", () => {
    const driverShifts = shifts.filter((shift) => byId.get(shift.employeeId)?.workRole === "DRIVER");
    expect(driverShifts.length).toBeGreaterThan(0);
    for (const shift of driverShifts) {
      const end = effectiveWeekdayKey(shift.date, holidays) === "sunday" ? 22 * 60 : 21 * 60;
      expect(shift.startMinutes, shift.date).toBeGreaterThanOrEqual(18 * 60);
      expect(shift.endMinutes, shift.date).toBeLessThanOrEqual(end);
    }
    const eveningsWithDriver = openDates.filter((date) =>
      driverShifts.some((shift) => shift.date === date && workingAt(shift, 19 * 60))).length;
    expect(eveningsWithDriver / openDates.length).toBeGreaterThanOrEqual(0.9);
  });

  it("meldet einen Fahrerdienst außerhalb des Fahrerfensters", () => {
    const driver = byId.get("an-2")!;
    const late: Shift = {
      id: "x", employeeId: driver.id, date: "2026-10-05", startMinutes: 19 * 60, endMinutes: 22 * 60,
      pauseMinutes: 0, paidMinutes: 180, shiftType: "LATE", generated: false,
    };
    const sunday = { ...late, id: "y", date: "2026-10-11" };
    const result = validateSchedule([driver], [late, sunday], year, openDates, DEFAULT_WORK_HOURS);
    expect(result.errors.filter((error) => error.message.includes("lái xe chỉ làm")).map((error) => error.date)).toEqual(["2026-10-05"]);
  });

  it("Fr–So abends deutlich stärker besetzt als Mo–Do", () => {
    const inHouseAt = (date: string, minute: number) => shifts.filter((shift) =>
      shift.date === date && staffGroupOf(byId.get(shift.employeeId)) !== "DRIVER" && workingAt(shift, minute)).length;
    const regular = openDates.filter((date) => !holidays.has(date));
    const average = (dates: string[]) => dates.reduce((sum, date) => sum + inHouseAt(date, 19 * 60), 0) / dates.length;
    const busy = regular.filter((date) => ["friday", "saturday", "sunday"].includes(weekdayKeyOf(parseIsoDate(date))));
    const normal = regular.filter((date) => !busy.includes(date));
    expect(average(busy) / average(normal)).toBeGreaterThanOrEqual(1.3);
  });

  it("Teilzeit und Minijob liegen öfter in der Abendspitze als Vollzeit", () => {
    const peakShare = (types: Employee["employmentType"][]) => {
      let peak = 0;
      let all = 0;
      for (const shift of shifts) {
        if (!types.includes(byId.get(shift.employeeId)!.employmentType)) continue;
        const weekday = effectiveWeekdayKey(shift.date, holidays);
        for (let minute = shift.startMinutes; minute < shift.endMinutes; minute += 30) {
          if (!workingAt(shift, minute)) continue;
          all++;
          if (workloadAt(minute, weekday) >= 1.25) peak++;
        }
      }
      return peak / all;
    };
    expect(peakShare(["TEILZEIT", "MINIJOB"])).toBeGreaterThan(peakShare(["VOLLZEIT"]) + 0.15);
  });
});

describe("Berufsschule", () => {
  it("plant keinen Dienst in der Schulzeit und meldet dafür keine Fehlstunden", () => {
    const period = { start: "2026-10-12", end: "2026-10-25" };
    const employees = SAMPLE_EMPLOYEES.map((employee) =>
      employee.id === "an-3" ? { ...employee, schoolPeriods: [period] } : employee);
    const openDates = openDatesOf(2026, 10);
    const shifts = generateSchedule({ year: 2026, month: 10, workHours: DEFAULT_WORK_HOURS, employees });
    const own = shifts.filter((shift) => shift.employeeId === "an-3");
    expect(own.filter((shift) => shift.date >= period.start && shift.date <= period.end)).toEqual([]);
    const azubi = employees.find((employee) => employee.id === "an-3")!;
    expect(Math.abs(paidOf(own) - monthlyTargetMinutesFor(azubi, openDates))).toBeLessThan(30);
    const result = validateSchedule(employees, shifts, 2026, openDates, DEFAULT_WORK_HOURS);
    expect(result.errors.filter((error) => error.employeeId === "an-3")).toEqual([]);
  });
});
