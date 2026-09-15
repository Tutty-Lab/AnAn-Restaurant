// ============================================================================
// Zentrale Datentypen. Intern wird IMMER in Minuten (Integer) gerechnet,
// niemals mit Fließkomma-Stunden.
// ============================================================================

import type { WeekdayKey } from "./lib/demand";
import type { DateOverride, DayWindow, WorkHoursConfig } from "./lib/workHours";

/**
 * Anstellungsart.
 * - VOLLZEIT: feste, wiederkehrende Dienste (gleiche Zeiten je Wochentag).
 * - AZUBI: fester Wochenvertrag (39 h/Woche), in der Berufsschulzeit kein Dienst.
 * - TEILZEIT / MINIJOB: werden bevorzugt in die Stoßzeiten gelegt.
 */
export type EmploymentType = "VOLLZEIT" | "TEILZEIT" | "MINIJOB" | "AZUBI";

/**
 * Bereich im Restaurant AnAn. Fehlt der Wert, ist die Person noch keinem Bereich
 * zugeordnet (der Admin trägt ihn nach) und zählt bei der Besetzung wie Service.
 * Fahrer (DRIVER) zählen nicht zur Besetzung im Laden und arbeiten nur 18–21 Uhr,
 * sonntags und an Feiertagen 18–22 Uhr (staffing.ts, DRIVER_HOURS).
 */
export type WorkRole = "KITCHEN" | "SERVICE" | "DRIVER";

/** Zeitraum (inklusive) als ISO-Daten "yyyy-MM-dd". */
export type DateRange = { start: string; end: string };

export type ShiftType = "EARLY" | "LATE" | "CUSTOM";

export type Employee = {
  id: string;
  name: string;
  employmentType: EmploymentType;
  /**
   * MONATSvertrag in Minuten (Integer), z. B. 92,70 h/Monat => 5562.
   * Gilt, wenn weeklyHours fehlt. Geplant wird im 30-Minuten-Raster und nie
   * über dem Vertrag (92,70 h => 92,5 h).
   */
  targetMinutes: number;
  /**
   * WOCHENvertrag (Azubi: 39 h/Woche). Gesetzt => targetMinutes wird je Monat
   * aus den Wochenanteilen abgeleitet (contract.ts).
   */
  weeklyHours?: number;
  /** Bếp / Phục vụ / Lái xe; fehlt = chưa gán. */
  workRole?: WorkRole;
  /**
   * Berufsschulzeiten (Azubi): an diesen Tagen kein Dienst, und sie zählen
   * nicht ins Wochen-/Monats-Soll.
   */
  schoolPeriods?: DateRange[];
  /**
   * Feste Schicht: diese Person arbeitet an ihren Arbeitstagen IMMER in genau
   * diesem Zeitfenster. Gesetzt => der Scheduler legt für sie nur Dienste in
   * diesem Fenster an, unabhängig von den Öffnungsblöcken.
   */
  fixedShift?: DayWindow;
  /**
   * Erster Arbeitstag als ISO-Datum "yyyy-MM-dd" (Eintritt/Vertragsbeginn).
   *
   * Gesetzt => Tage VOR diesem Datum sind gesperrt (kein Dienst) UND zählen
   * nicht ins Monats-Soll. So wird ein Eintritt mitten im Monat korrekt
   * abgebildet: die Person schuldet nur die Stunden ab ihrem Startdatum, statt
   * als „zu wenig geplant" gemeldet zu werden. Fehlt = von Monatsanfang an dabei.
   */
  startDate?: string;
  /**
   * Wochentage, an denen diese Person überhaupt eingeplant werden darf.
   * Fehlt/leer = jeder Tag ist möglich (keine Einschränkung).
   */
  availableWeekdays?: WeekdayKey[];
  /**
   * Höchstzahl der Arbeitstage je Woche. Fehlt = nur die gesetzliche
   * Sechs-Tage-Regel begrenzt.
   */
  maxDaysPerWeek?: number;
};

export type Shift = {
  /** Explicit unpaid break, excluded from staffing coverage. */
  pauseStartMinutes?: number;
  id: string;
  employeeId: string;
  /** ISO-Datum "yyyy-MM-dd". */
  date: string;
  startMinutes: number;
  endMinutes: number;
  pauseMinutes: number;
  /** Bezahlte Arbeitszeit in Minuten = presence - pause. */
  paidMinutes: number;
  shiftType: ShiftType;
  /** true = automatisch generiert, false = manuell hinzugefügt/geändert. */
  generated: boolean;
};

export type Schedule = {
  companyName: string;
  /** Anschrift des Betriebs (erscheint auf dem Stundenzettel). */
  address: string;
  year: number;
  /** 1-basiert: 1 = Januar ... 12 = Dezember. */
  month: number;
  /** Arbeitszeit-Fenster (giờ làm) je Wochentag + Feiertag. */
  workHours: WorkHoursConfig;
  /** Ausnahmen für einzelne Daten (geschlossen / abweichende Zeiten). */
  dateOverrides: DateOverride[];
  employees: Employee[];
  shifts: Shift[];
  /**
   * Zeitpunkt der ersten Wochen-Ausgabe (ISO). Gesetzt = der Monat ist
   * gesperrt und darf nicht mehr geändert werden.
   *
   * Hintergrund: sobald eine Woche ausgedruckt im Laden hängt, muss der Stand
   * im System exakt dem Papier entsprechen – bei einer Kontrolle wird genau
   * das verglichen. Entsperren geht nur bewusst über die Oberfläche.
   */
  lockedAt?: string;
  /** Bereits gedruckte Wochen, als ISO-Datum des jeweiligen Montags. */
  printedWeeks?: string[];
};
