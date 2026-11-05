# Térképi adatszerződés és feldolgozás

## Ellenőrzött bemenet – 2026-11-05

| Fájlcsoport | Szerep | Darabszám | CRS | OGR geometria |
|---|---|---:|---|---|
| `shp/ukraine_country_boundary.*` | ország háttér | 1 | EPSG:4326 | Polygon |
| `shp/ukraine_oblasts.*` | kérdezhető területek | 27 | EPSG:4326 | Polygon |

Mindkettő extentje: hosszúság 22.132840–40.159543, szélesség 44.381049–52.368949. Az OGR bemeneti tengelyleírása mellett a GeoJSON koordinátasorrend kötelezően `[longitude, latitude]`. A 27 elemnél az `iso_3166_2`, `name_hu`, `name_uk` kiolvasása megtörtént. 2026-11-05-én a pipeline (`scripts/data/build.ts`) lefutott: a geometria érvényes, és a 27 egység élről élre lefedi az országpoligont (területeltérés 0,003 m²); részletek: `reports/data-validation.md`. GDAL/GEOS-os keresztellenőrzés még nem történt (lásd lent). A külső eredet nincs igazolva.

A `.shp/.shx/.dbf/.prj` együtt szükséges. Az oblasts `.cpg` UTF-8; a country `.cpg` jelenleg hiányzik, de annak örökölt szöveges attribútumait nem exportáljuk. Az eredeti forrásfájlok változatlan inputok; a feldolgozás új célfájlokba ír. A `backups` nem webes tartalom.

## Kötelező azonosítók és elfogadott névlista

Ez a meglévő attribútumtábla szerinti v1 névlista. Nem állít külső nyelvészeti vagy hivatalos névjegyzék szerinti ellenőrzést. Eltérés esetén a fejlesztő ne találjon ki új neveket; dokumentálja a javasolt javítást.

| ID | Magyar | Українська |
|---|---|---|
| UA-05 | Vinnicjai terület | Вінницька область |
| UA-07 | Volinyi terület | Волинська область |
| UA-09 | Luhanszki terület | Луганська область |
| UA-12 | Dnyipropetrovszki terület | Дніпропетровська область |
| UA-14 | Donecki terület | Донецька область |
| UA-18 | Zsitomiri terület | Житомирська область |
| UA-21 | Kárpátalja | Закарпатська область |
| UA-23 | Zaporizzsjai terület | Запорізька область |
| UA-26 | Ivano-frankivszki terület | Івано-Франківська область |
| UA-30 | Kijev | Київ |
| UA-32 | Kijevi terület | Київська область |
| UA-35 | Kirovohradi terület | Кіровоградська область |
| UA-40 | Szevasztopol | Севастополь |
| UA-43 | Krími Autonóm Köztársaság | Автономна Республіка Крим |
| UA-46 | Lvivi terület | Львівська область |
| UA-48 | Mikolajivi terület | Миколаївська область |
| UA-51 | Odesszai terület | Одеська область |
| UA-53 | Poltavai terület | Полтавська область |
| UA-56 | Rivnei terület | Рівненська область |
| UA-59 | Szumi terület | Сумська область |
| UA-61 | Ternopili terület | Тернопільська область |
| UA-63 | Harkivi terület | Харківська область |
| UA-65 | Herszoni terület | Херсонська область |
| UA-68 | Hmelnickiji terület | Хмельницька область |
| UA-71 | Cserkaszi terület | Черкаська область |
| UA-74 | Csernyihivi terület | Чернігівська область |
| UA-77 | Csernyivci terület | Чернівецька область |

**Ne használd az `adm1_code` mezőt alkalmazásazonosítóként.** A forrás egyes örökölt kódjai más országprefixet hordoznak; az `admin`/`sov_a3` alapú szűrés elveszíthet szükséges területeket. Kizárólag a fenti 27 `iso_3166_2` ID egyezése fogadható el. A country DBF az összevonásból örökölt régióattribútumokat tartalmaz: ezeket teljesen cseréljük saját ország-metaadatra a kimenetben, nem a bemenetben.

## Webes csomag

Javasolt könyvtár: `public/data/ukraine-administration/<dataVersion>/`. Fájlok: `manifest.json`, `country.geojson`, `regions.geojson`. A manifestet a build az alkalmazáshoz rögzíti; nincs futás közbeni külső „latest” lekérdezés. A pipeline azonos bemenettel és azonos eszközverziókkal azonos rendezett kimenetet készít. V1 alaphelyzetben nincs geometriaegyszerűsítés: a bemenet kicsi, előbb mérjünk.

GeoJSON FeatureCollection, Polygon vagy MultiPolygon elfogadott, érvényes, nem üres geometriával. Az `id` és `properties.id` ugyanaz a stabil string. A többi DBF mezőt nem kell a böngészőbe továbbítani.

```ts
type Locale = 'hu' | 'uk';
type LocalizedText = { hu: string; uk: string; en?: string };
type RegionProperties = {
  id: string; // iso_3166_2
  names: LocalizedText;
  kind: 'oblast' | 'autonomous-republic' | 'city';
};
// Feature<Polygon | MultiPolygon, RegionProperties> + id:string
// Country: id:'UA', properties:{id:'UA', names:{hu:'Ukrajna',uk:'Україна'}}

type TopicManifest = {
  schemaVersion: 1;
  id: 'ukraine-administration';
  dataVersion: string;
  title: LocalizedText;
  geometryKind: 'polygon';
  featureCount: 27;
  bounds: [number, number, number, number]; // west,south,east,north
  layers: {
    background: { path: string; sha256: string };
    questions: { path: string; sha256: string };
  };
  insets: Array<{ id: string; anchorFeatureId: string;
    title: LocalizedText; bounds: [number,number,number,number] }>;
  provenance: { source: string | null; sourceUrl: string | null;
    license: string | null; licenseUrl: string | null;
    status: 'unverified' | 'verified';
    ownerStatement?: { hu: string; uk: string } }; // tulajdonosi közlés, nem ellenőrzött forrásadat
};
```

A példaséma szerződés, nem kész kód. A JSON-ban a hiányzó adatot `null` vagy a sémában megengedett elhagyás jelöli, nem kitalált URL. A későbbi topic típus-diszkriminátor kiterjeszthető line/point típusra, de azok feldolgozója és találati logikája nem v1-feladat.

`kind`: UA-30/UA-40 city, UA-43 autonomous-republic, minden más oblast. `name_en` megőrizhető opcionális `en` értékként; nem tesz angol UI-t elérhetővé. GeoJSON címkékhez nem kell előre centroidot beégetni; a renderelő a nézetben kezeli a címkézést. Betét bounds a város bboxa körüli, dokumentált paddinggel képzett nézet, vizuális ellenőrzéssel; nem másol vagy mozdít át geometriát.

## Pipeline lépései

1. Ellenőrizd a fájlcsoport teljességét, olvashatóságát és CRS-ét. Hash-eld a forrásösszetevőket.
2. GDAL/OGR eszközökkel olvasd és exportáld ideiglenes kimenetbe, explicit EPSG:4326 céllal. Helyi ismert eszköz: `C:\Program Files\QGIS 4.2.2\bin\ogrinfo.exe`; a futtatható elérési út konfigurálható legyen.
3. Ellenőrizd az ID-k pontos halmazát, a két nyelvi mező nem üres UTF-8 tartalmát, egyediségét és a country 1 elemét.
4. Futtass geometriavalidációt GDAL/GEOS támogatással: érvényesség, üresség, véges koordináták, gyűrűk, holes, Polygon/MultiPolygon. Hibánál állj meg; ne javíts és ne dobj el objektumot csendben.
5. Hasonlítsd az országpoligont a 27 egység uniójához; vizsgáld a rés/átfedés mennyiségét projektált területméréssel. Jelentsd a négyzetméter eltérést. Induló tűrés legfeljebb 1 m² numerikus maradvány; efölött kézi vizsgálat és dokumentált döntés kell, nem automatikus geometriajavítás.
6. Whitelisteld a kimeneti mezőket, rendezd az elemeket ID szerint, normalizáld a JSON szerializálást. A forrásnevek ékezeteit ne transzliteráld, Unicode NFC normalizálás megengedett.
7. Számold a kimeneti SHA-256 értékeket, készíts manifestet és külön fejlesztői validációs jelentést a forráshashekkel, eszközverzióval, transzformációkkal és eredményekkel.
8. Csak sikeres ellenőrzés után cseréld az adott generált csomagot; a források és korábbi csomagok ne sérüljenek részleges hibánál.

A feldolgozó előfeltételeit és GDAL-verzióját rögzíteni kell. Node appbuild ne függjön a fejlesztő Windows QGIS abszolút útjától: az ellenőrzött generált csomag verziókövethető, CI-ben külön adatjob regenerálja és diffeli rögzített eszközkörnyezettel. A böngésző nem olvas SHP-t.

## Megvalósított pipeline és eltérés (2026-11-05)

A 2. és 4. lépés GDAL/OGR és GEOS használatát írja elő. A megvalósítási környezetben ezek nem voltak elérhetők, ezért függőség nélküli SHP/DBF-olvasó és OGC-szabályokat követő validátor készült (`scripts/data/`). Az 5. lépés rés/átfedés-mérése helyett élhalmaz-egyezést vizsgál: a régióélek nem metszik egymást, minden él legfeljebb két régióé, a csak egyszer használt élek halmaza pontosan egyezik az országhatár éleivel. Emellett ellipszoidi területtartó vetületben területkülönbséget is mér. Az eredmény 0 metszés, 0 eltérő él és 0,003 m² területkülönbség. Az ismételt futás bájtra azonos kimenetet ad (`npm run data:validate`). A tulajdonos gépén futtatható GDAL-os keresztellenőrzés parancsa a `scripts/data/README.md`-ben van; **lefuttatása nyitott feladat**.

Betétnézetek: a város bboxa minden oldalon a hosszabbik oldal 60%-ával bővítve (`INSET_PADDING_RATIO = 0.6`). A vizuális ellenőrzés a térképes szakasz feladata.

Megfigyelés, nem forrásigazolás: a DBF mezőnevei (`featurecla`, `adm1_code`, `ne_id`, `wikidataid`, `name_*`) a Natural Earth Admin-1 adatkészlet sémájához hasonlítanak. Ebből nem következik sem a forrás, sem a licenc.

## Licenc és publikálási állapot

**Tulajdonosi közlés (2026-11-05):** a tulajdonos szerint a térképek nyílt források alapján, oktatási célra vektorizált adatok. Konkrét forráslinket vagy licencmegjelölést nem adott. A közlést rögzítjük (`manifest.json` → `provenance.ownerStatement`, Névjegy oldal), de független ellenőrzés nem történt. A `source`, `sourceUrl`, `license`, `licenseUrl` értéke `null`, a `status` értéke `unverified`. A helyi implementációt és tesztelést ez nem akadályozza. Nyilvános kiadás előtt a konkrét forrás és a felhasználási feltételek ellenőrzése külön feladat.

A felhasználó megadta a fájlok helyét, de eredeti adatkiadót vagy licencet nem. Ezt a dokumentum nem pótolja. A fejlesztő keressen mellékelt metaadatot, és ha az nem igazolja a terjesztést, kérje az eredeti letöltés helyét. A GeoJSON-vá alakítás nem oldja fel a licenckérdést. Amíg nincs igazolás, lokális használat és tesztelés folytatható, nyilvános adatcsomag/repó/deploy nem tekinthető kiadásra késznek.
