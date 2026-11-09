# Ellenőrzési és átvételi terv

Állapot (2026-11-09): a T01–T25 esetek többsége automatikus teszttel lefutott (Chromium). A ténylegesen futtatott teszteket, a kimaradt próbákat és az eltéréseket a [`reports/acceptance.md`](../reports/acceptance.md) rögzíti. Eltérés a rétegektől: az egységtesztek `node:test`-tel futnak, az integrációs (RTL) réteg nem készült el, a felhasználói folyamatokat Playwright E2E fedi le. Fizikai eszközös és WebKit/Firefox-próba nem történt. A tesztelés a szabályokat és a valós felhasználói folyamatot ellenőrzi; ne készüljenek pusztán a komponens belső felépítését lemásoló tesztek.

## Tesztrétegek

- Unit: Vitest vagy a kiválasztott Vite-verzióval kompatibilis tesztfuttató; tiszta domain, injektált Clock/RNG, konfiguráció és fordítási kulcsok.
- Integráció: React Testing Library jellegű felhasználói interakciók, map adapter tesztduplával; nem bizonyít valós geometriai találatot.
- E2E: Playwright, tényleges böngészőben valódi MapLibre és valós GeoJSON; PWA próbák produkciós builden.
- GIS: reprodukálható export és GDAL/GEOS validáció; nem csak JSON-séma.
- Manuális: valódi érintés, telepítés, offline, vizuális ellenőrzés és nyelvi olvasás.

## Funkcionális esetek

| ID | Eset és elvárt eredmény | AC |
|---|---|---|
| T01 | 5/12/all konfigurációból 5/12/27 egyedi kérdés készül; érvénytelen konfiguráció elutasítva. Injektált RNG mellett determinisztikus. | 03 |
| T02 | Helyes első/második/harmadik kísérlet 100/60/30 pont. Három hiba vagy reveal 0. | 05 |
| T03 | Első két hiba: rossz piros és szöveg; helyes rejtett. Harmadiknál helyes zöld. Ugyanazon rossz ID újra beadása nem fogyaszt kísérletet. | 05–06 |
| T04 | 3 elsőre helyes + 1 másodikra + 1 reveal = 360/500, 60%, 2 egyedi ismétlendő. Review sikere/hibája nem módosítja. | 06,11 |
| T05 | Minden hibás feladat egyszer ismétlődik, újabb hibából nincs harmadik kör. Hibamentes kör rögtön eredményre jut. | 06 |
| T06 | Vizsgában semleges kijelölés módosítható; confirm után előző kérdéshez nincs visszaút. Jó és rossz válasz UI/aria viselkedése azonos. | 08 |
| T07 | Pontozás 0/12→1, 1/12→1, 9/12→9, 12/12→12, 1/5→3, 4/5→10, 26/27→12; százalékkerekítés nem változtat jegyet. | 11 |
| T08 | Időlejáratkor a kijelölt, de nem beadott válasz és a hátralévők hibásak; nevező N marad. | 09 |
| T09 | Pontosan határidőkor confirm → timeout. Kétszeri confirm, egymás utáni timeout/final answer → egy lezárás. Lezárt kör nem változik. | 09–10 |
| T10 | Háttérben eltelt idő után visszatéréskor lejár; falióra visszaállítása nem csökkenti elapsed értékét; előreállás kezelése dokumentált. | 10 |
| T11 | Újrakezdés megerősítés elutasítása megőrzi a kört; elfogadás új kör; frissítés főoldal, nincs visszaállított session. | 12 |
| T12 | Country/regions ID, darabszám, nevek, CRS, érvényes geometria és összevont terület ellenőrizve. Forráshash változatlan. | 02,22 |
| T13 | Minden terület belső kontrollpontja helyes ID-t választ; Kijev és Szevasztopol ránagyítva is; holes/kívülkattintás nem találat. | 04,13 |
| T14 | Egymás melletti határokon stabil döntés, target ID-tól függetlenül. Drag/pinch nem válasz. | 04,13 |
| T15 | uk-UA→uk, hu-HU→hu, en-US→hu; kézi override prioritás; két teljes kulcshalmaz és paraméteregyezés. | 15 |
| T16 | Nyelv/téma váltás egy félbehagyott kérdésnél változatlan sor/ID/kísérlet/óra. Két téma rendszerbeállítás-változásra helyesen reagál. | 15–16 |
| T17 | Sérült localStorage vagy tiltott tárolás mellett játék működik; csak preferences kulcs tárolódik, session/result nem. | 16,21 |
| T18 | Vizsga alatt nincs reveal/címkekapcsoló; Explore nem nyílik meg a vizsga megtartásával. | 07–08 |
| T19 | Offline-ready csak minden erőforrás cache után; offline újranyitva mindkét nyelv/téma és teljes játék működik. | 19 |
| T20 | Első látogatás offline vagy törölt cache: nincs hamis kész állapot; újrapróbálás lehetőség. | 19 |
| T21 | A→B kiadás játék közben és másik tabról: nincs reload/adatkeveredés; biztonságos váltás után minden adat B. Hibás installnál A működik. | 20 |
| T22 | Gépelés nélküli HTML vezérlők Tab/Enter/Space kezelése, dialógus fókusz, reduced-motion; hosszú szöveg nem takar gombot. | 17–18 |
| T23 | Network logban nincs külső tiles/font/analytics; produkciós CSP mellett worker és térkép működik. | 14,24 |
| T24 | Invalid manifest, hiányzó név, rossz hash, WebGL hiba: lokalizált hibakép, nincs részleges vizsga vagy hibás jegy. | 22 |
| T25 | Eredmény csak előírt mutatók; főoldal/új kör után törlődik; nincs export, tanulóadat vagy statisztikafunkció. | 11,21 |

## Böngésző és kijelzőmátrix

Támogatási cél: Chrome és Edge aktuális + előző főverzió; aktuális Firefox; Safari/iOS aktuális + előző két főverzió; Android Chrome aktuális + előző főverzió. A kiadás napján rögzítsd a konkrét verziókat. Nem szükséges minden verzióra külön CI-gép, de a ténylegesen nem tesztelt célokat jelölni kell.

Automatizált minimum: Chromium desktop 1366×768; mobil 390×844 és 320×568; tablet 768×1024; WebKit mobil viewport; Firefox alapfolyamat. Külön fekvő mobil próba. Négy vizuális alapkombináció: hu/light, hu/dark, uk/light, uk/dark.

Fizikai eszköz minimum kiadási próba: egy Android Chrome és egy iPhone Safari, modell/OS/böngészőverzió rögzítésével. Ellenőrizendő pinch, kis egységek, install, repülő mód, képernyőzár és visszatérés, sötét rendszerbeállítás, Safe Area. Ha nincs eszköz, ez nyitott ellenőrzés marad; WebKit-emulációval nem jelenthető elvégzett iPhone-próbának.

## Teljesítmény – mérendő tervezői célok

Ezek kezdő célértékek, nem korábbi mérések. Produkciós builden, cold cache mellett 390×844 Chromium, 4× CPU lassítás, 1.6 Mbit/s letöltés és 150ms RTT szimuláció, 5 futás mediánja:

- Első interaktív főoldal legfeljebb 4 s; játék indítás után választásra kész térkép legfeljebb 3 s, ha az adatcsomag már helyben van.
- Kattintástól kijelölési visszajelzésig p95 legfeljebb 150ms, legalább 30 interakció alapján.
- Teljes offline csomag tömörített hálózati mérete cél szerint legfeljebb 5 MiB; első főoldali transzfer cél legfeljebb 750 KiB. Mérni kell a worker és adatok méretét is.
- Nincs rendszeresen 200ms feletti főszál-blokkolás válaszadáskor.

A hideg főoldal és a teljes 5 MiB csomag letöltési ideje külön mérés: a teljes offline csomag letöltése lassú hálózaton hosszabb lehet. A főoldali UI hamar megjelenhet, az „offline kész” állítás csak később. Céltévesztésnél először lazy renderer betöltés, felesleges csomagok kizárása; geometriát nem szabad bizonyíték nélkül roncsolni a méret kedvéért. Elkerülhetetlen eltérést mérési adattal és egyeztetett célmódosítással kell rögzíteni.

## Tanári átvételi próba

1. Nyisd meg mobilon magyar világos módban, indíts 5 gyakorlófeladatot.
2. Adj egy elsőre helyes, egy hibás majd helyes és egy megmutatott választ. Figyeld a három próbálkozás határát és az egyszeri ismétlést.
3. Válts ukránra és sötétre kör közben: a feladat és idő ne induljon újra.
4. Indíts 12 kérdéses számonkérést, először határidő nélkül. Módosíts kijelölést beadás előtt; beadás után ne tudj visszamenni. Ne láss helyességet.
5. Fejezd be és számold ellen a százalékot/jegyet. Név vagy osztály nem kérhető.
6. Egy 5 perces tesztet hagyj lejárni részben kitöltve, egyszer háttérből visszatérve is. Az összes eredeti kérdés maradjon a nevező.
7. Válaszd ki mindkét kis várost ránagyítva; ne takarják a gombok.
8. Az offline-ready után kapcsold ki a hálózatot és nyisd újra. Nyelvváltás és egy teljes kör is működjön.
9. Frissítsd az oldalt aktív körben: nincs folytatás vagy tárolt eredmény. Nyelv és téma megmaradhat.

## Bizonyíték és lezárás

`reports/acceptance.md`: AC és T ID → parancs/kézi próba → környezet → pass/fail/not-run → fájl/link. Képernyőképek legalább főoldal, setup, gyakorlóhiba, vizsga, eredmény, nagyított kis város, offline állapot; mindkét nyelv és téma lefedve. Külön data-validation, build méret és teljesítménymérés. Forráslicenc, valós eszközök és telepítési próba nem helyettesíthető unit teszttel.
