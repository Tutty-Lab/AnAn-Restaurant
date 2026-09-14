// ============================================================================
// Verbindung zur gemeinsamen Supabase-Datenbank. Alle Filialen (je ein Repo,
// je eine Domain) hängen an derselben Datenbank; getrennt wird nur über
// STORE_ID – deshalb steht die ID hier fest im Code der jeweiligen Filiale.
// ============================================================================

import { createClient } from "@supabase/supabase-js";

/**
 * Kennung dieser Filiale = Schlüssel der Zeile in store_data.
 *
 * TEMPLATE: eigene Zeile "template" – NIE die ID eines echten Ladens, sonst
 * überschreibt die Template-Instanz dessen Dienstpläne (alle Filialen teilen
 * dieselbe Datenbank). Wer aus dem Template einen neuen Laden anlegt, ändert
 * GENAU diese Zeile auf die ID des Ladens (z. B. "missdo").
 *
 * Per VITE_STORE_ID überschreibbar, damit man lokal gegen eine Testzeile
 * arbeiten kann.
 */
export const STORE_ID = import.meta.env.VITE_STORE_ID || "template";

// Beide Schreibweisen akzeptieren: VITE_* (selbst gesetzt) und NEXT_PUBLIC_*
// (so legt die Vercel-Supabase-Integration die öffentlichen Schlüssel an).
const env = import.meta.env;
const url: string | undefined = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey: string | undefined =
  env.VITE_SUPABASE_ANON_KEY ||
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabase = url && anonKey ? createClient(url, anonKey) : null;

/** true = Zugangsdaten vorhanden. Fehlen sie, läuft die App nur lokal weiter. */
export const isRemoteConfigured = supabase !== null;
