# Adatpipeline

`node scripts/data/build.ts` (npm: `data:build`) a `shp/` két fájlcsoportjából validált csomagot készít ide: `public/data/ukraine-administration/<dataVersion>/`, és megírja a `reports/data-validation.{json,md}` jelentést. `--check` (npm: `data:validate`) ideiglenesen újragenerál, és bájtra összeveti a commitolt csomaggal; semmit nem ír felül.

Előfeltétel: Node.js ≥ 22.18 (beépített TypeScript type stripping). Külső csomag nem kell. A forrásfájlokat csak olvassa, a futás előtt és után összeveti a hash-eket. Hibánál nem ír csomagot, a meglévőt érintetlenül hagyja. Sikeres futásnál ideiglenes könyvtárba ír, majd átnevezéssel cseréli.

## Mit ellenőriz

1. Fájlcsoport teljessége (`.shp/.shx/.dbf/.prj`, a régióknál `.cpg` is), CRS (földrajzi WGS 84), UTF-8 kódlap, rekordszám-egyezés SHP = SHX = DBF.
2. Pontosan a `config.ts` 27 `iso_3166_2` azonosítója, egyediség, nem üres és a DATA_CONTRACT-tal egyező `name_hu`/`name_uk` (NFC). Az `adm1_code`/`admin`/`sov_a3` mezőket nem használja.
3. OGC-szabályok szerinti geometria: zárt gyűrű, legalább 4 pozíció, véges koordináta, nincs önmetszés vagy tüske, a gyűrűk legfeljebb pontban érintkeznek, a lyuk a külső gyűrűn belül van.
4. Lefedettség: a régiók élei nem metszik egymást, minden él legfeljebb két régióé, a csak egyszer használt élek halmaza pontosan az országhatár éleivel egyezik, és |terület(ország) − Σ terület(régiók)| ≤ 1 m² (ellipszoidi Lambert-féle területtartó vetületben).

## Eltérés a DATA_CONTRACT-tól

A DATA_CONTRACT 2. és 4. lépése GDAL/OGR-t és GEOS-t ír elő. A megvalósítási környezetben ezek nem voltak elérhetők, ezért a fenti, függőség nélküli olvasó és validátor készült. Az élhalmaz-egyezés erősebb a rés/átfedés-területmérésnél: pontos egyezésnél a régiók uniója élről élre azonos az országgal.

GDAL-os keresztellenőrzés a tulajdonos gépén (QGIS-szel telepített GDAL; **még nem futott le**):

```bat
set OGR="C:\Program Files\QGIS 4.2.2\bin\ogrinfo.exe"
%OGR% -ro -dialect SQLite -sql "SELECT iso_3166_2, ST_IsValid(geometry) AS valid, ST_IsValidReason(geometry) AS reason FROM ukraine_oblasts" shp\ukraine_oblasts.shp
%OGR% -ro -dialect SQLite -sql "SELECT ST_IsValid(geometry) AS valid FROM ukraine_country_boundary" shp\ukraine_country_boundary.shp
```

Elvárt: minden sorban `valid = 1`. Ha nem, a csomag nem adható ki, és a hibát dokumentálni kell.

## Adatverzió

`config.ts`: `DATA_VERSION = '2026.11.05.1'`. Új bemenetnél új verzió kell, a régi könyvtár maradhat a korábbi kliensek miatt.

## Vegyes témák (terület, vonal, pont) – `npm run data:topic -- <topic.ts>`

Általános, konvenció alapú építő a vegyes témákhoz ([0005_MIXED_GEOMETRY](../../docs/project/tasks/0005_MIXED_GEOMETRY/task.md)).

- **Forrás:**
  - egy mappa: benne minden `.shp` / `.geojson` fájl egy réteg;
  - vagy egy `.gpkg`: minden táblája egy réteg;
  - vagy egyetlen fájl.

  A téma összes rétege egy kérdéssorba kerül, a geometriatípustól függetlenül.
- **Geodatabase:** a QGIS-szel települt GDAL alakítja GeoPackage-be:
  ```bat
  "C:\Program Files\QGIS 4.2.2\bin\ogr2ogr.exe" -f GPKG afrika.gpkg afrika.gdb
  ```
- **Mezők:** `id`, `name_hu`, `name_uk`. Ha a forrásban más a mezőnév, a téma leírójában (`fields`) rétegenként átnevezhető. Ha nincs `id`, a program képez egyet (`réteg-sorszám`).
- **Háttér:** a `hatter` (vagy `background`) réteg nem kérdezhető. Ha nincs ilyen, a kérdezett területek adják a hátteret.
- **CRS:** csak földrajzi WGS 84; más esetben hibaüzenet, nincs csendes átvetítés.
- **Ellenőrzés:**
  - egyedi azonosító, hu/uk név;
  - területnél OGC-szabályok;
  - vonalnál legalább 2 különböző pont (egyszerűsítés után is);
  - pontnál, hogy a háttéren van;
  - lefedő rétegnél az átfedés;
  - méretkeret (1,5 MB tömörítve).

  Hiba esetén nem készül csomag.
- **Kimenet:** `public/data/<id>/<adatverzió>/`, valamint `reports/<id>-validation.{json,md}` (rétegenként a típus és a darabszám). `--check`: összeveti a commitolt csomaggal, `--out <mappa>`: máshová ír.
- **Tesztadat:** a `scripts/data/fixtures/make-mixed.ts` egy mesterséges témát készít (mappa és GeoPackage, azonos tartalommal). Ez csak az E2E-buildbe kerül (`test-mixed`), a felhasználóknak nem jelenik meg.

## Kontinensek (6 téma egy GeoPackage-ből) – `npm run data:continents`

- **Forrás:** `sources/continents/foldrajz_07_osztaly.gpkg` (a tulajdonos fájlja; forráslink és licenc nincs megadva, ezért `unverified`). A rétegek neve `<kontinens>_<réteg>`, pl. `afrika_teruletek`; a `layerPrefix` választja ki egy téma rétegeit.
- **Leíró:** `scripts/data/continents/topics.ts` – egy fájl hat témát ír le (a CLI tömböt is elfogad).
- **Háttér és partvonal:** az adott kontinens a Natural Earth 1:50m szárazföldből (`shp/ne_50m_land.*`, közkincs, v4.1.0), a `scripts/data/coast.ts` vágja ki (Dél-Amerikánál 1:10m és finomabb rács, hogy a Magellán-szoros nyitva maradjon). A szigeteket és a szárazföld darabjait a legközelebbi 1:110m-es kontinenshez (`build/world/world_continents.shp`) sorolja, így Afrika és Eurázsia, illetve a két Amerika határa ezt követi. A szárazföldi területeket a partvonalra vágja, a tengereket (`tengerek`, `oceanok`, öblök) a vízre; a tavak és a Nagy-korallzátony változatlanok. A szigetcsoportokból (Polinézia, Mikronézia, Melanézia, Kis-Antillák) a szigetek maradnak, ~45 km-rel megnövelve, hogy látsszanak és rájuk lehessen kattintani. A vágás raszteres (0,025°-os rács, `scripts/data/raster.ts`): a pontossága ~3 km, ennél részletesebbet egy kontinenstérkép nem mutat.
- **Kimaradnak** (`excludeIds`): az országok (egy későbbi politikai témában lesznek), a La Manche, a Drake-átjáró, az Ausztrál-Alpok és Óceánia szigetei.
- **Hegységek vonalként** (a tulajdonos döntése, 2026-11-17): a hegységek a főgerincüket jelölő vonalak a `<kontinens>_hegysegek` rétegben, szélesebb, szürkésbarna stílussal; a hiányzó Kárpátok (Natural Earth 1:10m hegység-sokszögből) és Skandináv-hegység (a főgerinc mentén kézzel) is felkerült (`mountainLayers`, `kind: 'mountain'`). A vonal a régi hegység-sokszög középvonala (`scripts/data/continents/ridges.py`: vázkeresés a sokszög raszterén, a leghosszabb út, végei a körvonalig meghosszabbítva, simítva).
- **Domborzati egységek nem fedhetik egymást** (`partition`): minden szárazföldi cella egy egységé, a kisebbé. A félszigetek, szigetek és sivatagok megtartják a teljes körvonalukat.
- **Forrásjavítások** (`scripts/data/continents/fix_source.py`, a tulajdonos kérésére, 2026-11-17): a durván rajzolt Labrador-félszigetet, Központi-síkságot, Nagy-síkságot, La Plata- és Orinoco-alföldet és az ausztráliai Központi-alföldet a Natural Earth 1:10m domborzati régiói váltják; a Közép-Duna-medence kézzel követett határt kapott; a Kongó és a Paraná a Natural Earth folyóiból (Lualaba a Kongó felső szakasza, a Paraguay nem része a Paranának); új a Missouri és a Poopó-tó; minden kontinens (az Antarktisz kivételével) megkapta a szárazföld szélső pontjait a tankönyvi névjegyzék szerint (Ausztráliáé nincs a névjegyzékben: York-fok, Délkeleti-fok, Steep Point, Byron-fok), Eurázsia ehhez új `eurazsia_pontok` réteget kapott; a Magellán-szoros vonala a szoros közepén fut (1:10m szárazföldön számolt legkisebb költségű út).
- **Vetület:** iskolai atlaszok szerint: Lambert-féle területtartó azimutális (Afrika, Dél-Amerika, Ausztrália és Óceánia), Lambert-féle szögtartó kúpvetület (Észak-Amerika), Miller-féle hengervetület (Eurázsia, mint a fali térképeken), poláris Hammer (Antarktisz).
- **Víz:** a `tengerek` és `oceanok` réteg, valamint a `waterIds` listában szereplő tavak és öblök vízszínnel jelennek meg.
- **Vonalak:** az egymáshoz ~1 km-en belül csatlakozó darabokat (pl. két pontból álló szakaszokra bontott folyó) egyesíti, így a folyó nem szakadozik.
- **Pontok:** a durva háttérről 3°-on belül lelógó pont (pl. Erebus, Horn-fok) csak figyelmeztetés, a pont így is látszik.
- **Átfedő területeknél** a kliens a kisebb területet választja (pl. tenger az óceánon belül).

## 8. osztály – Ukrajna (`npm run data:ukraine8`)

- **Leíró:** `scripts/data/ukraine8/topics.ts`; források: `sources/ukraine8/<téma>/*.geojson` (egy fájl = egy réteg), a `scripts/data/ukraine8/make_sources.py` készíti a Natural Earth 1:10m-ből (közkincs, v5.1.1, ukrán nézőpontú országhatárok).
- **Ukrajna fekvése és határai:** Ukrajna és 10 szomszéd/tengeri szomszéd ország, Fekete- és Azovi-tenger, Kárpátok (a kontinensek GPKG-jából, mint az Eurázsia-térképen) és Krími-hegység (kézzel, ellenőrizendő) gerincvonala, a 4 szélső pont és a földrajzi középpont (atlaszkoordináták, ellenőrizendők). A háttér-szárazföldet 0,01°-os raszteren vágja ki az ablakra, mert az ablak széle sok partvonalat metsz.
- **Felszínformák, ásványkincsek, természeti övezetek: VÁZLAT** (a tulajdonos döntése, 2026-11-18): a körvonalakat atlaszismeret alapján, kézzel adtam meg a `make_sources.py`-ban, durva pontossággal; a tulajdonosnak kell javítania. Az alföldek, hátságok és az övezetek Ukrajna határára vágva, egymással átfedés nélkül (raszteren: a kisebb egység nyer). A csúcsok közül a Kamula, a Belmak-Mohila és a Mohila-Mecsetna koordinátája bizonytalan. Ezeken a térképeken csak Ukrajna látszik.
