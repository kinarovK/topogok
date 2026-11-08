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
| Egységtesztek | `npm test` | PASS, 31/31 |
| Adatpipeline + reprodukálhatóság | `npm run data:build`, `npm run data:validate` | PASS, 13/13 ellenőrzés; bájtra azonos |
| Produkciós build + precache-kapu | `npm run build` | PASS; 18 fájl, mind precache-ben (az SW-fájlok és a `_headers` kivételével), nincs tiltott fájl |
| E2E (Playwright) | `npm run test:e2e` | 21/21 PASS (2026-11-09, `reports/e2e-results.txt`) |
| Teljesítmény | `node scripts/dev/measure.mjs 5` | PASS, ld. lent |
| Kontraszt | számítás, `reports/contrast.md` | szöveg ≥ 5,88:1; állapot-körvonal ≥ 4,41:1; kitöltések önmagukban < 3:1 (körvonal és szöveg kompenzál) |

## Követelmények

| AC | Bizonyíték | Eredmény |
|---|---|---|
| 01 | Főoldalról mindkét mód indul regisztráció nélkül (E2E: minden játékteszt) | PASS |
| 02 | 27 ID, hu/uk név, országháttér (pipeline, T12 egységteszt, explore E2E) | PASS |
| 03 | 5/12/27 kérdés, ismétlés nélküli sorsolás (T01; E2E 5/12/27 kör) | PASS |
| 04 | Poligonválasztás, a betét ugyanazt az ID-t adja, a kívülkattintás nem válasz (T13/T14, E2E 27/27 + betét) | PASS |
| 05–06 | 100/60/30/0, rejtett megoldás az első két hibánál, ugyanaz a hibás ID nem adható be újra, megmutatás, egyszeri ismétlés (T02–T05, E2E vegyes kör) | PASS |
| 07 | Felfedezés címkékkel; vizsgában nincs címke és megmutatás (explore E2E) | PASS |
| 08 | Módosítható kijelölés, külön véglegesítés, nincs visszalépés és kihagyás, azonos UI jó és rossz válasz után (T06, E2E) | PASS |
| 09–10 | Időkorlát; határidőn beadás = lejárat; kettős lezárás kizárva; háttérből visszatérés; időtartam = limit (T08–T10, E2E 5 perces lejárat) | PASS |
| 11 | Eredménymutatók, jegyképlet, 26/27 → 12 (T07, E2E) | PASS |
| 12 | Újrakezdés/kilépés megerősítéssel, Escape = folytatás, frissítés után főoldal (E2E) | PASS |
| 13 | Zoom, pan, alapnézet, Kijev és Szevasztopol betét (E2E) | PASS |
| 14 | Egész ország, nincs külső kérés (minden E2E hálózati auditja) | PASS |
| 15 | Teljes hu/uk felület, böngészőnyelv-felismerés, kör közbeni váltás (T15, T16 E2E) | PASS; anyanyelvi lektorálás nem történt |
| 16 | Világos/sötét/rendszer téma, csak a beállítás tárolódik, tárolási hiba nem akadályoz (T17, E2E tárolóellenőrzés) | PASS |
| 17 | 320×568, 390×844, 844×390, 768×1024, 1366×768: nincs vízszintes görgetés, a fő gomb nincs letakarva (visual E2E) | PASS emulációban; valódi eszköz NOT RUN |
| 18 | Billentyűzetes vezérlők, látható fókusz, dialógus fókuszcsapda, szöveges visszajelzés | PASS részben (dialógus E2E); teljes billentyűzetes bejárás és képernyőolvasós próba NOT RUN |
| 19 | Offline teljes kör mindkét nyelven és témában, valós cache-találat alapú jelzés (T19, T20) | PASS (Chromium) |
| 20 | A→B frissítés aktív körrel és második lappal (T21) | PASS (Chromium); B→A recovery-próba NOT RUN |
| 21 | Nincs backend, auth, tárolt eredmény (tárolóellenőrzés, kódáttekintés) | PASS |
| 22 | Reprodukálható pipeline, a források változatlanok, hibás bemenet elutasítva | PASS; GDAL-keresztellenőrzés NOT RUN |
| 23 | Helyi Git, lockfile, runtime, parancsok | PASS; CI-szolgáltató nincs (nincs távoli repó) |
| 24 | Cloudflare-kiadás, fejlécek, telepítés | `_headers` kész és helyben CSP-vel tesztelve; Cloudflare-kiadás NOT RUN (nem volt feladat); adatlicenc nem igazolt |
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

`reports/screenshots/`: 4 kombináció (hu/uk × világos/sötét) × főoldal, gyakorló hiba, gyakorló helyes válasz, Kijev-betét, számonkérés, számonkérés eredménye. Emellett 320×568, 844×390 (fekvő), 768×1024 és 1366×768 nézet, valamint felfedezés, névjegy és súgó.

## Független kódátnézés

Egy külön agent a specifikáció alapján átnézte a megvalósítást, a fejlesztés menetének ismerete nélkül. Blokkoló hibát nem talált. A frissítési folyamatban három hibát jelzett, ezeket javítottuk:
1. Ha a frissítést ez a lap kérte, de közben kör indult, a lap újratöltődhetett. Most körben soha nem töltődik újra, a frissítés vár.
2. Egy válaszolni nem tudó (háttérbe tett) lap tétlennek számított. Most a legutóbb „foglalt” állapotot jelző, de nem válaszoló lap foglaltnak számít.
3. Az eredményoldalról kért frissítésnél egy elavult állapot tévesen foglaltnak hagyhatta a lapot. Most az aktivitás (`idle`/`round`/`result`) és az eredmény eldobása külön paraméter.

Két javaslatát is beépítettük: dupla kattintással nem lehet átugrani a visszajelzést (E2E-teszt is van rá), és az időzítő képernyőolvasós címkéje nem takarja el az időt. Nem módosítottuk, csak dokumentáljuk: ha egy kör közben a térkép renderelése hibára fut, a kör megszakad, és az újrapróbálás új sorsolással indul.

## Nem elvégzett próbák

- Fizikai Android Chrome és iPhone Safari: telepítés, pinch, képernyőzár, repülő üzemmód, Safe Area. Ezeket nem végeztük el, és emulációval nem helyettesíthetők.
- WebKit és Firefox: a környezetben csak Chromium volt telepítve.
- B→A recovery-kiadás, Cloudflare-kiadás és a kiadott HTTPS-cím fejléceinek ellenőrzése.
- GDAL/GEOS-os geometria-keresztellenőrzés.
- Anyanyelvi lektorálás.
- Adatforrás és licenc: a tulajdonos közlése szerint nyílt forrásokból, oktatási célra vektorizált adatok; ez nincs ellenőrizve.
