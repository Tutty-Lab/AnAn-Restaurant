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
  // 2026-08-01 ist ein Samstag: offen 10:30–14:30 und 16:30–22:30, Abendspitze
  // 18:00–20:00. Hier steht nur EINE Person im Abendblock.
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

  it("checks staffing when the evening block reopens at 16:30", () => {
    const report = analyzeSchedule({
      year: 2026,
      month: 9,
      workHours: DEFAULT_WORK_HOURS,
      employees,
      shifts: [{ ...shifts[0], date: "2026-09-01", startMinutes: 17 * 60 + 30 }],
    });
    const reopening = report.days.find((day) => day.date === "2026-09-01")!
      .peaks.find((peak) => peak.label === "Đầu ca tối")!;
    expect(reopening.startMinutes).toBe(16 * 60 + 30);
    expect(reopening.minStaff).toBe(0);
    expect(reopening.ok).toBe(false);
  });
});
