// ============================================================================
// Beschriftungen der Anstellungsarten und Bereiche – an einer Stelle, damit eine
// neue Art nicht in fünf Komponenten einzeln nachgetragen werden muss.
// ============================================================================

import type { EmploymentType, WorkRole } from "../types";

/** Volle Bezeichnung in der App-Sprache (Vietnamesisch). */
export function employmentLabelVi(type: EmploymentType): string {
  switch (type) {
    case "VOLLZEIT":
      return "Toàn thời gian";
    case "TEILZEIT":
      return "Bán thời gian";
    case "MINIJOB":
      return "Minijob";
    case "AZUBI":
      return "Azubi (học nghề)";
  }
}

/** Kürzel für die enge Spalte im Dienstplan-Raster. */
export function employmentShortVi(type: EmploymentType): string {
  switch (type) {
    case "VOLLZEIT":
      return "TT";
    case "TEILZEIT":
      return "BT";
    case "MINIJOB":
      return "MJ";
    case "AZUBI":
      return "AZ";
  }
}

/** Deutsche Bezeichnung – so steht sie auf dem Stundenzettel. */
export function employmentLabelDe(type: EmploymentType): string {
  switch (type) {
    case "VOLLZEIT":
      return "Vollzeit";
    case "TEILZEIT":
      return "Teilzeit";
    case "MINIJOB":
      return "Minijob";
    case "AZUBI":
      return "Auszubildende/r";
  }
}

export const WORK_ROLES: readonly WorkRole[] = ["KITCHEN", "SERVICE", "DRIVER"];

/** Bereich in der App-Sprache; undefined = noch nicht zugeordnet. */
export function roleLabelVi(role: WorkRole | undefined): string {
  switch (role) {
    case "KITCHEN":
      return "Bếp";
    case "SERVICE":
      return "Phục vụ";
    case "DRIVER":
      return "Lái xe";
    default:
      return "Chưa gán";
  }
}
