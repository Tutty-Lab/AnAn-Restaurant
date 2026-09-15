# Dienstplan & Stundenzettel — Restaurant AnAn

Elvirastr. 12, 80636 München (Bayern). React-Anwendung für Wochenplanung
innerhalb eines Monats und deutsche Stundenaufzeichnungen. Die Oberfläche ist
auf Vietnamesisch. Erstellt aus
[`template-studenzettell`](https://github.com/Tutty-Lab/template-studenzettell)
(Remote `template`, damit spätere Korrekturen übernommen werden können).

## Öffnungszeiten

| Tag | Zeiten |
| --- | --- |
| Montag–Freitag | 11:00–14:30 und 17:00–22:30 (geteilter Dienst möglich) |
| Samstag | 11:00–22:30 durchgehend |
| Sonntag | 12:00–22:30 durchgehend |
| Feiertag (Bayern) | wie Sonntag |

## Besetzung

Die Regeln stehen an einer Stelle (`src/lib/staffing.ts`, `STAFFING_RULES`) und
werden im Tab „Tài liệu" direkt daraus angezeigt.

- **Bereiche:** Bếp (Küche), Phục vụ (Service), Lái xe (Fahrer). Personen ohne
  Bereich zählen wie Service, bis der Admin sie zuordnet.
- **Fahrer** arbeiten nur 18:00–21:00, sonntags und an Feiertagen 18:00–22:00
  (kürzester Dienst 2 h, bevorzugt das ganze Fenster), zählen nicht zur
  Besetzung im Laden; je Abend 1–2 Fahrer.
- **Im Laden** während jedes Öffnungsblocks mindestens 1 Küche und 2 Service.
- **Mittags nur 2 Personen in der Küche** (Öffnung bis 14:30) – Vorgabe des Betriebs.
- **Abendspitze 18:00–21:00:** 4–8 Personen im Laden, Fr–So ×1,5 (6–12).
- **Tagesgewichte:** Fr, Sa, So 1,5; Mo–Do 1,0. Die Nachfragekurve hat ihre
  Spitze abends 18:30–20:30.

## Verträge und Vorlieben

- **Monatsvertrag** (z. B. 92,70 h/Monat): im 30-Minuten-Raster geplant und nie
  überschritten (92,70 h → 92,5 h), nach Tagesgewicht × Öffnungsdauer auf die
  Wochen verteilt.
- **Azubi:** 39 h/Woche als harte Wochengrenze. In eingetragenen
  Berufsschulzeiten kein Dienst; diese Tage zählen nicht ins Soll und stehen auf
  dem Stundenzettel als „Berufsschule".
- **Vollzeit:** feste Dienste – die erste volle Woche legt das Muster je
  Wochentag fest, Abweichungen kosten.
- **Teilzeit/Minijob (inkl. Fahrer):** bevorzugt in der Abendspitze und auf
  Fr–So. Service und Fahrer werden zuerst geplant, Küchenkräfte erst nach der
  Vollzeit – so bleibt die Mittagsküche bei 2 Personen.
- 9 h bezahlte Arbeit je Tag, höchstens 6 Tage am Stück und 6 Tage je Woche.
  Pausen über 6 h 30 Minuten, über 8 h 60 Minuten.

## Entwicklung

React, TypeScript, Vite, Tailwind CSS, date-fns und Vitest.

```bash
npm install
npm run dev
```

```bash
npx tsc -b
npx vitest run
npm run build
```

Persistenz über LocalStorage und optional Supabase (`store_data`, Zeile
`store_id = "anan"`), konfiguriert mit `VITE_SUPABASE_URL` und
`VITE_SUPABASE_ANON_KEY`. Die Passwortsperre im Client ersetzt keine
Zugriffskontrolle.

Wichtige Module:

- `src/lib/weeklyScheduler.ts`: Wochenzuteilung, Bereiche und Vorlieben.
- `src/lib/contract.ts`: Monats-/Wochenverträge und Wochenbudgets.
- `src/lib/staffing.ts`: Bereiche, Besetzungsregeln, Nachfragekurve.
- `src/lib/availability.ts`: Eintritt, Wochentage, Berufsschulzeiten.
- `src/lib/validation.ts`: Vertrags- und Schichtprüfung.
- `docs/`: Checklisten für Freigabe und Abnahme.
