# Adatvalidációs jelentés

Generálta: `npm run data:build` (scripts/data/build.ts (dependency-free SHP/DBF reader, OGC validity checks, ellipsoidal LAEA area)), Node v22.23.4. Téma: `ukraine-administration`, adatverzió: `2026.11.05.1`.

Összesített eredmény: **SIKERES**.

## Források (SHA-256)

| Fájl | Bájt | SHA-256 |
|---|---:|---|
| `shp/ukraine_country_boundary.shp` | 48136 | `fc9e81ebb9c21292f655d1aa1a165d4e2e17a664c9270b58e3016435d3dec0ee` |
| `shp/ukraine_country_boundary.shx` | 108 | `a7eb3649dd894275f9d60a127a8848442344ac0cfd9d826567982056a24d6a8b` |
| `shp/ukraine_country_boundary.dbf` | 5313 | `e48c057d17235443529fff2b6b642ea6acc3edef1143021042e452ea06740d16` |
| `shp/ukraine_country_boundary.prj` | 145 | `a02a27b1d1982c8516d83398e85a3c8b1aef1713c13ef4d84d7bde17430c07c4` |
| `shp/ukraine_oblasts.shp` | 323444 | `edd440dce816c46c0ad304ba993cdec92aa84a682c71cb37bfd9f94b5cfeb5f5` |
| `shp/ukraine_oblasts.shx` | 316 | `469b5d308f6a3b5d25403bbe7a0083e3d4ab2757f871eb32aa8c0f492b0dc5c7` |
| `shp/ukraine_oblasts.dbf` | 75703 | `42e955a6c6e8acaebc68deb80de7fac22860ea08487035f91782f8b84812950a` |
| `shp/ukraine_oblasts.prj` | 145 | `a02a27b1d1982c8516d83398e85a3c8b1aef1713c13ef4d84d7bde17430c07c4` |
| `shp/ukraine_oblasts.cpg` | 5 | `3ad3031f5503a4404af825262ee8232cc04d4ea6683d42c5dd0a2f2a27ac9824` |

## Ellenőrzések

| Ellenőrzés | Eredmény | Részletek |
|---|---|---|
| files-country | PASS | .shp .shx .dbf .prj present |
| files-regions | PASS | .shp .shx .dbf .prj .cpg present |
| crs-shp/ukraine_country_boundary | PASS | geographic WGS 84 (EPSG:4326), degrees |
| crs-shp/ukraine_oblasts | PASS | geographic WGS 84 (EPSG:4326), degrees |
| encoding-regions | PASS | cpg declares UTF-8 |
| country-count | PASS | 1 shape, 1 index entry, 1 attribute row |
| region-record-alignment | PASS | 27 shp = shx = dbf |
| region-ids | PASS | 27 unique iso_3166_2 IDs, exactly the expected set |
| region-names | PASS | all 27 name_hu and name_uk non-empty, NFC, equal to the DATA_CONTRACT list |
| geometry-validity | PASS | all rings closed, finite, ≥4 positions, no self-intersections, holes inside shells |
| country-vs-union | PASS | crossings 0, edges used >2× 0, region outer edges missing from country 0, country edges missing from region outline 0, \|area(country) − Σarea(regions)\| = 0.003 m² (tolerance 1 m²) |
| sources-unchanged | PASS | source hashes identical before and after the run |

## Geometriai hibák

Nincs.

## Mérőszámok

| Mérőszám | Érték |
|---|---:|
| countryAreaM2 | 599094516790 |
| sumRegionAreaM2 | 599094516790 |
| areaDifferenceM2 | 0.003 |
| regionEdgeCrossings | 0 |
| edgesUsedMoreThanTwice | 0 |
| outerEdgesNotInCountry | 0 |
| countryEdgesNotOuterRegionEdges | 0 |
| regionVertexCount | 20113 |
| countryVertexCount | 2998 |
| insetPaddingRatio | 0.6 |
| areaKm2.UA-74 | 31772 |
| areaKm2.UA-07 | 19848.3 |
| areaKm2.UA-56 | 20293.3 |
| areaKm2.UA-18 | 29758.6 |
| areaKm2.UA-32 | 27022.7 |
| areaKm2.UA-21 | 12972.7 |
| areaKm2.UA-77 | 8153.3 |
| areaKm2.UA-26 | 13905.4 |
| areaKm2.UA-51 | 33171.6 |
| areaKm2.UA-05 | 26666.6 |
| areaKm2.UA-46 | 21876.7 |
| areaKm2.UA-59 | 23421.5 |
| areaKm2.UA-63 | 31389.3 |
| areaKm2.UA-09 | 26310.2 |
| areaKm2.UA-14 | 26599 |
| areaKm2.UA-43 | 26346.4 |
| areaKm2.UA-65 | 26176.8 |
| areaKm2.UA-23 | 27080.6 |
| areaKm2.UA-40 | 749.6 |
| areaKm2.UA-48 | 23547.4 |
| areaKm2.UA-53 | 28378.8 |
| areaKm2.UA-68 | 20458 |
| areaKm2.UA-61 | 13983.8 |
| areaKm2.UA-71 | 21268.3 |
| areaKm2.UA-35 | 24485.4 |
| areaKm2.UA-30 | 1642 |
| areaKm2.UA-12 | 31816.3 |

## Kimenetek

| Fájl | Bájt | SHA-256 |
|---|---:|---|
| `public/data/ukraine-administration/2026.11.05.1/manifest.json` | 2092 | `282710903fcee4561bd4613b9d23691e841e0b58274f191d50ae1ae8f355efbd` |
| `public/data/ukraine-administration/2026.11.05.1/country.geojson` | 116110 | `dc5222c5fdba633379983a3747bf9af94f9483c9edb2b7de32685ad37fefbac2` |
| `public/data/ukraine-administration/2026.11.05.1/regions.geojson` | 783508 | `e7cab4637f583e9ddf454ee3b027dd710778077e249d3164e1aa479f995f05ce` |

## Transzformációk

- Bemenet: EPSG:4326, kimenet: EPSG:4326 / GeoJSON `[longitude, latitude]`; nincs reprojekció, egyszerűsítés, kerekítés vagy geometriajavítás.
- Gyűrűirány: shapefile (külső óramutató szerint) → RFC 7946 (külső óramutatóval ellentétes, lyuk óramutató szerint).
- Attribútumok: csak `id`, `names.hu/uk/en`, `kind`; az ország örökölt attribútumai helyett saját `UA` metaadat.
- Területszámítás: ellipszoidi Lambert-féle területtartó azimutális vetület (WGS 84, középpont 31,5° K / 48,5° É), egyenes élekkel a vetített síkon.
- Eltérés a DATA_CONTRACT 2. és 4. lépésétől: a munkakörnyezetben nem volt GDAL/GEOS, ezért saját, függőség nélküli olvasó és OGC-szabályokat követő validáció fut. A GDAL-os keresztellenőrzés parancsa a `scripts/data/README.md`-ben; lefuttatása nyitott feladat.
