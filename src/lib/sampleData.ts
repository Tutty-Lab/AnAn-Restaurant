// ============================================================================
// Startbelegschaft des Restaurant AnAn (15 Personen) laut Angabe des Betriebs.
// ============================================================================

import type { Employee, Schedule, WorkRole } from "../types";
import { DEFAULT_WORK_HOURS } from "./workHours";
import { COMPANY_ADDRESS, COMPANY_NAME } from "./company";

export function makeEmployee(
  id: string,
  name: string,
  employmentType: Employee["employmentType"],
  targetHours: number,
): Employee {
  return { id, name, employmentType, targetMinutes: Math.round(targetHours * 60) };
}

/** Mitarbeiter mit MONATSvertrag (z. B. 92,70 h/Monat). */
export function makeMonthly(
  id: string,
  name: string,
  employmentType: Employee["employmentType"],
  monthlyHours: number,
  workRole?: WorkRole,
): Employee {
  return { id, name, employmentType, targetMinutes: Math.round(monthlyHours * 60), ...(workRole ? { workRole } : {}) };
}

/** Mitarbeiter mit WOCHENvertrag (Azubi: 39 h/Woche). */
export function makeWeekly(
  id: string,
  name: string,
  employmentType: Employee["employmentType"],
  weeklyHours: number,
  workRole?: WorkRole,
): Employee {
  return { id, name, employmentType, targetMinutes: 0, weeklyHours, ...(workRole ? { workRole } : {}) };
}

/**
 * Belegschaft laut Angabe des Betriebs (Restaurant AnAn).
 *
 * Bereiche: 1, 5, 6, 7, 9, 10, 11 Bếp · 2, 4 Lái xe · 8, 12 Phục vụ (bồi).
 * 3, 13, 14, 15 sind noch keinem Bereich zugeordnet – der Admin trägt das nach.
 *
 * ANNAHMEN, die der Betrieb bestätigen sollte:
 *   - Ohne angegebene Art: über 50 h/Monat = Teilzeit, sonst Minijob.
 *   - Berufsschulzeiten der Azubis sind noch nicht bekannt (Tab Nhân viên).
 */
export const SAMPLE_EMPLOYEES: Employee[] = [
  makeMonthly("an-1", "Ngoc Dat Doan", "TEILZEIT", 92.7, "KITCHEN"),
  makeMonthly("an-2", "Hiep Doan", "TEILZEIT", 73.94, "DRIVER"),
  makeWeekly("an-3", "Vũ Thị Kim Ngân", "AZUBI", 39),
  makeMonthly("an-4", "Trung Dung Duong", "MINIJOB", 43.51, "DRIVER"),
  makeMonthly("an-5", "Cong Tri Duong", "VOLLZEIT", 173.81, "KITCHEN"),
  makeMonthly("an-6", "Thanh Tam Le", "VOLLZEIT", 173.81, "KITCHEN"),
  makeMonthly("an-7", "Van Hao Nguyen", "MINIJOB", 39, "KITCHEN"),
  makeMonthly("an-8", "Duc Tuan Tran", "MINIJOB", 43.51, "SERVICE"),
  makeMonthly("an-9", "Thi Thuy Nhu", "VOLLZEIT", 173.81, "KITCHEN"),
  makeMonthly("an-10", "Van Trang Tran", "VOLLZEIT", 173.81, "KITCHEN"),
  makeMonthly("an-11", "Anh Tuan Pham", "VOLLZEIT", 173.81, "KITCHEN"),
  makeMonthly("an-12", "Huy Nam Nguyen", "MINIJOB", 28.2, "SERVICE"),
  makeMonthly("an-13", "Quoc Dung Nguyen", "MINIJOB", 28.2),
  makeWeekly("an-14", "Hoàng Văn Hậu", "AZUBI", 39),
  makeWeekly("an-15", "Bảo Long Nguyễn", "AZUBI", 39),
];

export function createSampleSchedule(): Schedule {
  return {
    companyName: COMPANY_NAME,
    address: COMPANY_ADDRESS,
    year: 2026,
    month: 8, // August
    workHours: structuredClone(DEFAULT_WORK_HOURS),
    dateOverrides: [],
    employees: SAMPLE_EMPLOYEES.map((e) => ({ ...e })),
    shifts: [],
  };
}

/** Startbelegschaft, die die App beim allerersten Öffnen zeigt (Oktober 2026). */
export function createInitialSchedule(): Schedule {
  return {
    companyName: COMPANY_NAME,
    address: COMPANY_ADDRESS,
    year: 2026,
    month: 10,
    workHours: structuredClone(DEFAULT_WORK_HOURS),
    dateOverrides: [],
    employees: SAMPLE_EMPLOYEES.map((e) => ({ ...e })),
    shifts: [],
  };
}
