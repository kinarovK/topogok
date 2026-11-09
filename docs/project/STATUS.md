# Projektállapot

Frissítve: 2026-11-10.

- **Második téma:** Ukrajna tektonikai szerkezete (11 egység), témaválasztó főoldallal; részletek: [0002](tasks/0002_TECTONICS_TOPIC/task.md).

- **Implementáció: a helyi MVP működik.** Gyakorlás, számonkérés, térkép (Kijev és Szevasztopol nagyítással; a betéttérképek 2026-11-09-én tulajdonosi döntéssel kikerültek), felfedezés, hu/uk felület, világos/sötét/rendszer téma, offline működés és biztonságos frissítés. A plan.md P01–P09 szakaszai a helyi határig készek, a P10-ből a helyi átadás kész. Részletes bizonyítékok: [átvételi jelentés](../../reports/acceptance.md).
- **Nyilvános kiadás: nem történt, és nem is kiadásra kész.** Feltételei: igazolt adatforrás és licenc, fizikai Android- és iPhone-próba, Cloudflare-hozzáférés, távoli repó és CI.
- Adatforrás: a tulajdonos közlése szerint nyílt források alapján, oktatási célra vektorizált adatok. Konkrét forrás és licenc nincs megadva, független ellenőrzés nem történt (`provenance.status = unverified`). Ezt a Névjegy oldal is közli.
- Környezet: a csomagokat a tulajdonos telepítette Windowson (Node 24.18.0, npm 11.16.0); a build és a tesztek Linuxon futnak, Node 22.23.4-gyel (OPERATIONS „Megvalósított helyi környezet”).
- Helyi Git: külön repó a Topo gyökerében, `main` ág; remote nincs.

## Ténylegesen elvégzett ellenőrzések

| Ellenőrzés | Eredmény |
|---|---|
| `npm run lint`, `npm run typecheck` | PASS |
| `npm test` (szabályok, óra, jegy, adat, szótár, beállítások, találat) | 32/32 PASS |
| `npm run data:build` / `data:validate` | 13/13 PASS / bájtra azonos |
| `npm run build` (precache- és tiltottfájl-kapuval) | PASS |
| `npm run test:e2e` (Chromium, mobil nézet, CSP-vel) | 24/24 PASS (2026-11-10, `reports/e2e-results.txt`) |
| Teljesítmény (4× CPU, 1,6 Mbit/s, 150 ms) | főoldal 2,5 s, térkép 1,1 s, p95 kattintás ≤ 113 ms, főoldali átvitel 384 KiB |

## Nem elvégzett / nyitott

- Fizikai Android Chrome és iPhone Safari próba (telepítés, pinch, képernyőzár, repülő üzemmód).
- WebKit és Firefox automatikus futtatás (a környezetben csak Chromium volt).
- GDAL-keresztellenőrzés (parancs: `scripts/data/README.md`).
- Anyanyelvi lektorálás (hu, uk).
- B→A recovery-kiadás próbája, Cloudflare-kiadás, kiadott HTTPS-cím fejlécei.
- Ismert korlát: a térképi kitöltőszínek önmagukban 3:1 alatti kontrasztúak; az állapotot körvonal és szöveg jelzi (`reports/contrast.md`).

Következő lépés: a tulajdonosi átvételi próba a TEST_PLAN „Tanári átvételi próba” szerint, valódi telefonon; utána az adatlicenc tisztázása a kiadás előtt.
