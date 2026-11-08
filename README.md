# TopoGok

Magyar és ukrán nyelvű, mobilon és számítógépen használható térképes gyakorló és számonkérő webalkalmazás terve. Első tartalma Ukrajna 27 első szintű közigazgatási egysége.

**Állapot (2026-11-08): működő helyi MVP.** A gyakorlás, a számonkérés, a térkép a két betéttel, a felfedező nézet, a két nyelv, a két téma, az offline működés és a biztonságos frissítés elkészült, és automatikus tesztek ellenőrzik. Nyilvános kiadás nem történt; az adatforrás és a licenc ellenőrzése, valamint a valódi telefonos próba még hátravan. Részletek: [STATUS](docs/project/STATUS.md), [átvételi jelentés](reports/acceptance.md).

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

Előfeltétel: Node.js ≥ 22.18 (fejlesztve: 22.23.4 Linuxon, a csomagtelepítés 24.18.0-s Node-dal és 11.16.0-s npm-mel készült Windowson). Telepítés: `npm ci` (a `package-lock.json` alapján).

| Parancs | Mit csinál |
|---|---|
| `npm run dev` | fejlesztői szerver (Vite); service worker nélkül |
| `npm run build` | típusellenőrzés, produkciós build a `dist/` mappába, majd a precache-lista és a tiltott fájlok ellenőrzése |
| `npm run serve:dist` | a `dist/` kiszolgálása a `_headers` fejlécekkel (CSP is) a http://127.0.0.1:4173/ címen; offline és frissítés próbájához ezt használd |
| `npm run preview` | a Vite saját előnézeti szervere ugyanerre a portra (fejlécek nélkül) |
| `npm run lint` / `npm run typecheck` | ESLint, strict TypeScript |
| `npm test` | egységtesztek (`node:test`): játékszabályok, óra, jegy, adatbetöltő, hibás bemenetek, szótárak, beállítások, találati logika |
| `npm run data:build` / `npm run data:validate` | SHP → validált GeoJSON-csomag / bájtos újragenerálási ellenőrzés |
| `npm run build:e2e` | a teszteléshez használt build (`dist-e2e/`), amely egy csak vetítést adó térképhorgot tartalmaz; kiadásra nem való |
| `npm run test:e2e` | Playwright-tesztek a két buildre (előtte `npm run build` és `npm run build:e2e`; a böngészőt `npx playwright install chromium` telepíti) |
| `npm run check` | lint, típus, egységteszt, adatellenőrzés és build egyben |

Helyi indítás Windowson: `npm run build`, majd `npm run serve:dist`, és nyisd meg a http://127.0.0.1:4173/ címet. Ha a telefonról is el akarod érni ugyanazon a hálózaton: PowerShellben `$env:HOST="0.0.0.0"; npm run serve:dist`, majd a gép IP-címével. A service worker és az offline mód csak `localhost`/`127.0.0.1` vagy HTTPS alatt működik, LAN-IP-n nem.

Megosztott környezet (Windows-telepítés, Linux-build): ha a Linux-oldalon nincs npm-registry, a `npm run setup:linux-binaries` a lockfile alapján letölti a Linux x64 natív csomagokat a `.linux-binaries/` mappába. Ez fejlesztői segédlet, a futtatáshoz nem kell.
