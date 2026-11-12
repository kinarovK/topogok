# F3 – Design és végrehajtási terv: próbálkozások mentése és tanári eredménypanel

Dátum: 2026-11-12. Állapot: **design, tulajdonosi jóváhagyásra (docs PR)**.
Követelmények: [F3_ATTEMPTS.md](F3_ATTEMPTS.md). Erre épül: [F2_DESIGN.md](F2_DESIGN.md) (fiókok, munkamenet, hatókör, D1).

## 1. Összkép

```
 Diák böngészője                                   Cloudflare (Pages Function + D1)
 ┌────────────────────────────────────┐            ┌─────────────────────────────────────────┐
 │ játék = a mostani domainkód        │ 1. start ─▶│ attempt létrehozása: szerveres idő,      │
 │ (src/domain: reduce, startGame)    │◀── seed ───│ seed, kérdéssor (snapshot)               │
 │                                    │            │                                         │
 │ minden lezárt kérdés után:         │ 2. events ▶│ eseménycsomag mentése (idempotens,      │
 │   eseménycsomag + sorszám          │◀── ok ─────│ sorszámmal), szabályellenőrzés          │
 │                                    │            │                                         │
 │ kör vége / lejárat / kilépés       │ 3. finish ▶│ a teljes kör ÚJRAJÁTSZÁSA ugyanazzal a   │
 │                                    │◀ eredmény ─│ domainkóddal → hiteles eredmény          │
 └────────────────────────────────────┘            └─────────────────────────────────────────┘
                                                   Tanár: GET /api/attempts… (szűrt lista, részletek)
```

**A kulcsdöntés:** a játékszabályok (`src/domain/game.ts`: `startGame`, `reduce`, pontozás, jegy) tiszta függvények, nincs bennük felület, óra vagy véletlen. Ezért **ugyanaz a kód** fut a böngészőben és a szerveren is:
- A szerver adja a **seedet**. Ebből a `startGame` ugyanazt a kérdéssort állítja elő mindkét oldalon, a szerver pedig az indításkor el is menti a kérdéssort (snapshot, F3-03).
- A böngésző csak **eseményeket** küld: „ezt jelöltem ki és véglegesítettem”, „megmutatást kértem”, „tovább”, „lejárt az idő”, mindegyiket a kör óráján mért időponttal.
- A szerver a végén az eseményeket a `reduce` függvénnyel **újrajátssza**, és **maga számolja** a pontot, a százalékot és a jegyet. A böngésző által küldött százalékot nem fogadja el. Illegális esemény esetén az egész kör `invalid` lesz (F3-05).

## 2. Az eseménynapló

| Esemény | Adat | Megjegyzés |
|---|---|---|
| `CONFIRM` | `featureId` (a kiválasztott egység), `t` | a domainben a `SELECT` és a `CONFIRM` párja, a köztes kijelöléseket nem gyűjtjük |
| `REVEAL` | `t` | gyakorlás: megoldás megmutatása |
| `NEXT` | `t` | gyakorlás: továbblépés a visszajelzés után |
| `TIME_CHECK` | `t` | számonkérés: a határidő elérése |

`t` = a körön belül eltelt idő ezredmásodpercben, a meglévő monoton óra szerint (`src/domain/clock.ts`).

- **Küldés:** egy **csomag** minden lezárt kérdés után megy el: gyakorlásnál a visszajelzés utáni `NEXT`-tel, számonkérésnél a véglegesítéssel. A csomag fejléce `{ attemptId, fromSeq, events[] }`.
- **Idempotencia:**
  - a szerver `(attemptId, seq)` szerint tárolja az eseményeket;
  - ha egy már tárolt sorszám ugyanazzal a tartalommal érkezik újra, „ok”-t ad, és nem dupláz;
  - eltérő tartalom esetén `409 conflict` a válasz;
  - lyukas sorszám (hiányzó esemény) `409 gap`, ilyenkor a kliens újraküldi a hiányzó részt.

  Így a dupla küldés, a lezárási verseny és az újrapróbálás sem dupláz (F3-06).
- **Szabályellenőrzés minden csomagnál:** a szerver az eddigi eseményeket és az újakat az állapotgéppel lejátssza.
  - Ha egy esemény nem változtat az állapoton (nem létező `featureId`, `CONFIRM` kijelölés nélkül, `REVEAL` számonkérésben, lezárt kör utáni esemény), vagy a `t` visszafelé halad, a válasz `422`, és a kör `invalid` állapotba kerül.
  - Valódi kliens ilyet nem küld, ezt E2E-teszt bizonyítja.

## 3. Állapotok és idő

**Állapotok:**
- `started`: elindult;
- `finished`: rendben befejezve;
- `expired`: számonkérésnél lejárt az idő;
- `abandoned`: megszakítva;
- `invalid`: szabálytalan.

Egy kör `abandoned` lesz, ha:
- újrakezdik;
- a diák új kört indít;
- kilépnek belőle („Kilépés”);
- 6 órán át nem érkezik esemény. Ezt a lekérdezés számolja ki, külön időzített feladat nem kell. Ilyenkor az időadatot „hiányos” jelzéssel mutatjuk.

A megszakított kör nyoma megmarad (F3-02).

**Idő** (F3-07):
- **Teljes köridő:** a kliens monoton órája szerint, felülről korlátozva a szerver két időbélyege közötti valós idővel (`finished_at − started_at` + 5 s tűrés). A kliens tehát nem tudja meghosszabbítani a köridőt, és negatív érték sem lehet.
- **Számonkérés időkorláttal:** a szerveres határidő az indítás + a korlát + 30 s tűrés. Az utána érkező események nem számítanak, a kör `expired`. A háttérben is telő óra a meglévő szabály szerint működik. A „háttérben tartott oldal” nem javíthatja a köridőt, mert az a teljes időt méri, nem a láthatót.
- **Látható oldalon töltött idő:** a böngésző `visibilitychange`-dzsel méri, és a `finish` kérésben küldi. A szerver nem engedi a teljes időnél nagyobbra. Ez technikai mérés, nem a figyelem bizonyítéka (a specifikáció szerint). Ha a kör nem `finish` kéréssel zárult (bezárt fül), ez az érték `null`, és „hiányos” jelzést kap.

## 4. Hálózatkiesés és fiókváltás

- A **kör a képernyőn folytatódik**. A nem elküldött csomagok egy memóriabeli sorban várnak, a játék alatt pedig egy kis jelzés látszik: „Mentés függőben” / „Mentve”.
  - Visszatéréskor és 2, 4, 8 … legfeljebb 60 másodpercenként a kliens újrapróbálja a küldést. Az idempotencia miatt ez biztonságos.
  - Az eredményoldalon csak akkor jelenik meg a „Mentve” felirat, ha a szerver a `finish` kérést elfogadta. Különben „Nem sikerült menteni” látszik, egy „Újra” gombbal.
- **Nincs `localStorage`-mentés.** Bezárt böngésző után nincs helyreállítás (ezt a specifikáció nem is kéri). A szerver ilyenkor `abandoned` állapotban, hiányos időadattal tartja meg a kört (F3-11, F2-08).
- **Fiókváltás:**
  - a várakozó sor a felhasználó azonosítójához kötött;
  - kijelentkezéskor eldobjuk, és ezt a felület jelzi is;
  - a szerver minden kérésnél ellenőrzi, hogy az attempt a bejelentkezett diáké-e: idegen attempt esetén `404`.

  Másik diákhoz így semmilyen adat nem tölthető fel.
- A **vendégjáték nem változik**: nincs indítási kérés, nincs mentés (F3-01). Az API hibája vagy elérhetetlensége sem a vendégjátékot, sem a diák játékát nem állítja meg. A diák ilyenkor a „Nem sikerült menteni” jelzést látja.

## 5. Adatmodell (`migrations/0002_attempts.sql`, csak bővítés)

```sql
attempts(
  id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES users(id),
  teacher_id TEXT NOT NULL, class_id TEXT NOT NULL,        -- snapshot az indításkor (később áthelyezett diák régi köre is a régi osztálynál marad)
  topic_id TEXT NOT NULL, data_version TEXT NOT NULL, mode TEXT NOT NULL,
  config TEXT NOT NULL,                                    -- JSON: count, timeLimitMinutes / showElapsed
  rules_version INTEGER NOT NULL,                          -- pontozási szabály verziója (most 1)
  seed INTEGER NOT NULL, question_ids TEXT NOT NULL,       -- JSON snapshot
  status TEXT NOT NULL,                                    -- started | finished | expired | abandoned | invalid
  started_at INTEGER NOT NULL, last_event_at INTEGER NOT NULL, finished_at INTEGER,
  next_seq INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER, visible_ms INTEGER, timing_complete INTEGER NOT NULL DEFAULT 0,
  total INTEGER, correct INTEGER, points INTEGER, max_points INTEGER, percent REAL, grade INTEGER,
  invalid_reason TEXT,
  deleted_at INTEGER, deleted_by TEXT, delete_reason TEXT  -- soft delete (F3-10)
)
attempt_events(attempt_id TEXT NOT NULL REFERENCES attempts(id), seq INTEGER NOT NULL,
               type TEXT NOT NULL, feature_id TEXT, t INTEGER NOT NULL, received_at INTEGER NOT NULL,
               PRIMARY KEY (attempt_id, seq))
```

Indexek: `(teacher_id, started_at)`, `(student_id, started_at)`.

**A szerver kérdéskészlete:**
- A `startGame`-nek és az újrajátszásnak kellenek a téma egységeinek azonosítói az adott adatverzióban.
- A szerver ezeket egy buildkor generált fájlból veszi (`server/topics.generated.ts`). Ez a fájl a `public/data/*/…/regions.geojson` alapján készül, csak az azonosítókkal.
- A 300 KB-os GeoJSON-t kérésenként nem olvassuk be, mert az elvinné a 10 ms CPU-keretet.
- A `data:validate` ellenőrzi, hogy a generált fájl és a csomagok egyeznek.

## 6. API

| Végpont | Ki | Leírás |
|---|---|---|
| `POST /api/attempts` | diák | indítás: `{topicId, dataVersion, config}` → `{attemptId, seed, questionIds}`. Az előző nyitott kör `abandoned` lesz. |
| `POST /api/attempts/:id/events` | a kör diákja | `{fromSeq, events[]}`: idempotens, szabályellenőrzéssel |
| `POST /api/attempts/:id/finish` | a kör diákja | `{finalSeq, visibleMs, reason: 'completed' \| 'quit'}` → újrajátszás, a végleges eredmény a szerver számítása |
| `GET /api/report/attempts` | tanár, szuperadmin | szűrés osztályra, diákra, témára, módra, időszakra és állapotra; lapozva. Összesítő: indított / befejezett / lejárt / megszakított / szabálytalan; teljes és látható idő; legutóbbi és legjobb eredmény |
| `GET /api/report/attempts/:id` | tanár, szuperadmin | részletek kérdésenként, újrajátszásból |
| `DELETE /api/report/attempts/:id` | tanár, szuperadmin | soft delete kötelező indoklással (`{reason}`), napló |

- A jogosultság az F2 hatókör-szabálya: a tanár csak a `teacher_id = saját` köröket látja, idegen azonosítóra `404`-et kap (F3-08).
- **Legjobb eredmény:** csak azonos *összehasonlítási kulcs* mellett vetjük össze a köröket. A kulcs: téma + adatverzió + mód + kérdésszám + időkorlát. A gyakorlópontot és a számonkérési jegyet sosem vonjuk össze egy számmá, külön oszlopban jelennek meg.
- **Frissítési korlát (F3-09):** a riport-végpontok munkamenetenként 10 másodpercenként egyszer válaszolnak (`sessions.last_report_at`), egyébként `429`-et adnak. A felületen a „Frissítés” gomb 10 másodpercig tiltva van, és az utolsó frissítés ideje látszik. Periodikus háttérlekérés nincs.

## 7. Tanári felület (a tanári felület új füle: „Eredmények”)

1. **Szűrők:** osztály, diák, térkép, mód, időszak (ma / 7 nap / 30 nap / egyéni) és állapot. Mellettük a Frissítés gomb és az utolsó frissítés ideje.
2. **Összesítő diákonként:** indított / befejezett / lejárt / megszakított körök, teljes és látható idő, legutóbbi eredmény, legjobb eredmény az összehasonlítási kulcs szerint. Mobilon kártyanézetben.
3. **Próbálkozáslista:** dátum, diák, téma, mód, beállítás, állapot, eredmény (gyakorlásnál pont/maximum és %, számonkérésnél helyes/összes, % és jegy), idő, hiányos-jelzés.
4. **Részletek:** kérdésenként a kérdezett egység, a beadott válasz(ok) sorrendben, helyesség, megmutatás és ismétlési szakasz; számonkérésnél a válasz és a helyesség. A neveket a tanár nyelvén mutatjuk, a tárolt adatverzió szerint.
5. **Törlés:** indoklás és megerősítés után. A törölt kör eltűnik a listából, az összesítésből, a „legjobb” értékekből és a részletekből is. A napló megőrzi.

A diák felülete nem változik, csak egy mentési állapotjelzés kerül a játékba és az eredményoldalra.

## 8. Keretek

| | Becslés: 100 diák, napi 10 kör/fő |
|---|---|
| Worker-kérés | körönként kb. 2 + kérdésszám → kb. 15 000 / nap (a keret 100 000) |
| D1-sorírás | körönként kb. 1 + események + indexek → kb. 30 000–60 000 / nap (a keret 100 000) |
| CPU / kérés | egy kör újrajátszása legfeljebb 27 kérdéssel: < 1 ms |
| Tárhely | körönként kb. 2–4 KB → 3 év alatt < 1 GB (a keret 5 GB) |

Ha a sorírás tartósan a keret 70%-a fölé menne, az eseményeket csomagonként egy sorba (JSON) vonjuk össze. Ez sémabővítéssel megoldható, a felületet nem érinti.

**Megőrzés (F3-12):** 3 tanév. Automatikus törlés nincs. A mentés az F2 szerint működik: Time Travel 7 napra, és a heti mentés 4 adatbázisba. A visszaállítást a preview-adatbázison egyszer végigpróbáljuk, és dokumentáljuk.

## 9. Tesztelés és bizonyíték

- **Egység- és API-tesztek** (`node:sqlite`):
  - **újrajátszás:**
    - helyes, hibás, megmutatott, ismételt gyakorlókör;
    - számonkérés jeggyel, időkorláttal és lejárattal;
  - **hamisítás** (F3-05):
    - küldött százalék;
    - idegen attempt;
    - nem létező egység;
    - szabálytalan sorrend;
    - visszafelé haladó idő;
    - határidő utáni válasz;
  - **dupla küldés és lezárási verseny** (F3-06);
  - **időkorlátok:** a teljes idő a szerver két időbélyegéhez van kötve, a látható idő nem nagyobb a teljesnél (F3-07);
  - **hatókör:**
    - tanár × tanár;
    - diák × idegen kör;
    - a soft delete kihat a listára, az összesítésre és a részletekre (F3-08, F3-10);
  - **10 s korlát** (F3-09);
  - **fiókváltás** (F3-11).
- **E2E** (`serve.mjs --api`, valódi API-kód):
  - két tanár diákjai játszanak;
  - teljes gyakorló- és számonkérő kör;
  - időlejárat;
  - **hálózatkiesés:** a Playwright offline módja → „Mentés függőben” → online → „Mentve”, duplázás nélkül;
  - bezárt fül: a kör megszakítottként, hiányos idővel jelenik meg;
  - tanári panel szűrésekkel és részletekkel;
  - soft delete;
  - fiókváltás egy eszközön;
  - a vendégjáték regressziója, és API-hiba esetén is működő játék.
- **Preview:** a deploy után a smoke-teszt ellenőrzi a migrációt (`schema=2`).

## 10. Végrehajtási terv

1. Ez a PR: a design (csak dokumentáció).
2. **F3 megvalósítás, egy PR:**
   - migráció és a generált kérdéskészlet;
   - szerveres indítás, események, lezárás, újrajátszás, riport;
   - kliensoldali mentési sor és állapotjelzés;
   - tanári „Eredmények” fül hu és uk nyelven;
   - tesztek.

   A preview-n kipróbálható, a merge után élesbe kerül.

## 11. Kérdések a tulajdonosnak

1. A „megszakított” állapothoz: 6 óra esemény nélkül után számítson-e megszakítottnak egy nyitva hagyott kör? (Javaslat: igen. A tanóra után a tanár már a végleges képet látja.)
2. A „legjobb eredmény” a javaslat szerint csak azonos téma, mód, kérdésszám és időkorlát mellett összehasonlítható. Ez így megfelel-e? Például az 5 kérdéses és a „Mindegyik” kör legjobbja külön sorban jelenik meg.
