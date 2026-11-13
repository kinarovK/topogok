# F6 – Design és megvalósítás: oldalelhagyási jelzések és tanári felülvizsgálat

Dátum: 2026-11-13. Állapot: **megvalósítva, a `staging` ágban**. Tulajdonosi döntés (2026-11-13): az elrejtéssel érintett toplistás kör a tanár jóváhagyásáig **függő**.
Követelmények: [F6_INTEGRITY_SIGNALS.md](F6_INTEGRITY_SIGNALS.md). Erre épül: F3 (lezárás), F5 (toplista, `review_status`).

## 1. Elv

- **Nincs új kérés.** A jelzéseket a böngésző a kör alatt gyűjti, és a már meglévő lezáró kéréssel együtt küldi el (F3: körönként 2 kérés marad).
- Ez **eseménynapló, nem bizonyíték**:
  - nincs kamera, mikrofon, képernyőkép, és nincs más ablak figyelése;
  - más eszköz használata nem észlelhető;
  - bezárt fülből nem garantált az utolsó küldés.

  A felület ezt a számonkérés előtt közli.
- Csak a bejelentkezett diák **számonkérésénél** gyűjtünk, a gyakorlásnál és a vendégnél nem.

## 2. Események (F6-01, F6-05)

Három külön típus, mindegyik időintervallum a kör órája szerint (ms):

| Típus | Böngészőesemény | A diák látja | A tanár látja | Toplista |
|---|---|---|---|---|
| `hidden` | `visibilitychange` → hidden/visible (fülváltás, alkalmazásváltás, képernyőzár) | Visszatéréskor figyelmeztetés: „Elhagytad az oldalt (12 mp). A tanárod látni fogja.” | Darabszám, összidő, időpontok | jóváhagyásig **függő** |
| `blur` | ablak `blur`/`focus` (pl. rendszerablak, másik ablakra kattintás) | semleges jelzés („Az ablak nem volt aktív.”) | külön típus | önmagában nem függeszt fel |
| `offline` | `offline`/`online` | kapcsolatjelzés, a kör folytatható | technikai esemény | nem zár ki automatikusan |

**Összefésülés:**
- Típusonként az átfedő intervallumok összeolvadnak.
- A `blur` időből levonjuk a `hidden` időt, mert ugyanaz a kiesés nem számít kétszer.
- Minden intervallum a `[0, köridő]` tartományba szorul, negatív nem lehet.
- A szerver ezt újra elvégzi a kapott adaton, és csak az eredményt tárolja: darabszám és összidő típusonként, plusz a normalizált intervallumlista legfeljebb 200 elemmel.
- A lezárás idempotens (F3), az ismételt küldés nem dupláz.

A figyelmeztetés nem állítja meg az órát, nem von le pontot, nem zárja le a kört és nem fedi fel a megoldást (F6-02).

## 3. Felülvizsgálat (F6-03, F6-06)

- Ha egy kör **toplista-jelölt** (F5 1. pont) és van `hidden` intervalluma, a lezáráskor `review_status = 'pending'` lesz.
- Ha egy F6-ot már ismerő szerverre jelzésadat nélkül érkezik a számonkérés lezárása (régi, frissítés előtti kliens), az eredmény „ellenőrizhetetlen”: `integrity_version = 0`. Ha a kör toplista-jelölt, szintén `pending`, és nincs automatikus toplista.
- Az F6 előtt lezárt körök változatlanok (`review_status` üres, `integrity_version = 0`). Nem kapnak visszamenőleg „nem hagyta el” minősítést (F6-08), a tanári felület „F6 előtti kör, nincs adat” szöveget mutat.
- **Tanári döntés:** `POST /api/report/attempts/:id/review {decision: 'approved' | 'rejected', reason}`.
  - Az indoklás kötelező, a döntés naplózott, és később módosítható.
  - Csak olyan körre adható, amelyen van felülvizsgálati állapot.
  - A jegyet és a többi jogosultsági feltételt nem változtatja: a törölt vagy a kizárt kör jóváhagyással sem kerül fel.
- A diák:
  - az eredményoldalon látja, ha a kör jóváhagyásra vár;
  - a téma oldalán megjelenik: „Egy eredményed tanári jóváhagyásra vár.”

## 4. Adat (`migrations/0005_integrity.sql`)

- `attempts` új oszlopai:
  - `hidden_count`, `hidden_ms`, `blur_count`, `blur_ms`, `offline_count`, `offline_ms`;
  - `integrity_json`;
  - `review_by`, `review_at`, `review_reason`.
- `schema_meta` tábla (`version = 5`), hogy a health-ellenőrzés az oszlopbővítést is lássa.

## 5. Eszközök (F6-09)

- Böngészőemulációval ellenőrizve (Chromium, Playwright): a `visibilitychange`, `blur`/`focus` és `offline`/`online` események kezelése, az összefésülés és a tanári megjelenítés.
- **Valódi Android-, iOS- és asztali próba nincs.** Ez nyitott pont, nem állítjuk késznek. Ismert korlátok:
  - iOS Safariban a képernyőzár és az alkalmazásváltás késve vagy egyáltalán nem küld eseményt;
  - egy bezárt fül utolsó intervalluma elveszhet;
  - a `blur` asztali gépen gyakori ártalmatlan okból is (például értesítés miatt).

## 6. Kód és tesztek

- Kód:
  - `shared/integrity.ts` (összefésülés, levonás, összegzés, ellenőrzés), `src/account/integrity.ts` (gyűjtés);
  - `server/attempts.ts` (lezárás), `server/leaderboard.ts` (`review`, rekord: `pendingReview`);
  - `ResultsPanel` (napló, döntés).
- Tesztek:
  - `tests/unit/integrity.test.ts`;
  - `tests/api/integrity.test.ts` (3);
  - `tests/e2e/integrity.spec.ts`: Chromium-emuláció, elrejtés, offline/online, jóváhagyás után toplista.
