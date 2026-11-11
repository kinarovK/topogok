# F2 – Design és végrehajtási terv: backend, fiókok, osztályok, jogosultságok

Dátum: 2026-11-11. Állapot: **elfogadva 2026-11-11** (docs PR #5).
Követelmények: [F2_ACCOUNTS.md](F2_ACCOUNTS.md), közös szerződés: [task.md](../task.md), döntések: [DECISIONS.md](../DECISIONS.md).

Ez a dokumentum dönti el a `task.md` 12. pontjában nyitva hagyott technikai kérdéseket: a szolgáltatót, a felhasználónév–jelszó alapú belépést és a jelszó-hash módját, a munkamenetet, az API-t, a jogosultság-ellenőrzést, az adatmentést és a tesztelést. Az implementáció csak a jóváhagyás után indul, külön PR-okban (lásd 12. pont).

## 1. Összkép: hogyan működik a rendszer

```
 Böngésző (telefon / gép)                     Cloudflare (ingyenes csomag)
 ┌────────────────────────────┐   HTTPS   ┌─────────────────────────────────────────┐
 │ TopoGok PWA (React)        │──────────▶│ Pages: statikus fájlok (mint eddig)     │
 │  • vendégjáték (offline is)│           │   topogok.pages.dev/…                   │
 │  • belépés, tanári felület │──/api/*──▶│ Pages Functions (Worker): TopoGok API   │
 │    (csak online)           │◀──JSON────│   • belépés, munkamenet, jogosultság    │
 └────────────────────────────┘  cookie   │   • osztályok, diákok, tanárok          │
                                          │            │ SQL                        │
                                          │            ▼                            │
                                          │ D1 adatbázis (SQLite)                   │
                                          │   topogok-prod / topogok-preview        │
                                          └─────────────────────────────────────────┘
```

- **Egy cím, egy szolgáltató.** Az API ugyanazon a címen fut, mint az alkalmazás (`/api/...`). Ezért a meglévő CSP (`connect-src 'self'`) változatlan marad, nincs CORS, és a munkamenet sütije csak ehhez az oldalhoz tartozik.
- **Pages Functions.** A Cloudflare Pages a `functions/` mappában lévő TypeScript-kódot Workerként futtatja. Egy `_routes.json` fájl biztosítja, hogy csak a `/api/*` kérések futtassanak kódot. A statikus fájlok kiszolgálása ingyenes, és nem számít bele a Worker-keretbe.
- **D1** a Cloudflare SQLite-alapú adatbázisa, amelyet a Worker közvetlenül ér el (binding: `DB`). Két külön adatbázis lesz:
  - `topogok-prod`: éles adat, csak a `main` ág deployja használja;
  - `topogok-preview`: csak tesztadat, minden más ág preview-deployja ezt használja.

  Valódi diákadat így tesztkörnyezetbe nem kerül.
- **A vendégmód változatlan.** Bejelentkezés nélkül minden úgy működik, mint most, offline is. A fiókos részek online kellenek. A service worker az `/api/*` válaszokat soha nem tárolja.

## 2. Szolgáltató-választás

| Szempont | **Cloudflare Pages Functions + D1** (választott) | Supabase (Postgres + Auth) | Firebase (Auth + Firestore) |
|---|---|---|---|
| Ingyenes keret 100 felhasználóra | bőven: 100 000 Worker-kérés/nap, D1: 5 M sor olvasás és 100 000 írás/nap, 5 GB | bőven | bőven |
| Túllépés | a kérés hibát kap, **nincs számlázás** | a projekt korlátozódik | kártya nélkül hibát kap |
| Inaktivitás | nincs | **az ingyenes projekt 1 hét inaktivitás után szünetel**, kézzel kell újraindítani (pl. szünidő után) | nincs |
| Felhasználónév-belépés e-mail nélkül | saját megvalósítás | csak kamu e-mail-címmel | csak kamu e-mail-címmel |
| Új szolgáltató, új titkok, CSP | nincs, a meglévő fiók | új fiók, külső domain a CSP-ben | új fiók, Google-domainek a CSP-ben |
| Jogosultság | szerveres kód + SQL, tesztelhető | RLS-szabályok az adatbázisban | biztonsági szabálynyelv |
| Mentés | Time Travel 7 nap + saját heti mentés | napi mentés csak fizetős csomagban | csak fizetős csomagban |

A döntés: **Cloudflare**. Mellette szól, hogy már ott fut a frontend, nincs inaktivitási szünetelés, a túllépés nem kerül pénzbe, és nem kell új szolgáltatót bevonni. Hátránya, hogy a belépést magunknak kell megírnunk. Ezt a 3–4. pont részletezi, a tesztek pedig közvetlenül az API-n ellenőrzik.

**Fontos korlát:** az ingyenes Workerben kérésenként legfeljebb **10 ms CPU-idő** használható. Egy szerveroldali, megfelelően lassú jelszó-hash (például 100 000 körös PBKDF2) erre a gépre mérve már 17 ms. Ezért a lassú számítás a kliensen történik (3. pont), a szerver csak egy gyors ellenőrzést végez. Egy kérés CPU-igénye így 1 ms alatt marad.

## 3. Jelszavak

Követelmény: legalább **6** karakter (tulajdonosi döntés, 2026-11-11; az eredeti specifikációban 10), olvashatatlan tárolás, az admin sem láthatja, korlátozott próbálkozás. Ehhez a következő megoldást választjuk („kliensoldali kulcsszármaztatás + szerveres bors”):

1. Jelszó beállításakor a tanár vagy admin böngészője véletlen 16 bájtos **sót** generál. Ebből és a jelszóból **PBKDF2-SHA256, 600 000 kör** (OWASP-ajánlás) segítségével 32 bájtos kulcsot számol (`K`). Ez telefonon kb. 0,3–1 másodperc, és csak belépéskor vagy jelszócserekor fut.
2. A szerver a jelszót **soha nem kapja meg**, csak a sót és a `K` kulcsot. Ezt tárolja: `verifier = HMAC-SHA256(PEPPER, K)`. A `PEPPER` egy Cloudflare-titok, ami nincs az adatbázisban.
3. Belépéskor a kliens előbb lekéri a felhasználó sóját és KDF-paramétereit (`POST /api/auth/salt`), kiszámolja `K`-t, majd elküldi (`POST /api/auth/login`). A szerver állandó idejű összehasonlítással ellenőriz.
   - Ismeretlen felhasználónévre is kitalált, de mindig ugyanolyan sót ad vissza (`HMAC(PEPPER, "salt:" + login)`). Így a válaszból nem derül ki, létezik-e a fiók.

**Miért biztonságos:**
- Az adatbázis kiszivárgása önmagában semmit nem ad: a bors nélkül nem ellenőrizhető tipp.
- Ha a bors is kiszivárogna, akkor is tippenként 600 000 PBKDF2-kört kell futtatni.
- A jelszó soha nem halad át a hálózaton, és nem kerül naplóba.

**Korlát:** a 6 karakteres minimumot a tanári vagy admin felület ellenőrzi, mert a szerver nem látja a jelszót. Ezt csak tanár vagy admin kerülhetné meg, és csak a saját diákjainál. Ezt elfogadott, dokumentált eltérésként kezeljük. A KDF körszáma felhasználónként tárolódik, így később emelhető.

**Próbálkozáskorlátozás** (D1-tábla, csúszó ablak):
- felhasználónevenként 5 hibás próbálkozás után 15 perc várakozás, utána exponenciálisan nő;
- IP-címenként 30 hibás próbálkozás / 15 perc.

A válasz ilyenkor `429`, és a felület megmutatja a várakozási időt. A sikeres belépés törli a felhasználónévhez tartozó számlálót.

## 4. Munkamenet (tartós belépés, visszavonható)

- Sikeres belépés után a szerver 32 bájtos véletlen tokent ad egy sütiben: `topogok_session`, `HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=180 nap`. Az adatbázisba csak a token SHA-256-ja kerül (`sessions.id`), így egy adatbázis-szivárgásból nem lehet munkamenetet átvenni.
- **Nincs tétlenségi kiléptetés.** A lejárat 180 nap, és naponta legfeljebb egyszer meghosszabbodik, ha a fiókot használják. Aktív diák így gyakorlatilag nem lép ki.
- **Visszavonás** (a `sessions.revoked_at` kitöltésével):
  - kijelentkezés: az adott munkamenet;
  - jelszócsere, archiválás, letiltás: a felhasználó összes munkamenete.

  A tanár letiltása minden kérésnél ellenőrződik. Letiltott tanár diákjai azonnal elveszítik a fiókos hozzáférést, de a sütijük nem törlődik, csak hatástalan lesz.
- **CSRF-védelem:**
  - `SameSite=Strict` süti;
  - minden módosító kérés `X-TopoGok: 1` fejlécet kér, amit idegen oldal nem tud beállítani;
  - a szerver ellenőrzi az `Origin` fejlécet.
- **Közös eszköz (F2-08):** személyes adat nem kerül `localStorage`-ba vagy a PWA-cache-be. Kijelentkezéskor törlődik a memóriabeli állapot és a `sessionStorage`. A süti `HttpOnly`, a szerver törli.

## 5. Adatmodell (D1 / SQLite)

```sql
users(
  id TEXT PRIMARY KEY,                       -- véletlen UUID
  role TEXT NOT NULL CHECK (role IN ('superadmin','teacher','student')),
  login TEXT NOT NULL,                       -- megjelenített alak
  login_norm TEXT NOT NULL UNIQUE,           -- egyediség ezen (lásd lent)
  full_name TEXT NOT NULL,
  teacher_id TEXT REFERENCES users(id),      -- csak diáknál, kötelező
  class_id TEXT REFERENCES classes(id),      -- csak diáknál, kötelező
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived','disabled')),
  pw_salt BLOB NOT NULL, pw_iterations INTEGER NOT NULL, pw_verifier BLOB NOT NULL,
  pw_changed_at INTEGER NOT NULL, created_at INTEGER NOT NULL, created_by TEXT,
  updated_at INTEGER NOT NULL, archived_at INTEGER
)
classes(id TEXT PRIMARY KEY, teacher_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL,
        name_norm TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', created_at INTEGER NOT NULL,
        archived_at INTEGER, UNIQUE (teacher_id, name_norm))
sessions(id TEXT PRIMARY KEY /* sha256(token) */, user_id TEXT NOT NULL REFERENCES users(id),
         created_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
         revoked_at INTEGER, user_agent TEXT)
login_throttle(key TEXT PRIMARY KEY /* 'login:<norm>' | 'ip:<addr>' */, failures INTEGER NOT NULL,
               window_start INTEGER NOT NULL, locked_until INTEGER)
audit_log(id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, actor_id TEXT, action TEXT NOT NULL,
          target_type TEXT, target_id TEXT, teacher_scope TEXT, details TEXT /* JSON, never a password */)
```

- **Konzisztencia:**
  - diáknál kötelező a `teacher_id` és a `class_id`;
  - az osztály tanárának egyeznie kell a diák tanárával;
  - tanárnál és szuperadminnál mindkettő üres.

  Ezt az API-kód és adatbázis-triggerek is ellenőrzik, így hibás kérés sem hozhat létre árva vagy keresztbe kötött diákot.
- **Felhasználónév (login):** Unicode NFKC normalizálás, kisbetűsítés. Csak `a–z 0–9 . _ -` engedett, 3–32 karakter, betűvel vagy számmal kezdődik. Globálisan egyedi a normalizált alakon, így az „Anna.K” és az „anna.k” ugyanaz. Ékezet nem lehet benne, mert telefon-billentyűzeten az eltérő karakterkódok egyediség-megkerülést okoznának.
- **Teljes név:** 1–80 karakter, NFC, szóközök összevonva. **Osztálynév:** 1–40 karakter. Tanáronként egyedi, két tanárnak lehet azonos nevű osztálya.
- **Archiválás:** nem töröl, a történeti adat megmarad (F3-tól a próbálkozások is). Osztályt csak üresen lehet törölni. Archiválni lehet, de ha aktív diák van benne, az áthelyezést kér.
- **Séma-migrációk:** sorszámozott SQL-fájlok (`migrations/0001_init.sql` …). A CI a deploy előtt alkalmazza őket: `wrangler d1 migrations apply`, a preview-ra a preview-adatbázist, a `main`-re az élest.

## 6. API (JSON, `/api/...`)

| Végpont | Ki hívhatja | Leírás |
|---|---|---|
| `POST /api/auth/salt` | bárki | só és KDF-paraméterek (ismeretlen loginra kitalált, állandó) |
| `POST /api/auth/login` | bárki | belépés, süti beállítása; korlátozott |
| `POST /api/auth/logout` | belépett | munkamenet visszavonása |
| `GET /api/me` | belépett | saját adatok: név, szerep; diáknál a tanár neve és az osztály |
| `GET/POST /api/classes`, `PATCH/DELETE /api/classes/:id` | tanár, szuperadmin | saját (adminnál: kiválasztott tanár) osztályai |
| `GET/POST /api/students`, `PATCH /api/students/:id` | tanár, szuperadmin | listázás osztály/állapot szerint, létrehozás, név/login/osztály módosítása, archiválás/visszaállítás |
| `POST /api/students/:id/password` | tanár, szuperadmin | új só + kulcs; minden munkamenete visszavonódik |
| `DELETE /api/students/:id` | csak szuperadmin | végleges törlés, a diák loginjának begépelésével megerősítve |
| `GET/POST /api/teachers`, `PATCH /api/teachers/:id`, `POST /api/teachers/:id/password` | csak szuperadmin | tanárkezelés, letiltás |
| `GET /api/audit` | csak szuperadmin | biztonsági napló, lapozva |
| `POST /api/setup` | egyszeri belépési kód birtokosa | első szuperadmin vagy helyreállítás (8. pont) |
| `GET /api/health` | bárki | verzió és adatbázis-elérhetőség (smoke) |

**Jogosultsági szabály** (minden végpontban ugyanaz a kód, nem a felület dönt):
1. A sütiből jön a felhasználó. Diák, letiltott vagy archivált felhasználó nem kezel semmit.
2. A **hatókör** (`teacherScope`):
   - tanárnál mindig a saját azonosítója, a kérésben küldött `teacherId` figyelmen kívül marad;
   - szuperadminnál a kérésben kötelezően megadott, létező tanár.
3. Minden SQL-lekérdezés tartalmazza a `WHERE teacher_id = :teacherScope` feltételt. Idegen azonosító ezért `404`-et ad, nem `403`-at, így az sem derül ki, hogy létezik-e.
4. A módosító műveletek az `audit_log`-ba kerülnek: végrehajtó, időpont, cél és a változott mezők nevei. A jelszó vagy kulcs soha nem kerül bele.

A hibák `{"error": "<kód>"}` alakban jönnek, ezért a felület mindkét nyelven tudja mutatni őket. Példák: `login_taken`, `class_not_empty`, `rate_limited`, `not_found`, `forbidden`.

## 7. Felület (hu/uk, mobil, világos/sötét)

- **Fejléc:**
  - vendégnél egy „Belépés” gomb;
  - belépve egy névcímke a szereppel, diáknál a tanár nevével, mellette a „Kilépés” gomb.
- **Belépési képernyő:** felhasználónév és jelszó. A számolás alatt „Belépés…” felirat látszik, a próbálkozáskorlátnál a várakozási idő.
- **Diák (F2):** a főoldalon látszik, ki van belépve, a játék a vendégmóddal azonos. Az F3 előtt nincs mentés, és működés nélküli „eredmények” menüt sem teszünk be.
- **Tanár:** „Tanári felület”, két nézettel:
  - **Osztályok:** létrehozás, átnevezés, archiválás, üres osztály törlése;
  - **Diákok:** szűrés osztályra és állapotra. Létrehozás teljes névvel, loginnal, jelszóval (kétszer) és osztállyal. Ezenkívül szerkesztés, áthelyezés saját osztályok között, archiválás és jelszócsere.

  Hosszú listák mobilon kártyanézetben jelennek meg.
- **Szuperadmin:**
  - **Tanárok:** létrehozás, szerkesztés, jelszócsere, letiltás;
  - tanárválasztó, amivel ugyanazok az osztály- és diáknézetek érhetők el;
  - **Napló.**
- A szövegek a `src/i18n/{hu,uk}.json` új csoportjaiba kerülnek, a hibakódokhoz is lesz fordítás. A gombok és a fókusz a meglévő stílusútmutatót követik.

## 8. Első szuperadmin és helyreállítás

- **Első indítás:** a tulajdonos egy `SETUP_CODE` titkot állít be a Cloudflare-ben. Az alkalmazás `#/setup` oldalán ezzel, valamint loginnal, névvel és jelszóval létrehozza a szuperadmint. Az `/api/setup` csak akkor működik, ha még nincs aktív szuperadmin, vagy ha érvényes helyreállítási kód van.
- **Helyreállítás** (elveszett jelszó): egy kézzel indítható GitHub Actions munkafolyamat (`admin-recovery`) a Cloudflare-tokennel egyszer használható, 1 óráig érvényes helyreállítási kódot ír a D1-be. Csak a kód hash-e kerül oda, maga a kód a privát repó futási naplójában jelenik meg, csak a tulajdonosnak. Ezzel a `#/setup` oldalon új jelszót lehet adni. Minden korábbi munkamenet visszavonódik, a lépés naplózódik.
- **2FA:** a specifikáció szerint későbbi feladat. Nem építünk be üres kapcsolót.

## 9. Adatmentés és megőrzés

- **D1 Time Travel:** az ingyenes csomagban automatikusan visszaállítható bármely pillanat az elmúlt 7 napból (`wrangler d1 time-travel restore`).
- **Heti mentés, 4 hétig:** egy ütemezett GitHub Actions munkafolyamat hetente exportálja az éles adatbázist (`wrangler d1 export`), és körforgásban betölti a négy mentési adatbázis egyikébe (`topogok-backup-1…4`). Az ingyenes csomag 10 adatbázist enged.
  - A személyes adat így nem hagyja el a Cloudflare-t.
  - GitHub-artifact sem kell; a fiók artifact-tárhelyével korábban gond volt.
  - A futás eredménye a GitHub Actions felületén látszik.
- **Visszaállítás:** dokumentált parancsokkal a Time Travelből vagy egy mentési adatbázisból. A visszaállítás után minden munkamenet visszavonódik, így törölt vagy letiltott hozzáférés nem éledhet újra észrevétlenül.
- **Megőrzés:** 3 tanév, automatikus törlés nincs. A tárhely (ingyenesen 5 GB) a heti mentés naplójában is megjelenik.

## 10. Terhelés és keretek (ellenőrzött számok, 2026-11-11)

| Erőforrás | Ingyenes keret | Becslés (3 tanár, 100 fiók, 30 egyidejű) |
|---|---|---|
| Worker-kérések (csak `/api/*`) | 100 000 / nap (UTC éjfélkor nullázódik) | < 5 000 / nap |
| CPU / kérés | 10 ms | < 1 ms (nincs szerveres lassú hash) |
| D1 sorolvasás | 5 M / nap | < 100 000 / nap |
| D1 sorírás | 100 000 / nap | < 2 000 / nap (belépés, napló, adminműveletek) |
| D1 tárhely | 5 GB | < 10 MB az F2-ben |

**Túllépés esetén** a Worker vagy a D1 hibát ad, számlázás nincs. A felület ilyenkor érthető hibát mutat, a vendégjáték továbbra is működik.

## 11. Tesztelés és bizonyíték

- **API-integrációs tesztek** (`node:test`):
  - A szerverkód platformfüggetlen, a D1-felületet egy kis adapter adja, amely a Node beépített SQLite-jára (`node:sqlite`) épül. Így ugyanaz a kód fut a tesztben, mint a Cloudflare-en, és a GitHub Actionsben is.
  - Tesztadat: két tanár, mindkettőnek „8.A” osztállyal, több diákkal és egy szuperadminnal.
  - **Táblázatvezérelt negatív teszt:** minden végpontra és minden szerepre („diák”, „másik tanár”, „kijelentkezett”, „letiltott tanár diákja”) ellenőrzi, hogy a válasz megtagadás vagy `404`, és nem szivárog adat (F2-04, G-04).
  - **Ezenkívül:**
    - login-normalizálás és egyediség;
    - próbálkozáskorlát;
    - CSRF-fejléc és `Origin`;
    - munkamenet-visszavonás jelszócserénél, archiváláskor és letiltáskor;
    - a naplóban nincs titok;
    - végleges törlés csak megerősítéssel.
- **E2E (Playwright):** a helyi kiszolgáló (`serve.mjs`) az `/api/*` kéréseket ugyanarra a szerverkódra irányítja, SQLite-tal. A felületet így tesztelni lehet:
  - belépés, tanári és admin folyamatok mindkét nyelven, mobilon;
  - kijelentkezés után közös eszközön nincs előző adat;
  - a vendégjáték regressziója.
- **Valódi Cloudflare-en (preview):** deploy után a smoke-teszt hívja a `/api/health` végpontot (adatbázis elérhető, migrációk rendben). A teszt egy tesztfiókkal be- és kilép a preview-adatbázisban.
- **Terhelés (G-02):** egy szkript 30 párhuzamos felhasználói folyamatot játszik le a preview-n, és ellenőrzi, hogy az adatok nem keverednek.

## 12. Végrehajtási terv (PR-ok)

1. **Ez a PR:** design (csak dokumentáció).
2. **F2-A backend:**
   - séma és migrációk;
   - `functions/` és `server/`: belépés, munkamenet, osztály-, diák- és tanár-API, napló, setup;
   - SQLite-adapter, API-tesztek;
   - CI: migrációk a preview- és az éles adatbázisra, `/api/health` smoke.

   Felület ebben a PR-ban még nincs. Ha merge-elve van, az élesen csak egy nem használt API fut.
3. **F2-B felület:**
   - belépés, fejléc, tanári és szuperadmin képernyők hu/uk nyelven;
   - E2E-tesztek;
   - setup-oldal, `admin-recovery` és heti mentési munkafolyamat.

   A preview-n a tulajdonos kipróbálja; merge után élesben létrehozza a szuperadmint.

## 13. Tulajdonosi lépések (a megvalósításhoz)

1. **Cloudflare API-token:** a meglévő `topogok-github-deploy` tokenhez hozzá kell adni a *Account → D1 → Edit* jogosultságot (Account resources: a saját fiók), hogy a CI migrálni és menteni tudjon.
2. **D1-adatbázisok:** a dashboardon (*Storage & Databases → D1 → Create*) hat adatbázis kell: `topogok-prod`, `topogok-preview` és `topogok-backup-1…4`. Az azonosítókat (ezek nem titkok) a PR-ba írjuk.
3. **Titkok a Pages-projektben** (*Settings → Variables and Secrets*, „Encrypt”), production és preview környezetben **külön értékkel**:
   - `PEPPER`: hosszú véletlen szöveg;
   - `SETUP_CODE`: a 8. pont szerinti első belépési kód.

   Generálni egy jelszókezelővel lehet, vagy közösen megnézzük. Ezeket sem a chatbe, sem a repóba nem szabad bemásolni.

## 13a. Megvalósítás (2026-11-11)

- Az F2-A és az F2-B egy PR-ba került, mert ugyanannak a fázisnak a két fele, és a felület nélkül a backend nem próbálható ki.
- **Backend:**
  - `migrations/0001_init.sql`, `server/`, `functions/api/[[path]].ts`, `wrangler.toml`;
  - a CI minden deploy előtt migrál, utána a smoke ellenőrzi, hogy az `/api/health` végpont `ok`;
  - a preview-n valódi D1-gyel ellenőrizve: a migráció lefutott, `db=true`, `schema=1`.
- **Felület:**
  - `src/account/`: API-kliens és a belépett felhasználó állapota;
  - `src/features/account/`: belépés, `#/setup`, tanári és szuperadmin képernyők;
  - a főoldalon egy fióksáv; hu és uk szövegek.
- **Munkafolyamatok:** `admin-recovery.yml`, `backup.yml` (heti mentés, 4 adatbázisos körforgással).
- **Tesztek:**
  - 13 API-teszt `node:sqlite`-tal, köztük a végpont×szerep izolációs teszt. Mutációval ellenőrizve: ha a hatókört vagy a visszavonást gyengítjük, a tesztek elbuknak.
  - 2 E2E-folyamat a valódi API-kóddal: setup → tanár → osztály → diák → diákbelépés → kijelentkezés közös eszközön; próbálkozáskorlát; ukrán felület.

## 14. Tulajdonosi döntések (2026-11-11)

- A login karakterkészlete `a–z 0–9 . _ -`, ékezet nélkül, például `kovacs.anna`: **elfogadva**.
- A 180 napos, használattal meghosszabbodó munkamenet: **elfogadva**. Aki fél évig nem használja a fiókját, annak újra be kell lépnie.
- A design elfogadva, az F2-A megvalósítás indulhat.
- **A jelszó minimális hossza 6 karakter, a 10 helyett** (2026-11-11, a preview kipróbálása után): a diákoknak egyszerűbb jelszó kell. A rövidebb jelszót a belépési korlát védi a próbálgatás ellen: felhasználónként 5 hibás próbálkozás után nő a várakozási idő. Adatbázis-szivárgás esetén a bors és a 600 000 körös kulcsszármaztatás védi.
