# Projektállapot

Frissítve: 2026-11-10.

## Aktív tervezés: online és tanári platform

- [0003 specifikáció](tasks/0003_ONLINE_PLATFORM/task.md) és [döntési napló](tasks/0003_ONLINE_PLATFORM/DECISIONS.md): elkészült jóváhagyásra, hat külön fázisspecifikációval.
- Fázisok: F1 hosting; F2 fiókok/osztályok; F3 próbálkozások/tanári panel; F4 tanári elemkészletek; F5 teljes térképes toplista/rekord; F6 oldalelhagyási jelzések.
- A specifikáció a `main`-ben van (PR #1, tulajdonosi jóváhagyással).
- **F1 (online vendégkiadás):** megvalósítva az `f1/online-guest-release` ágon, PR-jóváhagyásra vár. Tartalma: Névjegy oldal törölve, buildazonosító a Súgóban és `version.json`-ban, GitHub Actions kapuk, Cloudflare Pages deploy (main → éles, más ág → preview), HTTP-smoke, A→B→recovery E2E. **Nincs még éles URL:** Cloudflare-fiók és secretek kellenek ([F1_RELEASE](tasks/0003_ONLINE_PLATFORM/phases/F1_RELEASE.md) 4. pont). Nyitott: adatlicenc, valódi telefonos próba.
- A 0001 fennmaradó P10 kiadási munkája F1-ben folytatódik. A helyi MVP és a tektonikai integráció a következő fejlesztés alapja.
- GitHub: a kód 2026-11-10 óta a privát `kinarovK/topogok` repóban van (`main`, teljes előzmény), a helyi checkout `origin` remote-ja erre mutat. Innentől minden változás külön PR-ban, tulajdonosi jóváhagyással kerül a `main`-be.

## Meglévő alkalmazás és korábbi ellenőrzések

- **Második téma:** Ukrajna tektonikai szerkezete (11 egység), témaválasztó főoldallal; részletek: [0002](tasks/0002_TECTONICS_TOPIC/task.md).

- **Implementáció: a helyi MVP működik.** Gyakorlás, számonkérés, térkép (Kijev és Szevasztopol nagyítással; a betéttérképek 2026-11-09-én tulajdonosi döntéssel kikerültek), felfedezés, hu/uk felület, világos/sötét/rendszer téma, offline működés és biztonságos frissítés. A plan.md P01–P09 szakaszai a helyi határig készek, a P10-ből a helyi átadás kész. Részletes bizonyítékok: [átvételi jelentés](../../reports/acceptance.md).
- **Nyilvános kiadás: nem történt.** A repó és a CI kész (F1). Hiányzik: Cloudflare-hozzáférés, igazolt adatforrás és licenc, fizikai Android- és iPhone-próba.
- Adatforrás: a tulajdonos közlése szerint nyílt források alapján, oktatási célra vektorizált adatok. Konkrét forrás és licenc nincs megadva, független ellenőrzés nem történt (`provenance.status = unverified`). A Névjegy oldal tulajdonosi döntéssel kikerült; az állapotot a dokumentáció és a csomag `manifest.json`-ja rögzíti.
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
- Cloudflare-kiadás és a kiadott HTTPS-cím fejlécei (a smoke a deploy után automatikusan fut). A B→A recovery-próba az F1-ben elkészült (T21).
- Ismert korlát: a térképi kitöltőszínek önmagukban 3:1 alatti kontrasztúak; az állapotot körvonal és szöveg jelzi (`reports/contrast.md`).

Következő lépés: az F1 PR tulajdonosi átnézése és merge-e, a Cloudflare-fiók és a secretek beállítása, első éles deploy, telefonos próba. A nyilvános kiadás előtti telefonos próba és adatforrás-ellenőrzés az F1-ben továbbra is szükséges; a fenti korábbi teszteredmények nem az új platform tesztjei.
