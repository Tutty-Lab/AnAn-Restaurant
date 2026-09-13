// ============================================================================
// Einstieg in die Dienstplan-Erstellung. Geplant wird ausschließlich über
// Wochenverträge – die eigentliche Logik steht in weeklyScheduler.ts. Dieser
// Wrapper hält die Signatur für den Hook und die Tests stabil.
// ============================================================================

import type { Employee, Shift } from "../types";
import type { OverrideMap, WorkHoursConfig } from "./workHours";
import { generateWeeklySchedule } from "./weeklyScheduler";

export type GenerateInput = {
  year: number;
  month: number; // 1-basiert
  /** Arbeitszeit-Fenster je Wochentag + Feiertag. */
  workHours: WorkHoursConfig;
  /** Ausnahmen für einzelne Daten (geschlossen / abweichende Zeiten). */
  overrides?: OverrideMap;
  employees: Employee[];
  /** Feiertage als ISO-Set; Standard: Feiertage in Bayern des Jahres. */
  holidays?: Set<string>;
  /** Nicht verwendet (der Wochenplaner ist deterministisch); bleibt für die Signatur. */
  seed?: string;
};

export function generateSchedule(input: GenerateInput): Shift[] {
  return generateWeeklySchedule(input);
}
