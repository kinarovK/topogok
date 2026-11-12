# F3 – Design és végrehajtási terv: próbálkozások mentése és tanári eredménypanel (karcsúsított)

Dátum: 2026-11-12. Állapot: **design, tulajdonosi jóváhagyásra (docs PR #8)**.
Követelmények: [F3_ATTEMPTS.md](F3_ATTEMPTS.md), a 2026-11-12-i tulajdonosi módosításokkal (lent). Erre épül: [F2_DESIGN.md](F2_DESIGN.md).

## 0. Tulajdonosi döntések (2026-11-12)

1. **Takarékos szerverhasználat:** körönként csak két kérés legyen, az indításkor és a lezáráskor. A kérdésenkénti válaszokat a szerver nem tárolja.
2. A tanárnak az kell, hogy **hány gyakorló és hány éles (számonkérő) kört indított** a diák, valamint a körök **összefoglaló eredménye, százalékkal és ponttal/jeggyel**. Ez utóbbi „mindenképp maradjon”. A kérdésenkénti rossz válaszok **csak a diák eredményoldalán** látszanak, a szerverre nem kerülnek. Ezzel az **F3-04** a tanári kérdésenkénti nézettel együtt kikerül.
3. A **legjobb eredménybe csak a teljes körök** számítanak bele, vagyis az összes elemmel („Mindegyik”) játszottak.
4. Egy kör **6 óra esemény nélkül** megszakítottnak számít.

## 1. Összkép

```
 Diák böngészője                                  Cloudflare (Pages Function + D1)
 ┌──────────────────────────────────┐             ┌──────────────────────────────────────────┐
 │ kör indítása                     │ 1. start ──▶│ attempt-sor: szerveres idő, seed,        │
 │                                  │◀─ seed ─────│ kérdéssor (snapshot)                     │
 │ játék a böngészőben, mint most   │             │                                          │
 │ (a szerver közben nem hallja)    │             │                                          │
 │ kör vége / lejárat / kilépés     │ 2. finish ─▶│ a teljes kör ÚJRAJÁTSZÁSA ugyanazzal a    │
 │ (a kör összes eseménye egyben)   │◀ eredmény ──│ domainkóddal → csak az összefoglaló marad │
 └──────────────────────────────────┘             └──────────────────────────────────────────┘
 Tanár: GET /api/report/… (összesítés és körlista, 10 s-os frissítési korláttal)
```

- **Egy kör = 2 kérés.** Az indításkor a szerver létrehozza a kör sorát, kiadja a **seedet**, és elmenti a kérdéssort. A lezáráskor a böngésző egyetlen kérésben elküldi a kör eseménynaplóját:
  - `CONFIRM` + a választott egység;
  - `REVEAL`;
  - `NEXT`;
  - `TIME_CHECK`;
  - mindegyikhez a kör órája szerinti időpont.
- **A csalásvédelem megmarad (F3-05).** A játékszabályok kódja (`src/domain`) tiszta függvény, ezért a szerver ugyanazzal a kóddal **újrajátssza** a kört, és ő számolja a százalékot, a pontot és a jegyet. A böngésző által küldött eredményt nem fogadja el. Illegális esemény esetén a kör `invalid`:
  - nem létező egység;
  - kijelölés nélküli véglegesítés;
  - visszafelé haladó idő;
  - határidő utáni válasz.
- **Az eseménynaplót a szerver nem tárolja**, csak egy összefoglaló sort. Ezért kevés a kérés, kevés az írás, és kicsi a tárhely.

## 2. Állapotok és idő

- **Állapotok:** `started` → `finished` / `expired` / `abandoned` / `invalid`. `abandoned` (megszakított) lesz egy kör, ha:
  - újrakezdik;
  - a diák új kört indít;
  - kilépnek belőle;
  - 6 órán át nem jön lezárás.

  Az utolsó esetet a lekérdezés számolja ki, külön írás vagy időzített feladat nem kell.
- **Teljes köridő:** a böngésző monoton órája szerint. Felülről a szerver két időbélyege között eltelt valós idő korlátozza, 5 s tűréssel. Negatív nem lehet, és a kliens nem tudja meghosszabbítani.
- **Számonkérés időkorláttal:** a szerveres határidő az indítás + a korlát + 30 s. Az utána beérkező válaszok nem számítanak, a kör `expired`.
- **Látható idő:** a böngésző `visibilitychange`-dzsel méri, és a lezáráskor küldi. Nem lehet nagyobb a teljesnél. Technikai mérés, nem a figyelem bizonyítéka. Megszakított körnél nincs ilyen adat, a felület „hiányos”-nak jelzi.

## 3. Hálózatkiesés és fiókváltás

- Az indító kérés elküldése nem akasztja meg a játékot. Ha nem sikerül, a kör vendégként folytatódik, és a felületen „Ez a kör nem lesz mentve” felirat jelenik meg. A kör így nem keveredhet hibás azonosítóval.
- **Lezárás kiesés közben:** az eredményoldalon „Mentés függőben” jelzés látszik. A böngésző 2, 4, 8 … legfeljebb 60 másodpercenként újrapróbálja, és visszakapcsoláskor azonnal küld. A lezárás **idempotens**: ugyanarra a körre a második lezárás ugyanazt az eredményt adja vissza, és nem dupláz (F3-06). Egy már lezárt körre érkező, eltérő tartalmú lezárás `409`-et kap.
- A sor csak memóriában van, `localStorage` nincs. Bezárt böngésző után a kör a szerveren „megszakított” marad. A nem mentett kört a felület sosem mutatja mentettnek.
- **Fiókváltás:** a várakozó lezárás a felhasználóhoz kötött. Kijelentkezéskor eldobjuk (ezt a felület jelzi), és a szerver is csak a kör saját diákjától fogad el lezárást. Idegen kör esetén `404` a válasz (F3-11).
- A **vendégjáték nem változik** (F3-01). Az API hibája semmilyen játékot nem állít meg.

## 4. Adatmodell (`migrations/0002_attempts.sql`, csak bővítés)

```sql
attempts(
  id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES users(id),
  teacher_id TEXT NOT NULL, class_id TEXT NOT NULL,           -- snapshot az indításkor
  topic_id TEXT NOT NULL, data_version TEXT NOT NULL, mode TEXT NOT NULL,
  question_count TEXT NOT NULL,                               -- '5' | '12' | 'all'
  is_full INTEGER NOT NULL,                                   -- az összes elemmel játszott kör (a „legjobb” csak ebből)
  time_limit_min INTEGER, rules_version INTEGER NOT NULL,
  seed INTEGER NOT NULL, question_ids TEXT NOT NULL,          -- snapshot (F3-03)
  status TEXT NOT NULL, started_at INTEGER NOT NULL, finished_at INTEGER,
  duration_ms INTEGER, visible_ms INTEGER,
  percent REAL, points INTEGER, max_points INTEGER,           -- gyakorlás
  correct INTEGER, total INTEGER, grade INTEGER,              -- számonkérés
  result_hash TEXT,                                           -- az idempotens lezárás összehasonlításához
  invalid_reason TEXT, deleted_at INTEGER, deleted_by TEXT, delete_reason TEXT
)
```

Egyetlen tábla. Indexek: `(teacher_id, started_at)` és `(student_id, started_at)`.

A szerver a témák egységazonosítóit egy buildkor generált fájlból veszi (`server/topics.generated.ts`), mert a GeoJSON beolvasása kérésenként elvinné a 10 ms CPU-keretet. A `data:validate` ellenőrzi, hogy a fájl egyezik-e a csomagokkal.

## 5. API

| Végpont | Ki | Leírás |
|---|---|---|
| `POST /api/attempts` | diák | indítás: `{topicId, dataVersion, config}` → `{attemptId, seed}`. Az előző nyitott kör `abandoned` lesz. |
| `POST /api/attempts/:id/finish` | a kör diákja | `{events[], visibleMs, reason}` → újrajátszás, összefoglaló, `{status, percent, …}`. Idempotens. |
| `GET /api/report/summary` | tanár, szuperadmin | diákonként: indított, befejezett, lejárt, megszakított és szabálytalan körök, gyakorló/éles bontásban; teljes és látható idő; legutóbbi eredmény; **legjobb eredmény csak teljes körből**, témánként és módonként |
| `GET /api/report/attempts` | tanár, szuperadmin | körlista szűrőkkel (osztály, diák, téma, mód, időszak, állapot), lapozva |
| `DELETE /api/report/attempts/:id` | tanár, szuperadmin | soft delete kötelező indoklással, napló (F3-10) |

- Hatókör: az F2 szabálya szerint a tanár csak a saját köreit látja, idegen azonosítóra `404`-et kap (F3-08).
- A gyakorlópont és a számonkérési jegy nem vonódik össze, külön oszlopban jelennek meg.
- A riport-végpontok munkamenetenként 10 másodpercenként egyszer válaszolnak, egyébként `429`-et adnak. A felületen a gomb 10 másodpercig tiltva van, és látszik az utolsó frissítés ideje (F3-09).

## 6. Felület

- **Diák:**
  - a játék változatlan;
  - az eredményoldalon mentési jelzés látszik („Mentve” / „Mentés függőben” / „Nem sikerült menteni – Újra”);
  - a rossz válaszokat a mostani eredményoldal mutatja, csak helyben.
- **Tanár – új „Eredmények” fül:**
  1. Szűrők, Frissítés gomb, az utolsó frissítés ideje.
  2. Összesítés diákonként: gyakorló és éles körök száma állapot szerint, idő, legutóbbi eredmény, legjobb eredmény (teljes körből). Mobilon kártyanézetben.
  3. Körlista: dátum, téma, mód, kérdésszám, állapot, százalék és pont/jegy, idő, hiányos-jelzés.
  4. Törlés indoklással.

## 7. Keretek (100 diák, napi 10 kör/fő)

| | Becslés | Ingyenes keret / nap |
|---|---|---|
| Worker-kérés | ~2 000 / nap (körönként 2 + a tanári lekérések) | 100 000 |
| D1-sorírás | ~5 000 / nap (sor + indexek, indításkor és lezáráskor) | 100 000 |
| D1-sorolvasás | indexelt lekérdezések, lapozva | 5 000 000 |
| CPU / kérés | egy legfeljebb 27 kérdéses kör újrajátszása < 1 ms | 10 ms |
| Tárhely | körönként ~0,5 KB → 3 év alatt ~50 MB | 5 GB |

**További takarékosság:**
- nincs háttérlekérés;
- a `/api/me` oldalbetöltésenként egyszer fut;
- a munkamenet naponta legfeljebb egyszer frissül;
- a „megszakított” állapot lekérdezéskor számolódik;
- a térkép és a játék statikus fájl, nem terheli a keretet.

**Megőrzés:** 3 tanév, és az F2 szerinti mentés (Time Travel és heti mentés). A visszaállítást egyszer a preview-adatbázison végigpróbáljuk (F3-12).

## 8. Módosított elfogadási feltételek

| ID | Változás |
|---|---|
| F3-04 | **Kikerül**: a tanár kérdésenkénti válaszlistája. Helyette a tanár látja minden kör összefoglaló eredményét (százalék, pont/jegy, idő, állapot). |
| F3-06 | A dupla küldés és az újrapróbálás tárgya a lezárás. Ugyanaz a lezárás nem dupláz, az eltérő `409`-et kap. |
| F3-08 | Kiegészül: a legjobb eredmény csak teljes körből számít. |

A többi feltétel változatlan.

## 9. Tesztelés

- **API-tesztek:**
  - újrajátszás: gyakorló kör helyes, hibás, megmutatott és ismételt válaszokkal; számonkérés jeggyel, időkorláttal és lejárattal;
  - hamisítás: küldött százalék, idegen kör, nem létező egység, szabálytalan sorrend, visszafelé haladó idő, határidő utáni válasz;
  - dupla és eltérő lezárás;
  - időkorlátok;
  - hatókör (tanár × tanár, diák × idegen kör);
  - soft delete; a 10 s-os korlát; a „legjobb” csak teljes körből; a 6 órás megszakítás.
- **E2E** (`serve.mjs --api`):
  - két tanár diákjai;
  - gyakorló és számonkérő kör, időlejárat;
  - offline lezárás → „Mentés függőben” → online → „Mentve”, duplázás nélkül;
  - bezárt fül → megszakított;
  - tanári összesítés és lista szűrőkkel, törlés;
  - fiókváltás; vendégjáték; API-hiba mellett is működő játék.
- **Preview:** a deploy utáni smoke ellenőrzi a migrációt (`schema=2`).

## 10. Terv

1. Ez a PR (#8): a design.
2. **F3 megvalósítás, egy PR-ban:**
   - migráció, generált kérdéskészlet;
   - indítás, lezárás és újrajátszás, riport;
   - kliens: indítás, lezárás, mentési jelzés;
   - tanári „Eredmények” fül hu és uk nyelven;
   - tesztek.
