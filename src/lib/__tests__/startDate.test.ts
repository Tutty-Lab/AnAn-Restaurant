// ============================================================================
// Eintritt mitten im Monat (startDate):
//   - Tage vor dem Startdatum werden nicht verplant.
//   - Sie zählen nicht ins Monats-Soll -> keine falsche „zu wenig geplant"-Warnung.
// ============================================================================

import { describe, expect, it } from "vitest";
import { generateSchedule } from "../scheduler";
import { validateSchedule } from "../validation";
import { DEFAULT_WORK_HOURS, resolveDay } from "../workHours";
import { publicHolidays } from "../holidays";
import { datesOfMonth } from "../demand";
import { monthlyTargetMinutesFor } from "../contract";
import { SAMPLE_EMPLOYEES } from "../sampleData";
import type { Employee } from "../../types";

const openDatesOf = (year: number, month: number): string[] => {
  const hol = publicHolidays(year);
  return datesOfMonth(year, month).filter((d) => !resolveDay(DEFAULT_WORK_HOURS, d, hol, {}).closed);
};

const wk = (id: string, h: number, x: Partial<Employee> = {}): Employee => ({
  id, name: id, employmentType: "AZUBI", targetMinutes: 0, weeklyHours: h, ...x,
});

describe("Eintritt mitten im Monat (startDate)", () => {
  it("kürzt das Monats-Soll um die Tage vor dem Startdatum", () => {
    const openDates = openDatesOf(2026, 9);
    const full = wk("full", 39);
    const late = wk("late", 39, { startDate: "2026-09-07" });
    // Faktor = Gewicht × Öffnungsminuten: Mo–Do 1,0 × 540, Fr 1,5 × 540,
    // Sa 1,5 × 690, So 1,5 × 630 – volle Woche 4.950. September 2026:
    // Di–So der ersten Woche (4.410), drei volle Wochen, Mo–Mi der letzten (1.620).
    const expected = 39 * 60 * (3 + (4410 + 1620) / 4950);
    expect(Math.abs(monthlyTargetMinutesFor(full, openDates) - expected)).toBeLessThanOrEqual(1);
    // Die erste (gesperrte) Woche fehlt komplett: rund 35 h weniger.
    const diff = (monthlyTargetMinutesFor(full, openDates) - monthlyTargetMinutesFor(late, openDates)) / 60;
    expect(diff).toBeGreaterThan(30);
    expect(diff).toBeLessThanOrEqual(39);
  });

  it("verplant keine Tage vor dem Startdatum und meldet keine Fehlstunden-Warnung", () => {
    const employees = SAMPLE_EMPLOYEES.map((employee) =>
      employee.id === "an-15" ? { ...employee, startDate: "2026-10-14" } : employee);
    const openDates = openDatesOf(2026, 10);
    const shifts = generateSchedule({ year: 2026, month: 10, workHours: DEFAULT_WORK_HOURS, employees });
    const late = employees.find((employee) => employee.id === "an-15")!;
    const own = shifts.filter((s) => s.employeeId === late.id);

    expect(own.filter((s) => s.date < late.startDate!)).toEqual([]);
    const v = validateSchedule(employees, shifts, 2026, openDates, DEFAULT_WORK_HOURS);
    expect(v.errors.filter((e) => e.employeeId === late.id)).toEqual([]);
    const got = own.reduce((a, s) => a + s.paidMinutes, 0);
    expect(Math.abs(got - monthlyTargetMinutesFor(late, openDates, DEFAULT_WORK_HOURS))).toBeLessThan(30);
  });
});
