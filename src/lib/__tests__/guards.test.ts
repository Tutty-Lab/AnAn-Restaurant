// ============================================================================
// Unterbesetzung muss sichtbar werden statt still zu passieren – egal ob sie
// vom Scheduler kommt oder von einer Änderung im Plan von Hand.
// ============================================================================

import { describe, expect, it } from "vitest";
import { analyzeSchedule } from "../analyze";
import { DEFAULT_WORK_HOURS } from "../workHours";
import type { Employee, Shift } from "../../types";

const emp = (id: string, type: Employee["employmentType"], weeklyHours: number): Employee => ({
  id,
  name: id,
  employmentType: type,
  targetMinutes: 0,
  weeklyHours,
});

describe("Zu wenige Leute in der Stoßzeit", () => {
  // 2026-08-01 ist ein Samstag: offen durchgehend 11:00–22:30, Abendspitze
  // 18:00–21:00. Hier steht nur EINE Person am Abend.
  const employees = ["a"].map((id) => emp(id, "TEILZEIT", 30));
  const shifts: Shift[] = [
    {
      id: "s0",
      employeeId: "a",
      date: "2026-08-01",
      startMinutes: 16 * 60 + 30,
      endMinutes: 22 * 60 + 30,
      pauseMinutes: 30,
      paidMinutes: 5 * 60 + 30,
      shiftType: "LATE",
      generated: true,
    },
  ];

  const analysis = analyzeSchedule({
    year: 2026,
    month: 8,
    workHours: DEFAULT_WORK_HOURS,
    employees,
    shifts,
  });

  it("meldet den unterbesetzten Tag, statt ihn zu verschweigen", () => {
    const tag = analysis.peakViolations.find((d) => d.date === "2026-08-01");
    expect(tag).toBeDefined();
    expect(tag!.peaks.some((p) => !p.ok)).toBe(true);
  });

  it("nennt die tatsächliche Personenzahl und die geforderte", () => {
    // Gezielt die ABENDspitze prüfen (Label "Tối"): der eine Dienst deckt zwar
    // den Abend mit ab, steht dort aber allein.
    const abend = analysis.peakViolations
      .find((d) => d.date === "2026-08-01")!
      .peaks.find((p) => p.label === "Tối" && !p.ok)!;
    expect(abend.minStaff).toBe(1); // so viele stehen wirklich da
    expect(abend.required).toBe(6);
  });

  it("accepts six people throughout a Saturday evening rush", () => {
    const sechs = analyzeSchedule({
      year: 2026,
      month: 8,
      workHours: DEFAULT_WORK_HOURS,
      employees: Array.from({ length: 6 }, (_, index) => emp(String(index), "TEILZEIT", 30)),
      shifts: Array.from({ length: 6 }, (_, index) => ({ ...shifts[0], id: `s${index}`, employeeId: String(index) })),
    });
    const tag = sechs.peakViolations.find((d) => d.date === "2026-08-01");
    expect(tag?.peaks.find((p) => p.label === "Tối")?.ok ?? true).toBe(true);
  });

  it("counts a concrete pause as absent during rush coverage", () => {
    const paused = analyzeSchedule({
      year: 2026,
      month: 8,
      workHours: DEFAULT_WORK_HOURS,
      employees: Array.from({ length: 6 }, (_, index) => emp(String(index), "TEILZEIT", 30)),
      shifts: Array.from({ length: 6 }, (_, index) => ({
        ...shifts[0],
        id: `pause-${index}`,
        employeeId: String(index),
        ...(index === 0 ? { pauseStartMinutes: 18 * 60 } : {}),
      })),
    });
    const evening = paused.days.find((day) => day.date === "2026-08-01")!
      .peaks.find((peak) => peak.label === "Tối")!;
    expect(evening.minStaff).toBe(5);
    expect(evening.ok).toBe(false);
  });

});

describe("Bereiche: Bếp, Phục vụ, Lái xe", () => {
  // 2026-09-01 ist ein Dienstag: 11:00–14:30 und 17:00–22:30.
  const lunch = (id: string): Shift => ({
    id: `l-${id}`, employeeId: id, date: "2026-09-01",
    startMinutes: 11 * 60, endMinutes: 14 * 60 + 30, pauseMinutes: 0, paidMinutes: 210,
    shiftType: "EARLY", generated: true,
  });
  const staff = (id: string, workRole?: Employee["workRole"]): Employee => ({ ...emp(id, "TEILZEIT", 20), workRole });
  const peaksOf = (employees: Employee[], shifts: Shift[]) =>
    analyzeSchedule({ year: 2026, month: 9, workHours: DEFAULT_WORK_HOURS, employees, shifts })
      .days.find((day) => day.date === "2026-09-01")!.peaks;

  it("mittags höchstens 2 Personen in der Küche", () => {
    const employees = [staff("k1", "KITCHEN"), staff("k2", "KITCHEN"), staff("k3", "KITCHEN"), staff("s1", "SERVICE")];
    const peaks = peaksOf(employees, employees.map((e) => lunch(e.id)));
    const kitchenLunch = peaks.find((peak) => peak.label === "Bếp trưa")!;
    expect(kitchenLunch.startMinutes).toBe(11 * 60);
    expect(kitchenLunch.endMinutes).toBe(14 * 60 + 30);
    expect(kitchenLunch.maxStaff).toBe(3);
    expect(kitchenLunch.ok).toBe(false);
    const twoCooks = peaksOf(employees, employees.filter((e) => e.id !== "k3").map((e) => lunch(e.id)));
    expect(twoCooks.find((peak) => peak.label === "Bếp trưa")!.ok).toBe(true);
  });

  it("zählt Personen ohne Bereich wie Service, aber nie wie Küche", () => {
    const employees = [staff("k1", "KITCHEN"), staff("k2", "KITCHEN"), staff("s1", "SERVICE"), staff("x")];
    const peaks = peaksOf(employees, employees.map((e) => lunch(e.id)));
    const service = peaks.find((peak) => peak.label === "Phục vụ" && peak.startMinutes === 11 * 60)!;
    expect(service.required).toBe(2);
    expect(service.minStaff).toBe(2);
    expect(service.ok).toBe(true);
    const alone = peaksOf(employees.filter((e) => e.id !== "s1"), employees.filter((e) => e.id !== "s1").map((e) => lunch(e.id)));
    expect(alone.find((peak) => peak.label === "Phục vụ" && peak.startMinutes === 11 * 60)!.ok).toBe(false);
    expect(peaks.find((peak) => peak.label === "Bếp trưa")!.maxStaff).toBe(2);
  });

  it("Fahrer zählen nicht zur Besetzung im Laden; ohne Fahrer entfällt ihre Regel", () => {
    const employees = [staff("k1", "KITCHEN"), staff("d1", "DRIVER")];
    const peaks = peaksOf(employees, employees.map((e) => lunch(e.id)));
    const inHouse = peaks.find((peak) => peak.label === "Trong giờ mở cửa" && peak.startMinutes === 11 * 60)!;
    expect(inHouse.minStaff).toBe(1);
    expect(inHouse.ok).toBe(false);
    const driver = peaks.find((peak) => peak.label === "Lái xe")!;
    expect([driver.startMinutes, driver.endMinutes]).toEqual([18 * 60, 21 * 60]);
    const noDrivers = peaksOf([staff("k1", "KITCHEN")], [lunch("k1")]);
    expect(noDrivers.some((peak) => peak.label.startsWith("Lái xe"))).toBe(false);
  });

  it("ohne Küchenpersonal entfallen die Küchenregeln, statt jeden Tag rot zu melden", () => {
    const employees = [staff("s1", "SERVICE"), staff("s2")];
    const peaks = peaksOf(employees, employees.map((e) => lunch(e.id)));
    expect(peaks.some((peak) => peak.label === "Bếp" || peak.label === "Bếp trưa")).toBe(false);
    expect(peaks.find((peak) => peak.label === "Trong giờ mở cửa" && peak.startMinutes === 11 * 60)!.ok).toBe(true);
  });
});
