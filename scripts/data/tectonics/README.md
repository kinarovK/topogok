# Tektonikai téma – adatelőállítás

`npm run data:tectonics` két lépést futtat:

1. `vectorize.py` (Python 3, `requirements.txt`): a `sources/tectonics/ukraine-tectonics-source.png` térképképről kinyeri a 11 tektonikai egységet. A folyamat:
   - pixelenkénti besorolás a jelmagyarázat színei alapján;
   - a feliratok, városok, folyók, víztározók és törésvonalak kitöltése a környező egységgel;
   - 250 pixelnél kisebb foltok és rossz helyen lévő foltok eltávolítása;
   - georeferálás a közigazgatási csomag országhatárához (kúpvetület, affin illesztés, majd másodfokú polinomos illesztés a határvonalon);
   - simított, közös határú felosztás és kontúrkövetés.

   Kimenet: `build/tectonics/units.geojson`, egy jelentés, és két ellenőrzőkép (`preview.png`, `georeference-check.png`).
2. `build.ts` (Node): geometriai validáció (azonos a közigazgatási pipeline-éval), átfedés- és határellenőrzés 0,02°-os rácson, majd a csomag kiírása: `public/data/ukraine-tectonics/<dataVersion>/`. Jelentés: `reports/tectonics-validation.json`.

## Hatókör és korlátok

- Csak a tulajdonos által megadott 11 egység kérdezhető, egyéb tartalom (városok, vízrajz, törésvonalak) nem kerül az adatba. A térképen szereplő többi szárazföld háttér marad: a Nyugat-európai tábla Lviv mellett, a Duna menti terület és a Krím síksága, illetve a Kercsi-félsziget.
- A pontosságot a forráskép felbontása korlátozza (~1,1 km/pixel). A határok oktatási célú, egyszerűsített ábrázolások, nem földtani térkép.
- Forrás: tulajdonosi közlés szerint szabadon felhasználhatónak jelölt tankönyvi térkép. Pontos forrás (könyv, kiadó, oldal) még nincs rögzítve.
