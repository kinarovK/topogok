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
