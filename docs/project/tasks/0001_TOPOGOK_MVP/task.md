# 0001 – TopoGok MVP specifikáció

## Állapot és kockázati szint

Full tervezési szint. A tulajdonos 2026-11-05-én utasítást adott a helyi megvalósításra; a szakaszos implementáció folyamatban van, az állapotot a [terv naplója](plan.md#végrehajtási-napló) és a [STATUS](../../STATUS.md) rögzíti. Az MVP nem kész: adatcsomag és játékszabályok vannak, futtatható alkalmazás még nincs.

## Elvárt eredmény

Statikusan hosztolható, telepíthető, magyar és ukrán PWA, amelyben Ukrajna közigazgatási egységeit kell a térképen kiválasztani. Gyakorlásra és felügyelt számonkérésre egyaránt alkalmas. Részletes termékhatárok: [PRODUCT](../../../PRODUCT.md).

## Követelmények és elfogadási feltételek

| ID | Követelmény és ellenőrizhető elfogadási feltétel |
|---|---|
| AC-01 | A név minden felületen TopoGok. A főoldalról mindkét játékmód elindítható regisztráció és szerepválasztás nélkül. |
| AC-02 | Pontosan egy elérhető téma van: Ukrajna közigazgatása. A háttér a megadott országhatár, a kérdésréteg mind a 27 megadott egység. Mindegyik stabil ID-val és hu/uk névvel rendelkezik. |
| AC-03 | Kérdésszám: 5, 12 vagy mindegyik (most 27). A rendszer ismétlés nélkül mintáz és kever; újrakezdés új sorsolás. A gyakorlás célzott ismétlése külön szakasz. |
| AC-04 | A feladat megnevezés alapján poligonválasztás. A térképen és a betéteken ugyanaz a feature ID érvényes. A poligonon kívüli érintés nem válasz és nem fogyaszt próbálkozást. |
| AC-05 | Gyakorlásban legfeljebb 3 véglegesített kísérlet van. Pontok: 100/60/30, sikertelen vagy megmutatott megoldás: 0. Az első két hiba nem fedi fel a helyes területet. |
| AC-06 | Gyakorló hibajelzés piros terület és piros „Helytelen” felirat; helyes megoldás zöld. A „Mutasd meg” felfedi a megoldást és lezárja a feladatot 0 ponttal. A hibázott/segített feladatok egyszer újra szerepelnek; ez nem változtatja az eredeti pontszámot. |
| AC-07 | Külön, pontozatlan térképfelfedező nézetben a nevek megjeleníthetők. Számonkérésben sem tanuló címkék, sem segítség, sem előző válasz helyessége nem érhető el. |
| AC-08 | Számonkérésben egy poligon kijelölése még módosítható. A külön véglegesítő gomb után nincs visszalépés. Egy kérdésre egy válasz, nincs negatív pont és nincs kihagyásgomb. |
| AC-09 | Számonkérés időkorlátja nincs/5/10/15/20 perc. Utolsó végleges válasz vagy határidő automatikusan lezár. A nem véglegesített és hátralévő válaszok hibásnak számítanak. Nincs korai beadásgomb. |
| AC-10 | Az idő háttérben és képernyőzárnál is telik. Lejáratkor/visszatéréskor idempotens lezárás történik. Az idő sem a százalékba, sem a jegybe nem számít bele. |
| AC-11 | Vizsgaeredmény: időtartam, helyes/összes, százalék, max(1, ceil(12×helyes/összes)) jegy. Gyakorlóeredmény: időtartam, elsőre helyes/összes, találati arány és pont/maximum, jegy nélkül. Nincs részletes hibajegyzék, export vagy eredményarchívum. |
| AC-12 | Aktív körből újrakezdés vagy kilépés megerősítést kér. Újrakezdés bármikor engedett; régi kör elvész. Frissítés után nem áll vissza a kör. |
| AC-13 | Zoom, pan és alapnézet gomb használható érintéssel/egérrel. Kijev és Szevasztopol nagyított betéttérképe elérhető, és nem függ attól, melyik a keresett válasz. |
| AC-14 | Az egész ország megjelenik. Nincsenek politikai szövegek, külső térképcsempék, reklámok vagy analitikai hívások. |
| AC-15 | A teljes felület és minden kérdésnév hu/uk nyelvű. Első indulásnál elsődleges böngészőnyelv uk esetén ukrán, egyébként magyar. Kézi váltás azonnali, kör közben sem módosítja a feladatsort/pontozást. |
| AC-16 | Világos és sötét téma, alapértelmezett rendszerkövetés. Csak a nyelv- és témaválasztás menthető tartósan. Tárolási hiba nem akadályozza a játékot. |
| AC-17 | Mobil álló/fekvő, tablet és desktop nézetben működik; nincs vízszintes oldalgörgetés vagy egymást takaró alapvezérlő. Hang és rezgés nincs. Rövid animációk tiszteletben tartják a reduced-motion beállítást. |
| AC-18 | A hagyományos vezérlők billentyűzettel elérhetők, fókuszuk látható, visszajelzésük szöveges is. Teljes nem vizuális térképfeladat és teljes WCAG AA megfelelőségi állítás nem v1 vállalás. |
| AC-19 | Teljes első letöltés után minden v1 képernyő, nyelv, téma, játékadat és betéttérkép hálózat nélkül használható. Az offline kész állapotot valós cache-teljesülés jelzi. Első letöltés nélkül nincs offline ígéret. |
| AC-20 | Frissítés nem tölti újra az aktív kört. App és adatok együtt verziózott csomagot alkotnak. Új kiadás csak biztonságos állapotban, felhasználói művelettel aktiválódik. |
| AC-21 | Nincs backend, tanulói adat, eredménytárolás, történet, auth, ranglista, közös kérdéssorlink vagy QR. A megoldások böngészőben hozzáférhetők; felügyelt használatot feltételezünk. |
| AC-22 | Az SHP előfeldolgozás reprodukálható, az eredeti fájlokat nem írja felül. GeoJSON, manifest, hash, név/ID és geometriai validáció készül. Hiányos adatokkal nem indul játék. |
| AC-23 | Külön helyi Git-repó, lockfile, dokumentált runtime és parancsok. A CI ellenőrzi a lintet, típusokat, szabályokat, adatszerződést, buildet és E2E smoke-ot publikálás előtt. |
| AC-24 | Statikus HTTPS kiadás Cloudflare Pages szolgáltatói aldomainen; dokumentált fejlécszabályok, telepítés, visszaállítás és PWA frissítés. Nyilvános kiadás előtt az adatlicenc igazolt. |
| AC-25 | Az ellenőrzési terv mérési eredményei és a valóban tesztelt böngészők/eszközök rögzítve vannak. A sikertelen vagy el nem végzett ellenőrzést nem lehet sikeresként jelenteni. |

## Alapértékek – tervezői döntések

Kezdő kérdésszám 12; időkorlát nélkül; gyakorlásban az eltelt idő kijelzése alapból kikapcsolva. A számonkérés eredményén mind százalék, mind 1–12-es jegy látható, külön értékelésválasztó nélkül. A részletes számításokat az [értékelési modell](../../../ASSESSMENT_MODEL.md) rögzíti.

## Korlátok és nyitott bizonyítékok

- A forrásfájlok, névmezők és a geometria érvényessége ellenőrzött (saját validátor, `reports/data-validation.md`); GDAL-keresztellenőrzés és licenc még nincs. Tulajdonosi közlés: nyílt forrásokból, oktatási célra vektorizált adatok; konkrét forrás és licenc nélkül, nem ellenőrizve.
- Az adatok tényleges közigazgatási frissességét nem bizonyítja a fájlnév vagy a fájlidő.
- A v1 nem védi a jegyet fejlesztői eszközökkel történő manipulálástól és nem azonosít tanulót.
- A böngésző törölheti az offline cache-t; újra letöltés szükséges lehet.
- Publikálás és távoli repó létrehozása külön külső művelet; a dokumentáció nem állít ilyen hozzáférést.

## Késznek tekintés

Az AC-khez tartozó tesztek és kézi ellenőrzések eredménye dokumentált; az alapfolyamatokat akadályozó hibák javítva; a maradó korlátok leírva; a produkciós build reprodukálható; a tulajdonos át tudja venni a működő alkalmazást. A dokumentációs szakasz készsége önmagában nem jelenti az MVP készségét.
