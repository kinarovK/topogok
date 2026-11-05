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
