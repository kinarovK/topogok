# 0005 – Vegyes elemtípusok: terület, vonal (folyó) és pont egy térképen

Dátum: 2026-11-16. Állapot: **terv, a tulajdonos döntéseivel (9. pont) frissítve, jóváhagyásra (docs PR)**.

## Tulajdonosi kérés (2026-11-16)

- Egy témában (például egy kontinens) a kérdezhető elemek lehetnek **területek** (ország, nagytáj, tó), **vonalak** (folyó) és **pontok** (szélső pont, város).
- A tartalom még nincs eldöntve. Az adatot a tulajdonos később **SHP vagy geodatabase** formában (vagy GeoJSON-ra alakítva) adja meg. Most a szoftvert kell felkészíteni arra, hogy ezeket egy térképen kezelje.
- Kiemelt cél: a vékony elemeknek (folyó) és a pontoknak **kattintási puffere** legyen, hogy telefonon is könnyen el lehessen találni őket.
- Az adatbevitel legyen **egyszerű**:
  - egy SHP egy réteg a TopoGokban;
  - egy geodatabase egy kérdéssor, akármilyen geometriatípusok vannak benne.

## 1. Mi változik és mi nem

| Rész | Változik? |
|---|---|
| Adatmodell, adat-előkészítő pipeline | **igen**: vonal és pont geometria, konvenció alapú betöltés (SHP, GeoJSON, GeoPackage) |
| Térkép: rajzolás, kiemelés, kattintás | **igen**: új rétegek, pufferes találatkeresés |
| Szuperadmin-beállítás | **igen**: pufferméret (9. pont, 1. döntés) |
| Felfedezés-feliratok | **igen**: vonal menti és pont melletti felirat |
| Kérdés szövege | **nem**: marad a „Keresd meg: Nílus”, típus nélkül (9. pont, 4. döntés) |
| Tanári elemkészlet (F4) | kicsit: a lista réteg szerint csoportosít |
| Játékszabályok, pontozás, mentés és újrajátszás (F3), toplista (F5), oldalelhagyás (F6) | **nem**: ezek csak azonosítókkal dolgoznak |
| Szerver kérdéskezelése | nem: a `TOPIC_FEATURES` csak azonosítókat tartalmaz |

## 2. Adatmodell

A téma `regions.geojson` fájlja (a név a kompatibilitás miatt marad) vegyes elemeket tartalmazhat. Minden elemnek egyedi `id`-je és kötelező `names.hu` / `names.uk` mezője van, mint eddig. Új mezők:
- `geomType`: `area` (`Polygon`/`MultiPolygon`), `line` (`LineString`/`MultiLineString`) vagy `point` (`Point`);
- `layer`: annak a forrásrétegnek a neve, ahonnan az elem jön (pl. `folyok`). Ez csak a tanári lista csoportosításához és a rajzolási sorrendhez kell, a diák nem látja.

A régi témák (Ukrajna, tektonika, kontinensek) adata változatlanul érvényes: ahol nincs `geomType`, ott az `area`.

## 3. Adatbevitel – egyszerű, konvenció alapú

Az elv: **egy forrás = egy kérdéssor (téma)**. Minden réteg, akármilyen geometriájú, ugyanabba a kérdéssorba kerül.

| Amit a tulajdonos ad | Amivé a TopoGokban lesz |
|---|---|
| egy **SHP** (vagy **GeoJSON**) fájl | egy réteg a témában; a geometriatípust a program a fájlból olvassa ki |
| több SHP/GeoJSON egy mappában | egy téma, mappán belül fájlonként egy réteg |
| egy **geodatabase** | egy téma; minden benne lévő réteg (feature class) egy kérdéssorba kerül, geometriatípustól függetlenül |

**Mezőnév-konvenció**, ugyanaz minden rétegben:
- `id`: egyedi azonosító;
- `name_hu`, `name_uk`: a nevek.

Ha egy forrásban más a mezőnév, a téma leírójában rétegenként egy sorral átnevezhető. Ha nincs `id`, a program képez egyet (rétegnév + sorszám), és ezt a jelentésben feltünteti.

**Háttér:** a `hatter` (vagy `background`) nevű réteg nem kérdezhető, csak a térkép alapja (pl. a kontinens körvonala). Ha nincs ilyen, a háttér a területek egyesítése.

**A téma leírója** (`scripts/data/<téma>/topic.ts`) csak ennyi:
- a téma magyar és ukrán címe;
- az adatverzió;
- a kérdésszám-opciók;
- a vetület;
- szükség esetén mezőnév-átnevezések, és hogy egy terület-réteg „lefedő”-e (pl. országok: rés és átfedés nélkül).

A rétegeket nem kell felsorolni, a program a mappából vagy a fájlból maga olvassa ki őket.

**Formátumok:**
- **SHP:** a meglévő, függőség nélküli olvasónk bővül vonallal (shape type 3) és ponttal (1), a Z/M változatokkal együtt (13, 11, 23, 21; a magasságot eldobjuk).
- **GeoJSON:** közvetlenül olvasható. A tulajdonos tervei szerint úgyis erre alakít, ez a legegyszerűbb út.
- **Geodatabase:** zárt formátum, csak GDAL-lal olvasható megbízhatóan, és az nincs a pipeline-ban. A gépeden lévő QGIS egy paranccsal **GeoPackage**-be alakítja, minden réteggel együtt:
  ```bat
  "C:\Program Files\QGIS 4.2.2\bin\ogr2ogr.exe" -f GPKG afrika.gpkg afrika.gdb
  ```
  A GeoPackage szabványos SQLite-fájl. A pipeline a Node beépített `node:sqlite` moduljával és egy saját WKB-olvasóval olvassa, új függőség nélkül. Egy GPKG = egy téma, mint a geodatabase.

**Ellenőrzés:**
- elemtípustól függetlenül:
  - egyedi azonosító az egész témában;
  - nem üres, NFC-normalizált hu/uk név;
  - véges koordináták;
  - földrajzi WGS 84; más CRS esetén érthető hibaüzenet, nincs csendes átvetítés;
- `line`: legalább 2 különböző pont, nincs nulla hosszú szakasz, egyszerűsítés után sem fogy el;
- `point`: a téma határain belül van;
- `area`: a mostani OGC-szabályok szerint; lefedő rétegnél a szigorú él-ellenőrzés is.

**Méretkeret:** a vonalak egyszerűsödnek (az eddigi algoritmussal, rétegenként állítható tűréssel), egy téma tömörítve legfeljebb kb. 1,5 MB. A jelentés rétegenként kiírja a típust, a darabszámot és a méretet, így rögtön látszik, mi került be.

**Vetület:** témánként állítható. Afrikához elég a Web Mercator, a világtérképnél marad a Robinson.

## 4. Térkép-megjelenítés

Rétegsorrend alulról felfelé:
1. háttér;
2. területek kitöltése és határa;
3. **vonalak** (folyó: kék, a nagyítással vastagodó vonal);
4. **pontok** (kör fehér kerettel).

- **Állapotok** mindhárom típusra: alap, kijelölt, hibás, helyes, kikapcsolt (F4: szürke, nem kattintható). Vonalnál és pontnál a kijelölést vastagabb vonal, illetve nagyobb kör és **jól látható gyűrű** jelzi.
- **Felfedezés mód:** a folyónév a vonal mentén, a pontnév a pont mellett jelenik meg. Ütközéskor a kisebb prioritású felirat elmarad.

## 5. Kattintási puffer – a fő mechanizmus

**Pufferméret:**
- **képernyő-képpontban** értendő, így a nagyítási szinttől függetlenül ugyanakkora ujjnyi terület marad;
- kétféle érték van: **érintésre** (`pointer: coarse`) és **egérre** (`pointer: fine`);
- kezdőérték 22 px, illetve 10 px.

**A szuperadmin állítja (1. döntés):**
- **Hol:** a „Beállítások” fülön két számmező, határokkal (érintés: 8–48 px, egér: 4–30 px) és „Alapérték” gombbal. A módosítás naplózott.
- **Tárolás:** a szerver egy kis `app_settings` táblában tárolja.
- **Hogyan jut el a kliensekhez:** a már meglévő `/api/me` válaszban, amelyet vendégként is lekér az alkalmazás indításkor. Új kérés nincs.
- **Hálózat nélkül** a kezdőérték, illetve a legutóbb kapott érték él.

**Algoritmus koppintáskor** (tiszta függvény, `src/map/hitTest.ts`, unit-tesztelhető):
1. A MapLibre lekéri a koppintás körüli, `2 × puffer` oldalú négyzetbe eső vonalakat és pontokat, valamint a koppintás alatti területeket.
2. Minden jelölt vonalra és pontra kiszámoljuk a **valódi képernyő-távolságot** (képernyőre vetítés, pont–szakasz távolság). Csak a pufferen belüliek maradnak.
3. **Választás** (2. döntés: a kérdések sorrendje ugyanúgy véletlenszerű, mint most; a típusokat semmi nem sorolja előre):
   - a pufferen belüli **legközelebbi pont vagy vonal** nyer, mert a vékony elem különben eltalálhatatlan volna (alatta mindig van egy terület);
   - ha a pufferen belül nincs pont vagy vonal, a koppintás alatti **terület** nyer;
   - holtversenyben a stabil azonosítósorrend dönt;
   - a választás nem függ a kérdéstől: sem a helyes választól, sem a kérdezett elem típusától. Mivel a típus nem jelenik meg (4. döntés), a típus alapján sem szabad „segíteni”;
   - ha a koppintás egy folyó vagy pont pufferén belül van, de a diák a terület-t akarja, kicsit arrébb kell koppintania; ezt a gyakorlás azonnal megmutatja;
   - a puffer szélén kívül, és ha terület sincs, nincs találat, a meglévő kijelölés megmarad;
   - kikapcsolt (F4) elem nem jelölt.
4. Kiegészítők:
   - Kurzor egérnél: mutató, ha a puffer talál valamit.
   - Nagyításkor a pontok és vonalak kissé nőnek, a puffer marad.
   - A nagyítás és a teljes képernyő segít, ha két elem nagyon közel van (pl. torkolat).

## 6. Kérdés és visszajelzés

- **A kérdés szövege nem változik:** „Keresd meg: Nílus”. A típus nem jelenik meg (4. döntés).
- **A kérdések sorrendje** a mostani véletlen keverés, a típusok vegyesen jönnek (2. döntés).
- **Gyakorlás:** a „Mutasd meg” és a helyes válasz kiemelése vonalnál és pontnál is jól látható. Ha az elem a nézeten kívül van, a térkép odaúszik.
- **Tanári elemlista (F4):** a „Témák” fül réteg szerint csoportosít (pl. Országok / Folyók / Szélső pontok), csoportonkénti „Mind” / „Egyik sem” gombbal.

## 7. Tesztelés

- **Unit:**
  - WKB- és GeoPackage-olvasó;
  - SHP vonal/pont (Z/M);
  - konvenció alapú rétegbeolvasás;
  - validáció;
  - képernyő-távolság;
  - a választási szabályok: legközelebbi pont/vonal; terület csak puffer-találat nélkül; kikapcsolt elem; pufferen kívül nincs találat; független a kérdéstől.
- **API:** a szuperadmin állíthatja a puffert (határok, napló), más nem; a `/api/me` vendégnek is visszaadja.
- **Tesztadat:** egy kis, **csak tesztekben használt mesterséges téma**:
  - két réteg SHP-ből és egy GeoJSON-ból;
  - egy kis GeoPackage több réteggel;
  - két közeli folyó, néhány pont.

  Ez nem jelenik meg a felhasználóknak.
- **E2E (Chromium, telefonos nézet):**
  - koppintás a folyótól 15 px-re kijelöli a folyót, 40 px-re már a terület jelölődik ki;
  - a pufferérték szuperadmin általi módosítása után a határ ennek megfelelően mozdul;
  - egy teljes vegyes kör menthető, újrajátszható és toplistás.
- **Valódi eszköz:** a pufferérték finomhangolása a tulajdonos próbája után, már a felületről.

## 8. Végrehajtás

Egy ágon, `staging` + egy PR módszerrel, ahogy F4–F6:
1. **M1 – adat:**
   - geometriatípusok;
   - konvenció alapú betöltés (SHP, GeoJSON, GPKG);
   - validáció, jelentés, teszttéma.
2. **M2 – térkép:**
   - rétegek és stílusok;
   - pufferes találatkeresés;
   - felfedezés-feliratok.
3. **M3 – beállítás és kiegészítések:**
   - szuperadmin pufferbeállítás;
   - csoportosított F4-lista;
   - E2E, dokumentáció.
4. **Később, külön feladat:** az Afrika (vagy más kontinens) téma a tulajdonos adataiból.

## 9. Tulajdonosi döntések (2026-11-16)

1. **Pufferméret:** a szuperadmin módosíthatja a felületről (5. pont). Kezdőérték: 22 px érintés, 10 px egér.
2. **Sorrend:** véletlenszerű, mint minden más.
   - A kérdések sorrendje vegyes és véletlen.
   - A koppintáskor nincs típus szerinti elsőbbség. A pufferen belüli legközelebbi pont vagy vonal nyer, különben a terület (5. pont).
3. **Adatbevitel:** egyszerű, konvenció alapú (3. pont).
   - Egy SHP vagy GeoJSON egy réteg.
   - Egy geodatabase (GeoPackage-be alakítva) egy kérdéssor, geometriatípustól függetlenül.
   - A mezőnevek `id`, `name_hu`, `name_uk`.
4. **A típus nem jelenik meg** a kérdésben: „Keresd meg: Nílus”.
