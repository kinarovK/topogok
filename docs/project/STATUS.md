# Projektállapot

Frissítve: 2026-11-12.

## Aktív tervezés: online és tanári platform

- [0003 specifikáció](tasks/0003_ONLINE_PLATFORM/task.md) és [döntési napló](tasks/0003_ONLINE_PLATFORM/DECISIONS.md): elkészült jóváhagyásra, hat külön fázisspecifikációval.
- Fázisok: F1 hosting; F2 fiókok/osztályok; F3 próbálkozások/tanári panel; F4 tanári elemkészletek; F5 teljes térképes toplista/rekord; F6 oldalelhagyási jelzések.
- A specifikáció a `main`-ben van (PR #1, tulajdonosi jóváhagyással).
- **F3 (körök mentése, tanári eredmények):** megvalósítva, PR-jóváhagyásra vár. Körönként két kérés (indítás, lezárás), a szerver a játékszabályok kódjával újrajátssza a kört; tanári „Eredmények” fül. Részletek: [F3_DESIGN](tasks/0003_ONLINE_PLATFORM/phases/F3_DESIGN.md) 11.
- **F2 (fiókok és jogosultságok):** kiadva. Cloudflare D1 (külön éles és preview adatbázis), belépés, tanári és szuperadmin felület, napló, helyreállítás, heti mentés. Részletek: [F2_DESIGN](tasks/0003_ONLINE_PLATFORM/phases/F2_DESIGN.md) 13a.
- **F1 (online vendégkiadás): kiadva 2026-11-11.** Éles: https://topogok.pages.dev (`main`). Minden más ág a saját `<ág>.topogok.pages.dev` preview-címére kerül. Tartalma: Névjegy oldal törölve, buildazonosító a Súgóban és a `version.json`-ban, GitHub Actions kapuk, Cloudflare Pages deploy, HTTP-smoke az éles címen, A→B→recovery E2E. Részletek: [F1_RELEASE](tasks/0003_ONLINE_PLATFORM/phases/F1_RELEASE.md). Nyitott: a tankönyv felhasználási engedélye, rövid telefonos ellenőrzés az éles címen.
- A 0001 fennmaradó P10 kiadási munkája F1-ben folytatódik. A helyi MVP és a tektonikai integráció a következő fejlesztés alapja.
- GitHub: a kód 2026-11-10 óta a privát `kinarovK/topogok` repóban van (`main`, teljes előzmény), a helyi checkout `origin` remote-ja erre mutat. Innentől minden változás külön PR-ban, tulajdonosi jóváhagyással kerül a `main`-be.

## Meglévő alkalmazás és korábbi ellenőrzések

- **Harmadik téma (2026-11-11, PR-jóváhagyásra vár):** Kontinensek topója: 6 kontinens és 5 óceán Robinson-vetületű világtérképen, Natural Earth (közkincs) alapon; részletek: [0004](tasks/0004_CONTINENTS_TOPIC/task.md).
- **Második téma:** Ukrajna tektonikai szerkezete (11 egység), témaválasztó főoldallal; részletek: [0002](tasks/0002_TECTONICS_TOPIC/task.md).

- **Implementáció: a helyi MVP működik.** Gyakorlás, számonkérés, térkép (Kijev és Szevasztopol nagyítással; a betéttérképek 2026-11-09-én tulajdonosi döntéssel kikerültek), felfedezés, hu/uk felület, világos/sötét/rendszer téma, offline működés és biztonságos frissítés. A plan.md P01–P09 szakaszai a helyi határig készek, a P10-ből a helyi átadás kész. Részletes bizonyítékok: [átvételi jelentés](../../reports/acceptance.md).
- **Nyilvános kiadás: megtörtént** (F1, https://topogok.pages.dev). A forrás rögzítve van; a licenc nincs igazolva, a kiadás a tulajdonos kockázatvállalásával történt.
- Adatforrás (2026-11-10): mindkét téma a Гільберг–Довгань–Савчук: Географія 8 (Генеза, 2025) tankönyv térképeiről készült (DATA_CONTRACT, `provenance.source`). Licenc vagy felhasználási engedély nincs rögzítve, a tankönyv szerzői jogi védelem alatt áll (`provenance.status = unverified`).
- Telefonos próba: a tulajdonos 2026-11-10-i közlése szerint telefonon minden rendben működött (a kiadás előtti buildön). A kiadott HTTPS-címen egy rövid ismétlés szükséges. A Névjegy oldal tulajdonosi döntéssel kikerült; az állapotot a dokumentáció és a csomag `manifest.json`-ja rögzíti.
- Környezet: a csomagokat a tulajdonos telepítette Windowson (Node 24.18.0, npm 11.16.0); a build és a tesztek Linuxon futnak, Node 22.23.4-gyel (OPERATIONS „Megvalósított helyi környezet”).
- Git: a helyi repó `origin` remote-ja a privát `kinarovK/topogok`.

## Ténylegesen elvégzett ellenőrzések

| Ellenőrzés | Eredmény |
|---|---|
| `npm run lint`, `npm run typecheck` | PASS |
| `npm test` (szabályok, óra, jegy, adat, szótár, beállítások, találat) | 32/32 PASS |
| `npm run data:build` / `data:validate` | 13/13 PASS / bájtra azonos |
| `npm run build` (precache- és tiltottfájl-kapuval) | PASS |
| `npm run test:e2e` (Chromium, mobil nézet, CSP-vel) | 24/24 PASS (2026-11-10, F1 ág, recovery-próbával; `reports/e2e-results.txt`) |
| `scripts/release/smoke.mjs` a helyben kiszolgált buildre | PASS |
| Teljesítmény (4× CPU, 1,6 Mbit/s, 150 ms) | főoldal 2,5 s, térkép 1,1 s, p95 kattintás ≤ 113 ms, főoldali átvitel 384 KiB |

## Nem elvégzett / nyitott

- Fizikai Android Chrome és iPhone Safari próba (telepítés, pinch, képernyőzár, repülő üzemmód).
- WebKit és Firefox automatikus futtatás (a környezetben csak Chromium volt).
- GDAL-keresztellenőrzés (parancs: `scripts/data/README.md`).
- Anyanyelvi lektorálás (hu, uk).
- A Cloudflare-kiadás, a HTTPS-cím fejlécei és a B→A recovery-próba (T21) az F1-ben elkészült.
- Ismert korlát: a térképi kitöltőszínek önmagukban 3:1 alatti kontrasztúak; az állapotot körvonal és szöveg jelzi (`reports/contrast.md`).

Következő lépés: rövid telefonos ellenőrzés az éles címen, majd az F2 (fiókok és jogosultságok) design- és tervdokumentuma külön tulajdonosi jóváhagyásra.
