// ============================================================================
// Wann darf eine Person überhaupt eingeplant werden?
//
// Alles steht hier an EINER Stelle, weil der Scheduler an mehreren Stellen
// Termine vergibt: beim ersten Verteilen, beim Umplanen einer Woche und beim
// Verbessern der Besetzung. Eine Regel, die nur in einem Schritt steht, wird
// von den Läufen danach wieder aufgehoben.
// ============================================================================

import type { Employee } from "../types";
import { parseIsoDate, weekdayKeyOf } from "./demand";

/**
 * Arbeitet diese Person an diesem Wochentag überhaupt? Leere/fehlende Liste =
 * keine Einschränkung.
 */
export function worksOnWeekday(employee: Employee, isoDate: string): boolean {
  const tage = employee.availableWeekdays;
  if (!tage || tage.length === 0) return true;
  return tage.includes(weekdayKeyOf(parseIsoDate(isoDate)));
}

/**
 * Hat die Person an diesem Tag schon angefangen? Ohne startDate: immer ja.
 * Der ISO-Stringvergleich reicht, weil "yyyy-MM-dd" lexikografisch = zeitlich.
 */
export function hasStarted(employee: Employee, isoDate: string): boolean {
  return employee.startDate == null || isoDate >= employee.startDate;
}

/**
 * Die eine Frage, die jeder Planungsschritt stellen muss: darf diese Person an
 * diesem Datum arbeiten? (fester freier Wochentag oder ein Eintritt nach
 * diesem Tag sprechen dagegen)
 */
export function mayWorkOn(employee: Employee, isoDate: string): boolean {
  return worksOnWeekday(employee, isoDate) && hasStarted(employee, isoDate);
}
