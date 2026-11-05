# TopoGok – megvalósítási terv

**A végrehajtás 2026-11-05-én a tulajdonos utasítására elkezdődött; az állapotot a lenti napló mutatja.** Ez végrehajtási terv, nem készre jelentés. Minden szakasz után a tényleges parancsot, kimeneti összefoglalót, commitot (ha van), eltérést és hátralévő hibát rögzíteni kell.

## Sorrend

P01 → P02 → P03 → P04 → P05 → P06 → P07 → P08 → P09 → P10. A domain egységtesztekhez nem kell kész térkép, de az integrált játéknak valid adat és működő renderer kell. Publikálás csak a végén, rendezett adatlicenccel és hozzáféréssel.

### P01 – Projektalap

- Fájlok: `package.json`, lockfile, runtime-verziófájl, `tsconfig*`, `vite.config.ts`, lint config, `src/app`, `.gitignore`, README fejlesztői része.
- Feladat: kompatibilis stabil stack kiválasztása; külön meglévő Topo Git-repó használata; React/TS strict/Vite alap és tesztfuttató. Ne inicializálj repót a teljes Suli fölött.
- AC: 01, 23.
- Kész: minimális helyi shell indul és produkciós build készül; nincs backend vagy mintaapp-maradvány.
- Ellenőrzés: tiszta install, typecheck, lint, build; runtime és függőségverziók dokumentálva.

### P02 – GIS pipeline és adatszerződés

- Fájlok: `scripts/data/*`, `public/data/ukraine-administration/*`, `src/data/validation.ts`, `reports/data-validation.*`, forrásmetaadat.
- Feladat: a DATA_CONTRACT minden lépése; eredeti SHP változatlan; 27 ID/névpár, országmetaadat tisztítás, geometriavalidáció, manifest/hash.
- AC: 02, 14, 22.
- Kész: reprodukálható csomag és tényleges validációs jelentés. Licencállapot őszintén jelölve, nem kitalálva.
- Ellenőrzés: ismételt export byte-egyezés; source hash előtte/utána; sérült/hiányos tesztinput elutasítás; vizuális teljesország/kisváros kontroll.

### P03 – Domain és óra

- Fájlok: `src/domain/*`, `tests/unit/{shuffle,scoring,reducer,clock,config}.*`.
- Feladat: diszkriminált config, kérdéskiválasztás, practice/review, assessment, időlejárat és idempotens lezárás.
- AC: 03, 05–12.
- Kész: tiszta függvényekkel a teljes játékszabály működik, DOM és MapLibre nélkül.
- Ellenőrzés: 100/60/30/0; egyszeri ismétlés; 5/12/27 határok; 26/27→12; timeout/final-answer verseny; dupla confirm; óravisszaállás; későn érkező események.

### P04 – Kétnyelvű shell és megjelenés

- Fájlok: `src/i18n/*`, `src/preferences/*`, `src/styles/*`, `src/components/*`, Home/Setup/Help/About.
- Feladat: teljes hu/uk kulcsrendszer, locale/téma priorítás, localStorage fallback, világos és sötét tokenek, mobil layout, közös dialógusok.
- AC: 01, 15–18, 21.
- Kész: főoldal és beállítás mindkét nyelven/témában működik; nincs személyes adatot kérő elem.
- Ellenőrzés: kulcsegyezés, uk-UA/hu-HU/en-US detektálás, sérült/telített tároló, 320px és hosszú ukrán felirat, billentyűzet/fókusz.

### P05 – Térkép és felfedezés

- Fájlok: `src/map/*`, `src/data/loadTopic.ts`, `src/features/explore/*`.
- Feladat: saját országhatár és kérdésréteg, választás, zoom/pan/reset, két elérhető betét, közös kiválasztás, offline címkék.
- AC: 02, 04, 07, 13–14.
- Kész: mind a 27 ID kiválasztható; Kijev és Szevasztopol kényelmesen; nincs külső kérés vagy megoldásfüggő találat.
- Ellenőrzés: 27 kontrollpont, polygon holes/kívülkattintás, két térkép szinkron, pinch utáni téves click elkerülése, resize, WebGL hibakép, network audit.

### P06 – Gyakorlás végigjátszható szelet

- Fájlok: GameScreen, QuestionPanel, Feedback, PracticeResult integráció.
- Feladat: véglegesítés, három próbálkozás, mutasd meg, következő, ismétlés, eredmény, újrakezdés és kilépés.
- AC: 03–07, 11–12, 15–18.
- Kész: 5 kérdéses vegyes helyes/hibás kör és egyszeri ismétlés működik mindkét nyelven.
- Ellenőrzés: pontok nem módosulnak review miatt; első két hiba nem fedi fel a helyest; duplázott click nem fogyaszt többlet kísérletet; nincs mentett eredmény.

### P07 – Számonkérés végigjátszható szelet

- Fájlok: Assessment setup/game/result, timer hook, aktív kör navigációja.
- Feladat: egyszeri válasz, visszajelzés nélkül; határidő; automatikus beadás; négy eredménymutató; bármikori újrakezdés.
- AC: 08–12, 21.
- Kész: 5/12/27 kérdés és minden időbeállítás szabályosan számol, háttérbe váltás után is.
- Ellenőrzés: timer fake-clock és valós UI; sem vizuális, sem aria megoldásszivárgás; nem véglegesített kijelölés lejáratkor hibás; reload adatvesztés; nincs visszalépés.

### P08 – PWA, offline, frissítés

- Fájlok: PWA config, app manifest, ikonok, `src/pwa/*`, produkciós E2E fixture két buildhez.
- Feladat: teljes precache, lokális worker, offline-ready jelzés, telepítési súgó, frissítés késleltetése és többtabos koordináció.
- AC: 19–20, 24.
- Kész: egyszer letöltött teljes app repülő módban végig működik; új kiadás nem szakít meg kört.
- Ellenőrzés: hideg offline vs betöltött offline, cache-törlés, részleges install hiba, A→B és B→A kiadás, több tab aktív körrel, mindkét nyelv/téma offline.

### P09 – Minőség, CI és teljes regresszió

- Fájlok: `tests/integration/*`, `tests/e2e/*`, CI workflow, `reports/*`, mérési script.
- Feladat: TEST_PLAN mátrix; bundle méret, teljesítmény, kontraszt, CSP, rejtett hálózati kérések; lint/type/unit/data/build/E2E pipeline.
- AC: 17–18, 21–25 és minden funkcionális AC regressziója.
- Kész: tényleges tesztjelentés és képernyőképek; kimaradt valódi eszköztesztek jelölve; nincs kritikus működési hiba.
- Ellenőrzés: dokumentált parancsok tiszta checkoutból; minden AC-hoz bizonyíték vagy egyértelmű nyitott státusz.

### P10 – Átadás és kiadás

- Fájlok: README, OPERATIONS, release notes, végső ellenőrzési jelentés.
- Feladat: tulajdonosi próba; adatforrás/licenc rendezése; szükséges Git/Cloudflare hozzáférés esetén kiadás előkészítése és engedélyezett publikálás.
- AC: 23–25.
- Kész: reprodukálható build átadva, ismert korlátok és rollback leírva. Ha külső hozzáférés hiányzik, a helyi átadás kész lehet, a publikálás nem jelenthető késznek.
- Ellenőrzés: kiadott HTTPS címen smoke, response headers, telepítés/offline, előző kiadás visszaállítási próba kontrollált környezetben.

## Elvárt fejlesztői parancsfelület

Ezek még nem létező, implementálandó parancsok: `npm run dev`, `lint`, `typecheck`, `test`, `test:integration`, `test:e2e`, `data:build`, `data:validate`, `build`, `preview`. A `test` egyszer lefutó CI-kompatibilis mód legyen; watch külön kapcsolóval. A data:build GDAL előfeltételt közérthetően jelzi. Az appbuild nem követel QGIS-t a frontend futtatásához, ha a validált csomag már megvan.

CI-szolgáltató a későbbi távoli repótól függ; most ne hozz létre külső accountot. A pipeline lépései szolgáltatófüggetlenek. Cloudflare production deploy csak sikeres ellenőrzésből képzett artifactból, ne fusson párhuzamos, teszteket megkerülő automatikus main deploy.

## Végrehajtási napló

| Szakasz | Állapot | Bizonyíték, eltérés, hátralévő munka |
|---|---|---|
| P01 | Blokkolt, részben előkészítve | `package.json` (függőség nélküli szkriptek), `.nvmrc` (Node 22.23.4), strict `tsconfig.json`. A Vite/React/MapLibre/PWA/lint függőségek és a lockfile hiányoznak: a környezetben az npm-registry 403-at adott. Hátra: függőségek kiválasztása a hivatalos dokumentáció alapján, `npm install`, lockfile, Vite shell, lint. |
| P02 | Kész, egy nyitott ellenőrzéssel | `npm run data:build`: 13/13 PASS; `npm run data:validate`: bájtra azonos; 4 hibásbemenet-teszt (hiányzó `.prj`, üres `name_uk`, NaN koordináta, hibás geometria), mind elutasítva. Eltérés: GDAL/GEOS helyett függőség nélküli validátor (DATA_CONTRACT „Megvalósított pipeline”). Hátra: GDAL-keresztellenőrzés a tulajdonos gépén; a teljes ország és a kis városok vizuális ellenőrzése a térképes szakaszban. |
| P03 | Kész | `src/domain/*`, `tests/unit/domain.test.ts`: T01–T10 esetek, köztük 100/60/30/0, egyszeri ismétlés, 360/500, 26/27→12, határidőn beadás → timeout, dupla confirm, végső válasz és timeout versenye, órafelállítás. `npm test` 29/29 PASS. |
| P04 | Részben | Kész: `src/i18n/{hu,uk}.json` (azonos kulcs- és paraméterhalmaz, teszt), `translator.ts` (fallback, locale-detektálás, számformázás), `preferencesStore.ts` (sérült/tiltott tároló, egy kulcs). Hátra: komponensek, képernyők, témák, reszponzív elrendezés (npm-függő). |
| P05–P10 | Nincs megkezdve | npm-hozzáférésre vár (MapLibre, Vite, PWA plugin, Playwright projektfüggőség). Futásidejű adatbetöltő és -validátor már kész (`src/data/validation.ts`, T12/T24 tesztek). |

A dokumentáció készítésekor elvégzett forrásattribútum-olvasás nem helyettesíti P02 geometriavalidációját. A puszta repóinicializálás nem jelenti P01 teljesülését.
