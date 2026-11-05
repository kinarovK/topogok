# Projektállapot

Frissítve: 2026-11-05 (megvalósítási munkamenet).

- Termékinterjú: lezárva. Dokumentáció: elkészült; a tulajdonos 2026-11-05-én megvalósítási utasítást adott.
- Implementáció: **elkezdődött, nem kész.** Nincs futtatható webalkalmazás, nincs produkciós build és böngészős teszt.
- Akadály: a megvalósítási környezetben (felhős munkaterület és a tulajdonos gépéhez kapcsolt Linux-shell) az npm-registry nem volt elérhető (HTTP 403 / connect_rejected). A jóváhagyott stack (Vite, MapLibre GL JS, vite-plugin-pwa, tesztfuttató) ezért nem volt telepíthető. A tulajdonos a csomagkezelők engedélyezését választotta; a stacket nem módosítottuk.
- Adatok: a pipeline lefutott, a csomag elkészült (`public/data/ukraine-administration/2026.11.05.1/`). 27 ID, mindkét névmező, érvényes geometria, a 27 egység élről élre lefedi az országot. GDAL/GEOS-os keresztellenőrzés még nincs.
- Adatforrás: tulajdonosi közlés szerint nyílt források alapján, oktatási célra vektorizált adatok. Konkrét forrás és licenc nincs megadva, független ellenőrzés nem történt (`provenance.status = unverified`). Nyilvános kiadás előtt külön ellenőrizendő.
- Publikálás: nem történt; Cloudflare-fiók/projekt és távoli Git-szolgáltató nincs kijelölve.
- Helyi Git: külön repó a Topo gyökerében, `main` ág; remote nincs.

## Ténylegesen elvégzett ellenőrzések (2026-11-05)

| Ellenőrzés | Parancs | Eredmény |
|---|---|---|
| Adatpipeline, validáció | `npm run data:build` | PASS, 13/13 ellenőrzés; `reports/data-validation.md` |
| Reprodukálhatóság | `npm run data:validate` | PASS, bájtra azonos újragenerálás |
| Forráshash előtte/utána | pipeline beépített ellenőrzése | PASS, a források változatlanok |
| Egységtesztek (szabályok, óra, jegy, adatbetöltő, hibás bemenet, szótár, beállítások) | `npm test` | 29/29 PASS (Node 22.23.4, `node:test`) |
| Típusellenőrzés (strict) | `tsc -p .` (TypeScript 6.0.3) | PASS, a domain, data, i18n, preferences, scripts és tests forrásokra |

## Nem elvégzett / nyitott

- P01 projektalap a jóváhagyott stackkel (Vite, React, MapLibre, PWA plugin, lint, lockfile): npm-hozzáférés kell hozzá.
- P04 felület, P05 térkép és betétek, P06–P07 végigjátszható körök, P08 offline/frissítés, P09 böngészős E2E és képernyőképek: nem kezdődtek el.
- GDAL-os keresztellenőrzés: parancs a `scripts/data/README.md`-ben.
- Nyelvi lektorálás: nem történt; az ukrán szöveget a megvalósító írta.
- Fizikai Android/iPhone próba: nem történt.

Következő lépés: npm-hozzáféréssel rendelkező munkamenetben P01, majd a plan.md sorrendje szerint P04–P09.
