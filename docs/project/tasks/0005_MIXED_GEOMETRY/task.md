# 0005 – Vegyes elemtípusok: terület, vonal (folyó) és pont egy térképen

Dátum: 2026-11-16. Állapot: **terv, tulajdonosi jóváhagyásra (docs PR)**.

## Tulajdonosi kérés (2026-11-16)

- Egy témában (például egy kontinens) a kérdezhető elemek lehetnek **területek** (ország, nagytáj, tó), **vonalak** (folyó) és **pontok** (szélső pont, város).
- A tartalom még nincs eldöntve. Az adatot a tulajdonos később **SHP vagy geodatabase** formában adja meg. Most a szoftvert kell felkészíteni arra, hogy ezeket egy térképen kezelje.
- Kiemelt cél: a vékony elemeknek (folyó) és a pontoknak **kattintási puffere** legyen, hogy telefonon is könnyen el lehessen találni őket.

## 1. Mi változik és mi nem

| Rész | Változik? |
|---|---|
| Adatmodell, adat-előkészítő pipeline | **igen**: vonal és pont geometria, rétegleíró konfiguráció, GeoPackage-olvasó |
| Térkép: rajzolás, kiemelés, kattintás | **igen**: új rétegek, pufferes találatkeresés |
| Kérdés szövege, felfedezés-felirat | **igen**: elemtípus a kérdésben, vonal menti és pont melletti felirat |
| Tanári elemkészlet (F4) | kicsit: a lista elemtípus szerint csoportosít |
| Játékszabályok, pontozás, mentés és újrajátszás (F3), toplista (F5), oldalelhagyás (F6) | **nem**: ezek csak azonosítókkal dolgoznak, a geometriát nem ismerik |
| Szerver | nem: a `TOPIC_FEATURES` csak azonosítókat tartalmaz, ezt a generátor elemtípustól függetlenül előállítja |

## 2. Adatmodell

A téma `regions.geojson` fájlja (a név a kompatibilitás miatt marad) vegyes elemeket tartalmazhat. Minden elemnek egyedi `id`-je és kötelező `names.hu` / `names.uk` mezője van, mint eddig. Új mező a `geomType`:

| `geomType` | GeoJSON geometria | Példa |
|---|---|---|
| `area` | `Polygon`, `MultiPolygon` | ország, tó, nagytáj |
| `line` | `LineString`, `MultiLineString` | folyó, hegylánc vonala |
| `point` | `Point` | szélső pont, város |

- A meglévő `kind` mező (pl. `oblast`, `city`) marad. Mellé jön egy rétegszintű **típusfelirat** hu/uk nyelven (pl. „folyó” / „річка”, „szélső pont” / „крайня точка”). Ez a kérdésben jelenik meg.
- A régi témák (Ukrajna, tektonika, kontinensek) adata változatlanul érvényes: ahol nincs `geomType`, ott a geometriából derül ki, és ez `area`.
- A háttér (ország, kontinens körvonala) továbbra is külön fájl, és nem kérdezhető.

## 3. Adat-előkészítés (SHP és geodatabase)

- **Rétegleíró konfiguráció témánként**, például `scripts/data/africa/config.ts`. Rétegenként megadja:
  - a forrásfájlt;
  - a geometriatípust;
  - az azonosító mezőt;
  - a magyar és az ukrán név mezőjét;
  - a típusfeliratot;
  - az egyszerűsítési tűrést;
  - hogy a réteg „lefedő”-e (pl. országok: rés és átfedés nélkül fedik a kontinenst). A lefedettséget az eddigi szigorú él-ellenőrzés vizsgálja.
- **SHP:** a meglévő, függőség nélküli olvasónk most csak sokszöget kezel. Bővül vonallal (shape type 3) és ponttal (1). Mivel a Z/M típusoknál a magasságot eldobjuk, ezek is olvashatók (13, 11, 23, 21).
- **Geodatabase (FileGDB):** zárt formátum, megbízhatóan csak GDAL-lal olvasható, és az nincs a pipeline-ban. Javaslat: a tulajdonos gépén a QGIS-szel települt GDAL egy paranccsal **GeoPackage-be** alakítja:
  ```bat
  "C:\Program Files\QGIS 4.2.2\bin\ogr2ogr.exe" -f GPKG afrika.gpkg afrika.gdb
  ```
  A GeoPackage szabványos SQLite-fájl. A pipeline a Node beépített `node:sqlite` moduljával és egy saját WKB-olvasóval olvassa, új függőség nélkül. Így a GPKG közvetlenül is megadható.
- **Ellenőrzés elemtípusonként:**
  - közös:
    - egyedi azonosító;
    - nem üres, NFC-normalizált hu/uk név;
    - véges koordináták;
    - földrajzi WGS 84 (más CRS esetén hibaüzenet, nincs csendes átvetítés);
  - `line`: legalább 2 különböző pont, nincs nulla hosszú szakasz, egyszerűsítés után sem fogy el;
  - `point`: a téma határain belül van;
  - `area`: a mostani OGC-szabályok szerint.
- **Méretkeret:** a vonalak a megadott tűréssel egyszerűsödnek (az eddigi algoritmussal). Egy téma tömörítve legfeljebb kb. 1,5 MB legyen. A jelentés (`reports/data-validation`) elemtípusonként kiírja a darabszámot és a méretet.
- **Vetület:** témánként konfigurálható. Afrikához elég a mostani Web Mercator (az egyenlítő körül alig torzít), a világtérképnél marad a Robinson.

## 4. Térkép-megjelenítés

Rétegsorrend alulról felfelé:
1. háttér;
2. területek kitöltése és határa;
3. **vonalak** (folyó: kék, a nagyítással vastagodó vonal);
4. **pontok** (kör fehér kerettel, a nagyítással kissé növő sugár).

- **Állapotok** mindhárom típusra: alap, kijelölt, hibás, helyes, kikapcsolt (F4: szürke, nem kattintható). Vonalnál és pontnál a kijelölést vastagabb vonal, illetve nagyobb kör és **jól látható gyűrű** jelzi, hogy egy kis pontnál is egyértelmű legyen, mit jelölt ki a diák.
- **Felfedezés mód:** a folyónév a vonal mentén, a pontnév a pont mellett jelenik meg (MapLibre `symbol` réteg). Ütközéskor a kisebb prioritású felirat elmarad.

## 5. Kattintási puffer – a fő mechanizmus

A célterület **képernyő-képpontban** értendő, nem méterben, így a nagyítási szinttől függetlenül ugyanakkora ujjnyi terület marad.

**Pufferméret:**

| Eszköz | Puffer |
|---|---|
| Érintőképernyő (`pointer: coarse`) | 22 CSS px, kb. egy ujjbegy fele |
| Egér (`pointer: fine`) | 10 CSS px |

Az értékek konfigurálhatók. A végleges számot a valódi eszközös próba dönti el.

**Algoritmus koppintáskor** (tiszta függvény, `src/map/hitTest.ts`, unit-tesztelhető):
1. A MapLibre lekéri a koppintás körüli, `2 × puffer` oldalú négyzetbe eső vonalakat és pontokat (`queryRenderedFeatures` dobozzal), valamint a koppintás alatti területeket.
2. Minden jelölt vonalra és pontra kiszámoljuk a **valódi képernyő-távolságot**: a geometriát `map.project`-tel képernyőre vetítjük, pont–szakasz távolságot számolunk. Csak a pufferen belüliek maradnak.
3. **Választás:**
   - **Pont** a pufferen belül előbb, mint vonal, és vonal előbb, mint az alatta lévő terület. A vékony elem különben eltalálhatatlan volna, mert mindig alatta van egy terület.
   - **Ha a kérdés típusa ismert**, az ilyen típusú jelölt elsőbbséget kap. Ha a kérdés folyót kér, a folyó közelében koppintás a folyót jelöli ki; ha országot kér, a folyó mellett is az ország jelölődik ki. Ez nem fedi fel a választ, mert a típus a kérdés szövegében úgyis benne van. A helyes elem azonosítója most sem bemenete a választásnak.
   - Azonos típuson belül a **legközelebbi** nyer, holtversenyben a stabil azonosítósorrend dönt.
   - A puffer szélén kívül nincs találat, a meglévő kijelölés megmarad, mint most.
4. A kikapcsolt (F4) elemek nem jelöltek.

Kiegészítő segítségek:
- Kurzor egérnél: mutató, ha a puffer talál valamit.
- Nagyításkor a pontok sugara és a vonalak vastagsága kissé nő; a puffer marad.
- A teljes képernyő és a nagyítás eddig is megvolt.
- Ha több elem esik nagyon közel egymáshoz (pl. torkolat), a nagyítás segít. Választó felugró menüt nem tervezünk, mert az a számonkérésnél ellentmondana a „nincs kijelölés-segítség” elvnek.

## 6. Kérdés és visszajelzés

- Kérdés: „Keresd meg (folyó): Nílus” / „Знайди (річка): Ніл”. Csak területtípusú témánál marad a mostani „Keresd meg: …” forma, így a régi témák szövege nem változik.
- Gyakorlásnál a „Mutasd meg” és a helyes válasz kiemelése vonalnál és pontnál is látható. Ha az elem a nézeten kívül van, a térkép odaúszik.
- A tanári elemlistában (F4) a „Témák” fül típus szerint csoportosít (Területek / Folyók / Pontok), csoportonkénti „Mind” / „Egyik sem” gombbal.

## 7. Tesztelés

- **Unit:**
  - WKB-olvasó;
  - SHP vonal/pont olvasás (Z/M típusokkal);
  - vonal- és pontvalidáció;
  - képernyő-távolság;
  - a választási szabályok: pont > vonal > terület; a kérdéstípus elsőbbsége; a legközelebbi nyer; kikapcsolt elem; pufferen kívül nincs találat.
- **Tesztadat:** egy kis, **csak tesztekben használt mesterséges téma** (néhány terület, két közeli folyó, pontok). Ez nem jelenik meg a felhasználóknak. A valódi Afrika-tartalom akkor jön, amikor az adat megérkezik.
- **E2E (Chromium, telefonos nézet):**
  - koppintás a folyótól 15 px-re kijelöli a folyót;
  - 40 px-re már nem;
  - a pont eltalálható a puffer szélén;
  - egy teljes kör vegyes elemekkel menthető, újrajátszható és toplistás.
- **Valódi eszköz:** a pufferméret végleges beállítása a tulajdonos próbája után.

## 8. Végrehajtás

Egy ágon, `staging` + egy PR módszerrel, ahogy F4–F6:
1. **M1 – adat:** geometriatípusok, validáció, SHP vonal/pont, GPKG-olvasó, rétegleíró konfiguráció, teszttéma.
2. **M2 – térkép:** rétegek és stílusok, pufferes találatkeresés, kérdésszöveg, felfedezés-feliratok.
3. **M3 – kiegészítések:** csoportosított F4-lista, E2E, dokumentáció.
4. **Később, külön feladat:** az Afrika (vagy más kontinens) téma a tulajdonos adataiból.

## 9. Tulajdonosi döntések (jóváhagyásra, javasolt alapértékkel)

1. **Pufferméret:** 22 px érintésre, 10 px egérre, a próbák után állítható. *Javaslat: így.*
2. **Választási sorrend:** pont > vonal > terület, de a kérdés típusa elsőbbséget kap. *Javaslat: így.*
3. **Geodatabase:** a GDB-t a tulajdonos QGIS-szel (egy paranccsal) GeoPackage-be alakítja, és a pipeline GPKG-t és SHP-t olvas. *Javaslat: így.* Alternatíva: GDAL a fejlesztői környezetben; ez az adatellenőrzést a tulajdonos gépéhez kötné.
4. **Kérdésszöveg:** a típus a kérdésben, pl. „Keresd meg (folyó): Nílus”. *Javaslat: így.*
