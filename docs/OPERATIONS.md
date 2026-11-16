# Fejlesztés, kiadás és üzemeltetés

## Repo és környezet

Projektgyökér: `D:\Work\Suli\Topo`, külön Git-repó. A tágabb `D:\Work\Suli` más iskolai anyagai nem részei. Távoli repó: a tulajdonos privát GitHub-repója, `kinarovK/topogok`. CI: GitHub Actions (`.github/workflows/ci.yml`). Hosting: Cloudflare Pages, Direct Upload. Pages-projekt: `topogok` a tulajdonos fiókjában. Éles: https://topogok.pages.dev, preview: `<ág>.topogok.pages.dev` ([F1_RELEASE](project/tasks/0003_ONLINE_PLATFORM/phases/F1_RELEASE.md)).

A runtime-verziót és csomagverziókat implementációkor rögzíteni kell. Egyetlen npm lockfile; CI-ben tiszta `npm ci`. A frontend futtatásához a már validált GeoJSON elegendő. Új SHP feldolgozásához dokumentált GDAL/GEOS környezet kell; a jelenlegi Windows QGIS útvonal nem lehet CI-be égetett feltétel.

## Megvalósított helyi környezet (2026-11-08)

- Runtime: Node.js ≥ 22.18 (`.nvmrc`: 22.23.4). Az egységtesztek és az adatpipeline a beépített TypeScript type strippinget használják, futtatásukhoz nem kell csomag.
- Csomagok: `package-lock.json`, telepítés `npm ci`. Rögzített fő verziók: Vite 8.3.6, React 19.3.1, MapLibre GL JS 6.16.0, vite-plugin-pwa 2.0.0 (Workbox 7.4), TypeScript 6.0.3, ESLint 10.14.0, Playwright 1.63.0. A TypeScript 7.x-et a typescript-eslint 8.72 még nem támogatja.
- A megvalósítás idején a build- és tesztkörnyezet nem érte el az npm-registryt. Ezért az `npm install` a tulajdonos Windows-gépén futott (Node 24.18.0, npm 11.16.0), a Linuxos natív csomagokat (Rolldown, LightningCSS, Rollup) pedig a `npm run setup:linux-binaries` töltötte le a lockfile verzióival. Normál, hálózattal rendelkező környezetben elég az `npm ci`.
- A MapLibre worker saját originről, hash-elt `assets/maplibre-gl-worker-*.mjs` fájlként töltődik (`setWorkerUrl`). Ezért elég a `worker-src 'self'`: nincs szükség blob-workerre, `unsafe-eval`-ra vagy inline stílusra. A `public/_headers` CSP-jét a `scripts/dev/serve.mjs` minden E2E-teszt alatt alkalmazza, és a tesztek konzolhibára is elbuknak.
- `npm run build` után a `scripts/build/verify-dist.mjs` ellenőrzi, hogy minden kiszolgált fájl benne van a precache-ben (a service worker és a `_headers` kivételével). Azt is ellenőrzi, hogy nem került a buildbe SHP-, backup-, docs-, src-, sourcemap- vagy `.env`-fájl.

## Tartalomfrissítés

1. Új inputot először külön ideiglenes helyen ellenőrizz; a korábbi fájlcsoportot mentsd el.
2. Ellenőrizd a licencet, CRS-t, ID-ket, a teljes hu/uk névkészletet és geometriát.
3. Változásról készíts jelentést: új/törölt ID, név és geometriai eltérés. Az eltérő darabszám scope-változás, nem csendes javítás.
4. Generálj új `dataVersion` csomagot, futtasd a teljes adatellenőrzést és térképi smoke-ot.
5. Az alkalmazásbuild ugyanazt az adatverziót referálja a manifestben, precache-ben és eredmény metadata mezőiben.
6. Kiadás után a régi futó kör a korábbi csomaggal fejeződik be; az új csomag csak frissítéskor aktiválódik.

## Verziózás

App semver: kezdeti prototípus 0.1.0, átvett stabil v1 1.0.0. Adatverzió külön semver vagy dátum+revízió, következetesen egy választott rendszerrel; javasolt `2026.11.05.1`. Manifest `schemaVersion` egész szám, változása migrációs/kompatibilitási döntés. Release record: appVersion, dataVersion, commit SHA, build hash, forráshashek és tesztjelentés. Verziót nem szabad pusztán marketingcélból késznek tekinteni.

## Cloudflare Pages kiadás

A cél statikus `dist` artifact HTTPS-en, szolgáltatói `pages.dev` címmel; a konkrét foglalható aldomaint csak létrehozáskor lehet megadni. Nincs saját domain, Functions vagy adatbázis. A statikus hosztolási mód a [Cloudflare dokumentációja](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/) szerint alakítandó.

CI sorrend: install → lint/typecheck → unit/integration → adatvalidáció/regenerálási diff → build → E2E smoke → artifact → engedélyezett deploy. Production branch `main`; preview külön címen. A deploy nem kerülheti meg a teszteket automatikus, párhuzamos Git-integrációval.

Megvalósítás (F1): GitHub Actions `gates` job, majd `deploy` job. A deploy a tesztelt `dist/`-et a cache-ből veszi vissza, és `wrangler@4.160.0 pages deploy`-jal tölti fel. A `main` ág élesre megy, minden más ág preview-ba. Utána a `scripts/release/smoke.mjs` a HTTPS-címen ellenőrzi a fejléceket, a `version.json` buildazonosítóját, a precache-elt fájlok elérhetőségét és a tiltott útvonalak hiányát. Secretek nélkül a deploy kimarad. Részletek, ingyenes keretek és tulajdonosi lépések: [F1_RELEASE](project/tasks/0003_ONLINE_PLATFORM/phases/F1_RELEASE.md).

Publikálás előfeltétele: dokumentált adatforrás és licenc, tulajdonosi hozzáférés/engedély, sikeres release gate. A licenc ismeretlensége miatt nyilvános preview sem kerülheti meg az adatkiadás ellenőrzését. A lokális implementáció folytatható.

## HTTP és csomag

A statikus fejlécek a buildbe másolt `_headers` fájlban kezelhetők a [Pages leírása](https://developers.cloudflare.com/pages/configuration/headers/) szerint. Elvárt: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, iframe-be ágyazás tiltása (`frame-ancestors 'none'`, kompatibilis X-Frame-Options), szükségtelen kamera/mikrofon/geolokáció tiltása.

CSP induló cél: default/script/connect/font/img források alapvetően self, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`. Worker és stílus kivételek kizárólag tényleges MapLibre bundle igény alapján; preferált a saját originről töltött worker. `unsafe-eval` ne kerüljön bele hiba elrejtésére. Runtime inline style szükségletét mérni és dokumentálni kell. Nem írunk elő ellenőrizetlen kész CSP stringet.

HTML, SW és verziójelző ne kapjon hosszú immutable cache-t. Hash-elt assetek kaphatnak hosszú cache-t. Publikus source map alapból nincs, fejlesztői artifactként megtartható. A distben ne legyen SHP, backup, report személyes adattal, `.env`, token vagy fejlesztői forrás. A production hálózati ellenőrzés a worker/glyph hívásokat is tartalmazza.

## PWA frissítés és több tab

A frissítési UI a [vite-plugin-pwa prompt módjára](https://vite-pwa-org.netlify.app/guide/prompt-for-update.html) épülhet, de az aktív kör és több tab koordinációja saját alkalmazásfelelősség. Nem használunk általános auto-update reloadot. Frissítés csak home/setup vagy már elolvasott eredmény állapotban, kifejezett műveletre; az eredmény memóriabeli elvesztésére figyelmeztetni kell.

Ha más tabon aktív kör van, a frissítés vár. A régi kliensek cache-ének takarítása nem történhet használat közben. Browser cache eviction után az offline támogatás megszűnhet az új letöltésig; a súgó ezt röviden közli. A telepítés böngészőfüggő, iOS-en kézi kezdőképernyőre helyezési útmutató is kell. Telepítési prompt nem blokkolhatja az első játékot.

## Visszaállítás

A Cloudflare [rollback funkciója](https://developers.cloudflare.com/pages/configuration/rollbacks/) a kiszolgált deploymentet állítja vissza. Ez nem jelenti, hogy a már telepített kliens SW/cache is azonnal visszaáll. Rögzített korábbi artifactot kell megtartani, majd a visszaállított kódot szükség esetén új recovery buildazonosítóval kiadni, hogy a kliens változást érzékeljen. Ne használjunk numerikus „csak nagyobb appverzió lehet frissítés” feltételt; a buildtartalom/hash és kompatibilitás számít.

Próba: A működő build → B új build → visszaállított A-tartalmú recovery build. Online frissítés és offline indulás is működjön. Ezt a T21 E2E-teszt minden CI-futásban ellenőrzi (`0.1.0-recovery-a` build). Aktív kör nem veszhet el automatikus reload miatt. Hibás SW-csapda esetére a súgóban helyreállítási lépések: online oldal újranyitása, frissítés; végső esetben adott oldal helyi adatainak törlése és új letöltés. Ez a nyelv/téma beállítást törölheti, eredményarchívum nincs.

## Adatvédelem és üzemeltetési határ

Az alkalmazás nem kér és nem küld neveket, osztályt, válaszokat vagy eredményt; nincs analitika és hirdetés. A hoszting szolgáltató szokásos hálózati infrastruktúrája ettől független, ezért ne állítsuk, hogy a teljes internetes szolgáltatás semmilyen technikai naplót nem kezel. Nincs appoldali felhasználóprofil vagy követő süti. A preferenciák helyileg törölhetők a böngészőből; külön adatkezelő adminfelület nem szükséges.

## Kiadási ellenőrzőlista

- [ ] Adatforrás/licenc és szükséges forrásmegjelölés igazolt.
- [ ] 27 névpár, geometria és country-unió ellenőrzött.
- [ ] Build/lockfile/runtime reprodukálható, minden CI kapu sikeres.
- [ ] Valódi eszközös ellenőrzések és hiányzó próbák rögzítve.
- [ ] Két nyelv, két téma, minden játékmód, teljes offline kör működik.
- [ ] A→B frissítés, többtabos aktív kör, recovery próba dokumentált.
- [ ] CSP és hálózati audit sikeres, nincs külső szükségtelen hívás.
- [ ] Release record, ismert korlátok és tulajdonosi átvétel elkészült.
- [ ] Publikálás után HTTPS címen smoke megtörtént; URL csak valódi deploy után közölve.

## Fiókok és adatbázis (F2)

Részletes terv: [F2_DESIGN](project/tasks/0003_ONLINE_PLATFORM/phases/F2_DESIGN.md).

- **Felépítés:** a `functions/api/[[path]].ts` Pages Function futtatja a `server/` kódot, csak az `/api/*` címeken (`public/_routes.json`). Az adatbázis Cloudflare D1:
  - `topogok-prod`: a `main` ág deployja használja;
  - `topogok-preview`: minden más ág deployja használja, csak tesztadattal.

  A kötéseket a `wrangler.toml` írja le.
- **Titkok:** a Pages-projektben, környezetenként külön értékkel, *Secret* típussal kell beállítani:
  - `PEPPER`: soha nem változtatható, különben minden jelszó érvénytelenné válik;
  - `SETUP_CODE`.

  „Text” típusú változót a `wrangler.toml` minden deploynál felülír.
- **Séma:** `migrations/NNNN_*.sql`. A CI a feltöltés előtt alkalmazza őket. Minden migrációnak kompatibilisnek kell lennie az éppen futó kóddal, ezért csak bővítő változás jöhet egy lépésben.
- **Első szuperadmin:** a `https://topogok.pages.dev/#/setup` oldalon, az éles `SETUP_CODE` megadásával.
- **Helyreállítás:** GitHub → Actions → *admin-recovery* → Run workflow. A futás összefoglalójában megjelenik egy egyszer használható, 1 óráig érvényes kód. Ezzel a `#/setup` oldalon új jelszót lehet adni. Minden korábbi munkamenet megszűnik.
- **Mentés:**
  - D1 Time Travel: 7 napra visszamenőleg, automatikus. Visszaállítás: `npx wrangler d1 time-travel restore topogok-prod --timestamp=<ISO idő>`.
  - Heti mentés: GitHub → Actions → *backup* (vasárnap 02:17 UTC, vagy kézi indítással). Körforgásban a `topogok-backup-1…4` adatbázisok egyikébe ment, és sorszámokkal ellenőrzi az eredményt. Visszaállítás mentési adatbázisból: `npx wrangler d1 export topogok-backup-N --remote --output b.sql`, majd az éles táblák eldobása után `npx wrangler d1 execute topogok-prod --remote --file b.sql`.

    Visszaállítás után kötelező minden munkamenetet visszavonni: `UPDATE sessions SET revoked_at = <most>`.
- **Helyi futtatás:** a `node scripts/dev/serve.mjs dist 4176 --api` a valódi API-kódot futtatja memóriabeli SQLite-on. A beállítási kód: `local-setup-code-0123456789`.

## Vegyes témák és kattintási puffer (0005)

- Migráció: `0006_app_settings.sql`. A smoke `schema=6`-ot vár.
- A kattintási puffert a szuperadmin a „Beállítások” fülön állítja (érintés 8–48 px, egér 4–30 px). A változás naplózott, és a következő betöltéskor minden felhasználónál érvényes.
- Új vegyes téma: `npm run data:topic -- scripts/data/<téma>/topic.ts`, utána `node scripts/data/gen-server-topics.mjs`, majd a téma felvétele a `src/data/topicRegistry.ts`-be. Lásd: [scripts/data/README.md](../scripts/data/README.md).

## Oldalelhagyási jelzések (F6)

- Migráció: `0005_integrity.sql` (csak oszlopok és a `schema_meta` tábla). A health innentől a `schema_meta.version` értékét adja vissza, a smoke `schema=5`-öt vár.
- A jelzések a lezáró kéréssel érkeznek, nincs új kérés. A szerver összefésüli és összegzi őket, a normalizált lista legfeljebb 200 intervallum.
- Valódi telefonos és asztali próba még nincs (F6-09), lásd [F6_DESIGN.md](project/tasks/0003_ONLINE_PLATFORM/phases/F6_DESIGN.md) 5. pont.

## Toplista és rekord (F5)

- Migráció: `0004_leaderboard.sql`. A smoke `schema=4`-et vár.
- A toplista fiókonként percenként egyszer kérhető le (`users.last_leaderboard_at`). A rekord a téma oldalán 1 olvasás.
- Hogy egy kör toplistás-e, azt a szerver a lekérdezéskor dönti el. Törlés, kizárás, archiválás vagy új időszak után nincs mit újraszámolni.

## Tanári elemkészletek (F4)

- Migráció: `0003_topic_settings.sql`. A smoke `schema=3`-at vár.
- Egy tanári mentés 1 írás. A diák körénél nincs új kérés: a beállítás a `/api/me` válaszban érkezik.

## Körök és tanári eredmények (F3)

- Migráció: `0002_attempts.sql` (új `attempts` tábla, `sessions.last_report_at` oszlop); a CI a deploy előtt alkalmazza, a smoke `schema=2`-t vár a `/api/health` válaszban.
- Új téma vagy adatverzió esetén a `node scripts/data/gen-server-topics.mjs` újragenerálja a `server/topics.generated.ts` fájlt (a szerver ebből ellenőrzi a kérdéseket); a `data:validate` hibát ad, ha elfelejtődik.
- Terhelés: körönként 2 kérés és 2 írás (+1 olvasás a lezáráskor). 100 diák × napi 10 kör ≈ 2 000 kérés és 2 000 írás naponta, jóval az ingyenes keret alatt.
- Törölt kör: csak jelölés (`deleted_at`, `delete_reason`), a sor és a naplóbejegyzés megmarad.
