# TopoGok – átadás a megvalósító agentnek

> Aktuális tervezési irány (2026-11-10): [0003 online és tanári platform](project/tasks/0003_ONLINE_PLATFORM/task.md). A helyi MVP és a második téma már működik. Az alábbi átadás az eredeti vendég-MVP történeti alapja; a benne szereplő backend/fiók/mentés tiltások nem vonatkoznak a 0003 később jóváhagyott fiókos fázisaira. A 0003 most specifikációtervezet, nem implementációs utasítás; a design és plan még nincs kész. A következő agent először az aktuális [CURRENT_TASK](project/CURRENT_TASK.md) fájlt olvassa.

## Feladat és munkakörnyezet

A projekt gyökere `D:\Work\Suli\Topo`. Készítsd el a dokumentált TopoGok MVP-t, amikor a tulajdonos megadja a megvalósítási utasítást. A jelenlegi csomag tervezési átadás: önmagában nem utasítás publikálásra vagy külső fiók létrehozására.

A dokumentáció nyelve magyar; a kód, típusok, fájlnevek és commitüzenetek angolok. Az alkalmazás teljes felülete magyar és ukrán. Olvasd végig a README dokumentációs sorrendjét, ne kizárólag ezt az összefoglalót használd.

## Kötelező termékdöntések

- Név: **TopoGok**, minden nyelven változatlan.
- React + TypeScript strict + Vite + MapLibre GL JS, statikus PWA, CSS Modules és témaváltozók.
- V1: egy téma, Ukrajna közigazgatása; 27 egység, teljes terület, saját országhatár-háttér. Nincs külső alaptérkép vagy politikai szöveg.
- Gyakorlás és felügyelt számonkérés, 5/12/mindegyik kérdés, véletlen kiválasztás és kevert sorrend.
- Gyakorlás: legfeljebb 3 próbálkozás, 100/60/30/0 pont, segítség, egyszeri hibaismétlés.
- Számonkérés: külön válaszvéglegesítés, egy kísérlet, nincs visszalépés vagy helyességi visszajelzés, nincs kihagyásgomb.
- Időkorlát: nincs vagy 5/10/15/20 perc. Az idő nem befolyásolja a jegyet.
- Jegy: `max(1, ceil(12 * correct / total))`, kizárólag számonkérésben. Nem hivatalos országos átváltásként kommunikáljuk.
- Eredmények csak az aktuális oldal memóriájában; nincs tanulónév, osztály, történet, export, QR-kód, megosztható kérdéssor vagy statisztika.
- Nyelv és megjelenés megjegyezhető; folyamatban lévő játék nem állítható vissza frissítés után.
- Mindkét nyelv, világos/sötét/rendszer téma, offline működés a teljes letöltés után.
- Cloudflare Pages, szolgáltatói aldomain; nincs saját domain, áruházi csomagolás vagy backend.

## Első teendők megvalósítási utasítás esetén

1. Ellenőrizd a munkafa állapotát és az alkalmazandó helyi utasításokat. Ne változtass a `D:\Work\Suli` más projektjein.
2. Olvasd el az aktív taskot, designt és tervet. A követelményütközést jelezd, ne adj hozzá funkciót saját ötletből.
3. A nyitott adatlicencet ne állítsd rendezettnek. A fájl létezése nem bizonyít felhasználási jogot.
4. Ellenőrizd a geometria érvényességét és a 27 ID-t a data pipeline kialakítása előtt. Ne szűrj országra az örökölt `admin`, `sov_a3` vagy `adm1_code` mezőből.
5. Válassz együtt kompatibilis stabil csomagverziókat, ellenőrizd az aktuális hivatalos dokumentációt, rögzíts lockfile-t és runtime-verziót. Ne használj a dokumentációból feltételezett pontos verziószámot.
6. Haladj a terv függőségi sorrendjében. Minden szakaszhoz rögzítsd a tényleges ellenőrzéseket és a hátralévő munkát.

## Döntések elsőbbsége

A tulajdonos új utasítása elsőbbséget élvez. A termékkövetelmények forrása a `task.md`; a pontozás részleteinek forrása az `ASSESSMENT_MODEL.md`, az adatmezőké a `DATA_CONTRACT.md`. Ha két dokumentum eltér, a megvalósítás előtt egyeztesd és javítsd a dokumentumokat. A tervezői paraméterek (például színkód vagy komponensfájlnév) módosíthatók az elfogadási feltételek megtartásával; a játékszabályok és a scope nem.

## Tiltott scope-bővítések

Ne építs adminfelületet, SHP-feltöltőt, AuthService-vázat, Supabase-klienst, eredmény-adatbázist, regisztrációt, tanári szerepet, megosztási szolgáltatást, telemetriát vagy fizetős infrastruktúrát. Ne jeleníts meg későbbi témákhoz működés nélküli gombokat. Ne adj hangot vagy rezgést. Ne készíts a jelenlegi feladaton túl natív mobilprojektet.

## Átadási bizonyíték

A végső jelentés tartalmazza: mit valósítottál meg; futtatási és buildparancsok; tesztek tényleges eredménye; mobil és két nyelv/két téma képernyőképei; offline/frissítési próba; ismert hibák és nem ellenőrzött eszközök. A Playwright WebKit nem igazol fizikai iPhone-on végzett tesztet. Ha nincs eszköz vagy Cloudflare-hozzáférés, azt nyíltan jelöld, ne szimulálj publikálást.
