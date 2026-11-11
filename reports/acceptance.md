# Átvételi jelentés – TopoGok MVP (helyi)

Dátum: 2026-11-09. Appverzió: 0.1.0. Adatverzió: 2026.11.05.1.

Környezet:
- Automatikus tesztek: Linux x64, Node 22.23.4, Playwright 1.63.0, Chromium headless (Playwright 1.63 csomag), szoftveres WebGL (SwiftShader). Mobil nézet: Pixel 7 emuláció, 390×844, DPR 2.
- Kiszolgálás: `scripts/dev/serve.mjs`, a `public/_headers` CSP-jével, gzip-pel.
- Csomagtelepítés: a tulajdonos Windows-gépén, Node 24.18.0 és npm 11.16.0.

**Eredményjelölés:** PASS = ténylegesen lefutott és sikeres; NOT RUN = nem végeztük el. Emulált böngésző nem számít fizikai eszközös próbának.

## Automatikus ellenőrzések

| Ellenőrzés | Parancs | Eredmény |
|---|---|---|
| Lint | `npm run lint` | PASS, 0 hiba |
| Strict típusellenőrzés | `npm run typecheck` | PASS |
| Egységtesztek | `npm test` | PASS, 32/32 |
| Adatpipeline + reprodukálhatóság | `npm run data:build`, `npm run data:validate` | PASS, 13/13 ellenőrzés; bájtra azonos |
| Produkciós build + precache-kapu | `npm run build` | PASS; 18 fájl, mind precache-ben (az SW-fájlok és a `_headers` kivételével), nincs tiltott fájl |
| E2E (Playwright) | `npm run test:e2e` | 24/24 PASS (2026-11-10, `reports/e2e-results.txt`) |
| Teljesítmény | `node scripts/dev/measure.mjs 5` | PASS, ld. lent |
| Kontraszt | számítás, `reports/contrast.md` | szöveg ≥ 5,88:1; állapot-körvonal ≥ 4,41:1; kitöltések önmagukban < 3:1 (körvonal és szöveg kompenzál) |

## Követelmények

| AC | Bizonyíték | Eredmény |
|---|---|---|
| 01 | Főoldalról mindkét mód indul regisztráció nélkül (E2E: minden játékteszt) | PASS |
| 02 | 27 ID, hu/uk név, országháttér (pipeline, T12 egységteszt, explore E2E) | PASS |
| 03 | 5/12/27 kérdés, ismétlés nélküli sorsolás (T01; E2E 5/12/27 kör) | PASS |
| 04 | Poligonválasztás, minden nagyításon ugyanaz az ID, a kívülkattintás nem válasz (T13/T14, E2E 27/27, a két város ránagyítva) | PASS |
| 05–06 | 100/60/30/0, rejtett megoldás az első két hibánál, ugyanaz a hibás ID nem adható be újra, megmutatás, egyszeri ismétlés (T02–T05, E2E vegyes kör) | PASS |
| 07 | Felfedezés címkékkel; vizsgában nincs címke és megmutatás (explore E2E) | PASS |
| 08 | Módosítható kijelölés, külön véglegesítés, nincs visszalépés és kihagyás, azonos UI jó és rossz válasz után (T06, E2E) | PASS |
| 09–10 | Időkorlát; határidőn beadás = lejárat; kettős lezárás kizárva; háttérből visszatérés; időtartam = limit (T08–T10, E2E 5 perces lejárat) | PASS |
| 11 | Eredménymutatók, jegyképlet, 26/27 → 12 (T07, E2E) | PASS |
| 12 | Újrakezdés/kilépés megerősítéssel, Escape = folytatás, frissítés után főoldal (E2E) | PASS |
| 13 | Zoom, pan, alapnézet; Kijev és Szevasztopol ránagyítva (E2E). A betéttérkép-követelményt a tulajdonos 2026-11-09-én törölte. | PASS |
| 14 | Egész ország, nincs külső kérés (minden E2E hálózati auditja) | PASS |
| 15 | Teljes hu/uk felület, böngészőnyelv-felismerés, kör közbeni váltás (T15, T16 E2E) | PASS; anyanyelvi lektorálás nem történt |
| 16 | Világos/sötét/rendszer téma, csak a beállítás tárolódik, tárolási hiba nem akadályoz (T17, E2E tárolóellenőrzés) | PASS |
| 17 | 320×568, 390×844, 844×390, 768×1024, 1366×768: nincs vízszintes görgetés, a fő gomb nincs letakarva (visual E2E) | PASS emulációban; valódi eszköz NOT RUN |
| 18 | Billentyűzetes vezérlők, látható fókusz, dialógus fókuszcsapda, szöveges visszajelzés | PASS részben (dialógus E2E); teljes billentyűzetes bejárás és képernyőolvasós próba NOT RUN |
| 19 | Offline teljes kör mindkét nyelven és témában, valós cache-találat alapú jelzés (T19, T20) | PASS (Chromium) |
| 20 | A→B frissítés aktív körrel és második lappal, majd A-tartalmú recovery build és offline indulás (T21) | PASS (Chromium) |
| 21 | Nincs backend, auth, tárolt eredmény (tárolóellenőrzés, kódáttekintés) | PASS |
| 22 | Reprodukálható pipeline, a források változatlanok, hibás bemenet elutasítva | PASS; GDAL-keresztellenőrzés NOT RUN |
| 23 | Git, lockfile, runtime, parancsok, CI | PASS; CI: GitHub Actions (F1), első távoli futás eredménye a PR-ban |
| 24 | Cloudflare-kiadás, fejlécek, telepítés | `_headers` kész és helyben CSP-vel tesztelve; deploy-folyamat kész (F1), Cloudflare-kiadás NOT RUN (fiók még nincs); adatlicenc nem igazolt |
| 25 | Ez a jelentés | PASS |

## Teljesítmény (TEST_PLAN szerinti körülmények, 5 futás mediánja)

Körülmények: produkciós build, hideg cache, 390×844, 4× CPU-lassítás, 1,6 Mbit/s, 150 ms RTT, gzip.

| Mérőszám | Cél | Mért |
|---|---:|---:|
| Interaktív főoldal | ≤ 4 s | 2,5 s |
| Választható térkép az indítás után | ≤ 3 s | 1,1 s |
| Kattintástól a kijelölésig, p95 (30 kattintás) | ≤ 150 ms | 113 ms (felső becslés, a Playwright körülfordulási idejével együtt) |
| Főoldali átvitel | ≤ 750 KiB | 384 KiB |
| Teljes offline csomag tömörítve | ≤ 5 MiB | ≈ 876 KiB (statikus gzip-összeg) |
| Offline-kész állapot elérése | – | 6,1 s |

A mérés szoftveres WebGL-lel, konténerben futott; valódi telefonon más lehet az eredmény.

## Képernyőképek

`reports/screenshots/`: 4 kombináció (hu/uk × világos/sötét) × főoldal, gyakorló hiba, gyakorló helyes válasz, számonkérés, számonkérés eredménye. Emellett 320×568, 844×390 (fekvő), 768×1024 és 1366×768 nézet, valamint felfedezés és súgó (a Névjegy oldal 2026-11-10-én kikerült).

## Független kódátnézés

Egy külön agent a specifikáció alapján átnézte a megvalósítást, a fejlesztés menetének ismerete nélkül. Blokkoló hibát nem talált. A frissítési folyamatban három hibát jelzett, ezeket javítottuk:
1. Ha a frissítést ez a lap kérte, de közben kör indult, a lap újratöltődhetett. Most körben soha nem töltődik újra, a frissítés vár.
2. Egy válaszolni nem tudó (háttérbe tett) lap tétlennek számított. Most a legutóbb „foglalt” állapotot jelző, de nem válaszoló lap foglaltnak számít.
3. Az eredményoldalról kért frissítésnél egy elavult állapot tévesen foglaltnak hagyhatta a lapot. Most az aktivitás (`idle`/`round`/`result`) és az eredmény eldobása külön paraméter.

Két javaslatát is beépítettük: dupla kattintással nem lehet átugrani a visszajelzést (E2E-teszt is van rá), és az időzítő képernyőolvasós címkéje nem takarja el az időt. Nem módosítottuk, csak dokumentáljuk: ha egy kör közben a térkép renderelése hibára fut, a kör megszakad, és az újrapróbálás új sorsolással indul.

## Javítások a tulajdonosi visszajelzés után (2026-11-09)

- A Kijev/Szevasztopol betéttérképek a tulajdonos döntésére kikerültek. A két kis egység nagyítással választható; az E2E-teszt egérgörgős nagyítás után jelöli ki őket.
- Az E2E-tesztek közben előkerült egy valódi hiba: mobilon, ukrán nyelven a térkép alján lévő „Початковий вигляд” gomb éppen Szevasztopolt takarta, így ott se nagyítani, se kijelölni nem lehetett. A vezérlők a térkép jobb szélére, egymás alá kerültek, ikonos formában, szöveges címkével. Az alapnézet kihagyja a sávjukat. Mind az 5 vizsgált képernyőméreten teszt ellenőrzi, hogy a vezérlők nem takarnak országrészt.

## Második téma (2026-11-10)

Tektonikai téma 11 egységgel, témaválasztó főoldallal. Új E2E-tesztek:
- gyakorlás mind a 11 egységgel;
- a szürke háttérterület nem válasz;
- csak az 5 és a Mindegyik (11) kérdésszám jelenik meg;
- ukrán nyelvű számonkérés;
- offline kör.

Képernyőképek: `reports/screenshots/tectonics-*.png`, `hu-light-00-topics.png`. Az adatok validációja: `reports/tectonics-validation.json`.

## Harmadik téma (2026-11-11)

Kontinensek topója, 6 kontinens és 5 óceán ([0004](../docs/project/tasks/0004_CONTINENTS_TOPIC/task.md)). Új E2E-tesztek:
- mind a 11 egység kijelölhető;
- az óceáni szigetek és a Kaszpi-tenger nem válasz;
- ukrán nyelvű számonkérés.

Az E2E összesen 27/27 PASS. Adatellenőrzés: `reports/world-validation.json`.

## Nem elvégzett próbák

- Fizikai Android Chrome és iPhone Safari: telepítés, pinch, képernyőzár, repülő üzemmód, Safe Area. Ezeket nem végeztük el, és emulációval nem helyettesíthetők.
- WebKit és Firefox: a környezetben csak Chromium volt telepítve.
- Cloudflare-kiadás és a kiadott HTTPS-cím fejléceinek ellenőrzése (a recovery-próba 2026-11-10 óta PASS).
- GDAL/GEOS-os geometria-keresztellenőrzés.
- Anyanyelvi lektorálás.
- Adatforrás: 2026-11-10 óta rögzítve (Гільберг–Довгань–Савчук: Географія 8, Генеза, 2025; DATA_CONTRACT). Licenc vagy engedély nincs.
- Telefonos próba: a tulajdonos közlése szerint 2026-11-10-én rendben volt. Nem általunk végzett, dokumentált eszközös próba.
