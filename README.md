# TopoGok

Magyar és ukrán nyelvű, mobilon és számítógépen használható térképes gyakorló és számonkérő webalkalmazás terve. Első tartalma Ukrajna 27 első szintű közigazgatási egysége.

**Állapot (2026-11-05): a megvalósítás folyamatban, futtatható alkalmazás még nincs.** Kész a validált adatcsomag és a tiszta játékszabályok egységtesztekkel. A felület, a térkép és a PWA még nem készült el, mert a munkakörnyezetben nem volt npm-registry. Részletek: [STATUS](docs/project/STATUS.md).

## Belépési pont a megvalósító agentnek

Először olvasd el az [AGENT_HANDOFF.md](docs/AGENT_HANDOFF.md) fájlt. A teljes dokumentáció olvasási sorrendje:

1. [Termékleírás](docs/PRODUCT.md): cél, célközönség, első kiadás határai.
2. [Követelményspecifikáció](docs/project/tasks/0001_TOPOGOK_MVP/task.md): ellenőrizhető követelmények és elfogadási feltételek.
3. [Értékelési szabályok](docs/ASSESSMENT_MODEL.md): gyakorlás, ismétlés, számonkérés, időzítés.
4. [Stílus- és felületterv](docs/STYLE_GUIDE.md): képernyők, megjelenés, interakciók.
5. [Adatszerződés](docs/DATA_CONTRACT.md) és [lokalizáció](docs/LOCALIZATION.md).
6. [Műszaki design](docs/project/tasks/0001_TOPOGOK_MVP/design.md) és [architekturális döntések](docs/adr/0001-static-pwa.md).
7. [Megvalósítási terv](docs/project/tasks/0001_TOPOGOK_MVP/plan.md).
8. [Ellenőrzési terv](docs/TEST_PLAN.md) és [kiadási terv](docs/OPERATIONS.md).

## Meglévő fájlok

- `shp/ukraine_country_boundary.*`: országhatár, háttérréteg.
- `shp/ukraine_oblasts.*`: 27 közigazgatási egység, magyar és ukrán nevekkel.
- `backups/`: a korábbi lokalizáció előtti helyi mentés; nem alkalmazásadat és nem publikálandó.

A shapefile egy fájlcsoport: az azonos nevű `.shp`, `.shx`, `.dbf`, `.prj` és ahol van, `.cpg` együtt kezelendő. A forrásokat nem szabad helyben felülírni a webes előfeldolgozás során.

## Fontos korlátok

Nincs backend, bejelentkezés, személyes adat, eredménymentés, export, ranglista vagy követés. A számonkérés tanári felügyelet mellett használható; a böngészőben számolt eredmény nem hitelesített bizonyíték. Az adatfájlok helye ismert, az eredeti adatkiadó és a terjesztési licenc még nem igazolt. Ennek rendezése a nyilvános kiadás feltétele, a helyi fejlesztést nem akadályozza.

## Fejlesztői parancsok

Előfeltétel: Node.js ≥ 22.18 (a `.nvmrc` szerint 22.23.4). A jelenlegi parancsok nem igényelnek telepített csomagot:

| Parancs | Mit csinál |
|---|---|
| `npm run data:build` | SHP → validált GeoJSON-csomag és `reports/data-validation.*`; a forrásokat nem írja felül |
| `npm run data:validate` | újragenerálás ideiglenesen, bájtos összevetés a commitolt csomaggal |
| `npm test` | egységtesztek (`node:test`): játékszabályok, óra, jegy, adatbetöltő, szótárak, beállítások |
| `npm run typecheck` | strict TypeScript-ellenőrzés (TypeScript kell hozzá: globálisan vagy később devDependencyként) |

A `dev`, `build`, `preview`, `lint`, `test:e2e` parancsok a Vite/MapLibre/PWA függőségekkel együtt készülnek el (plan.md P01, P08–P09).
