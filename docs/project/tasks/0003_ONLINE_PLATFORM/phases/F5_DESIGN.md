# F5 – Design és megvalósítás: teljes térképes toplista és személyes rekord

Dátum: 2026-11-13. Állapot: **megvalósítva, a `staging` ágban**. A tulajdonos 2026-11-13-i döntése szerint F4–F6 egy ciklusban, külön design-PR nélkül készül ([DECISIONS.md](../DECISIONS.md)).
Követelmények: [F5_LEADERBOARD.md](F5_LEADERBOARD.md), [task.md](../task.md) 7. pont. Erre épül: F3 (körök), F4 (tanári készlet), F4.5 (nincs időkorlát).

## 1. Ki kerül fel a listára (F5-01, F5-02)

A szerver **a lekérdezéskor** dönti el egy körről, hogy toplistás-e, az `attempts` sorból. Tárolt „toplistás” jelző nincs, ezért egy törlés, kizárás vagy archiválás azonnal hat (F5-08).

Feltételek:
- `mode = 'assessment'`, `status = 'finished'` (a lejárt nem), `time_limit_min IS NULL`;
- `restricted = 0`, és a kör **kérdés-ID-halmaza pontosan a téma mostani teljes ID-halmaza**. Ezt a szerver a tárolt `question_ids` és a `TOPIC_FEATURES` összevetésével ellenőrzi, nem a darabszámból vagy az `all` feliratból;
- `deleted_at IS NULL`, `lb_excluded_at IS NULL` (tanári toplistás kizárás);
- `review_status IS NULL OR review_status = 'approved'` (az F6 előkészítése: a függő vagy elutasított kör nem kerül fel);
- a diák fiókja aktív, és a diák a lista tanárához tartozik;
- `started_at >= ` az aktuális versenyidőszak kezdete.

**Összehasonlíthatóság:** a mérce maga az ID-halmaz és a szabályverzió (`rules_version`).
- Ha egy adatfrissítés csak nevet javít, az ID-k nem változnak, a lista megmarad.
- Ha egy elem bekerül vagy kikerül, a régi körök ID-halmaza már nem egyezik, így maguktól kiesnek. Ez új összehasonlíthatósági csoport, régi és új eredmény nem keveredik csendben.
- A régi körök a tanári nyilvántartásban megmaradnak.

## 2. Rendezés (F5-03, F5-05)

- Diákonként egy sor: a legjobb kör.
- Sorrend: **helyes válaszok száma csökkenően** (a teljes halmaz miatt az összes kérdésszám egyforma, így ez a pontos arány), azon belül **teljes köridő növekvően**.
- A pontosan egyező helyes/idő pár azonos helyezést kap: 1, 1, 3.
- A jegy és a kerekített százalék nem rangsorol.
- A helyezést a szerver számolja, a kliens nem küldhet helyezést.

## 3. Versenyidőszak (F5-09)

- `lb_periods` tábla: tanár × téma × kezdés időpontja. Az aktuális időszak a legutolsó kezdés; ha nincs, az időszak „kezdettől” tart.
- A tanár megerősítés után új időszakot indíthat. A korábbi körök a tanári panelen megmaradnak, a diákok rekordja az új időszakban üresről indul.
- A tanári elemkapcsolás (F4) nem indít időszakot.

## 4. API

| Végpont | Ki | Mit csinál |
|---|---|---|
| `GET /api/leaderboard?topicId=` | diák (saját tanár köre), tanár (saját), szuperadmin (`teacherId`) | A lista, az időszak kezdete, a saját sor. **60 s-os, fiókszintű korlát** (`users.last_leaderboard_at`), több fülön és eszközön is érvényes. A korlát alatt 429 + `retryAfterSeconds`. |
| `GET /api/record?topicId=` | diák | A saját aktuális rekord (helyes/összes, százalék, idő) vagy `null`. Csak saját adat, korlát nélkül (1 olvasás a téma oldalán). |
| `POST /api/leaderboard/periods` | tanár | `{topicId, confirm: true}`: új időszak. Naplózott. |
| `POST /api/report/attempts/:id/leaderboard` | tanár | `{excluded, reason}`: kizárás a toplistából indoklással, illetve visszavonás. Naplózott. |

A riport (F3) sorai kiegészülnek: `leaderboardCandidate` (az 1. pont szerinti feltételek, időszak nélkül) és `lbExcluded`.

## 5. Felület

- **Téma oldala:**
  - bejelentkezett diáknál „Saját rekord: 25 / 27 · 92,6% · 03:12”, vagy „Még nincs toplistás eredményed”;
  - diáknál és tanárnál „Toplista” gomb.
- **Toplista képernyő:**
  - helyezés, teljes név, helyes/összes, százalék, idő; a saját sor kiemelve;
  - login és osztály nincs;
  - „Frissítés” gomb 60 s-os visszaszámlálással, utolsó frissítés ideje, üres és hibaállapot;
  - automatikus lekérés nincs, csak a képernyő megnyitásakor egyszer.
- **Számonkérés beállítása (F5-10):** előre jelzi, hogy a kör toplistás lehet-e, és ha nem, miért: vendég, nem „Mindegyik”, vagy a tanár szűkítette a készletet.
- **Tanári felület:**
  - az „Eredmények” listában a jelölt körnél „Kizárás a toplistából” (indoklással) / „Visszavonás”;
  - a „Toplista” fülön témaválasztó, a lista, és megerősítés után „Új versenyidőszak”.

## 6. Adatmodell (`migrations/0004_leaderboard.sql`)

- `lb_periods(teacher_id, topic_id, started_at, started_by)`.
- `attempts` új oszlopai:
  - `lb_excluded_at`, `lb_excluded_by`, `lb_exclude_reason`;
  - `review_status` (F6), `integrity_version` (F6: 0 = F6 előtti kör, nincs integritási adat; ezt nem minősítjük visszamenőleg).
- `users.last_leaderboard_at`.
- Index: `attempts(teacher_id, topic_id, mode, status)`.

## 7. Terhelés

- Toplista: fiókonként legfeljebb percenként 1 kérés, tanáronként egy-két lekérdezés.
- Rekord: téma-oldalanként 1 olvasás.
- Az ingyenes keretből ez elhanyagolható.

## 8. Tesztek

API (`tests/api/leaderboard.test.ts`):
- a jogosultság kizáró okai egyenként: 5 kérdés, szűkített, gyakorlás, időkorlátos, lejárt, megszakított, szabálytalan, törölt, kizárt, archivált, függő és elutasított felülvizsgálat;
- 12/12 · 5 perc előzi 11/12 · 1 percet; 26/27 ≠ 27/27; holtverseny 1, 1, 3;
- diákonként egy sor; két tanár köre külön;
- 60 s-os korlát két külön munkamenetből;
- kizárás és visszavonás, új időszak;
- egyező helyes/idő párnál az elsőként elért eredmény a saját rekord.

E2E: a diák lejátszik egy teljes kört, a toplistán és a rekordban megjelenik, a frissítés korlátozott; a tanár kizárja, majd visszaveszi az eredményt.

## 9. Megvalósítási megjegyzések

- A tanári „Toplista” fülön nincs előre kiválasztott téma. A percenkénti korlát miatt csak a kért téma töltődik be. Ha a tanár egy percen belül témát vált, a felület kiírja, mennyit kell várni.
- Javítva: a hibaszöveg-függvény (`useErrorText`) minden rendereléskor új példány volt. Emiatt az F4 „Témák” füle feleslegesen újrakérte a beállításokat. Most stabil, és az E2E ellenőrzi, hogy a fül és a toplista megnyitása egyetlen kérés.
- Kód:
  - `server/leaderboard.ts`, `server/rules.ts`;
  - `src/features/leaderboard/`;
  - `src/features/account/BoardPanel.tsx`;
  - kizárás a `ResultsPanel` listájában.
- Tesztek: `tests/api/leaderboard.test.ts` (4), `tests/e2e/leaderboard.spec.ts`.
