# 0004 – Kontinensek topója (világtérkép)

Dátum: 2026-11-11. Állapot: megvalósítva a `feat/continents-topic` ágon, tulajdonosi PR-jóváhagyásra vár.

## Tulajdonosi kérés és döntések (2026-11-11)

- Új, harmadik téma a főoldalon „Kontinensek topója” címmel. Ukránul: „Материки та океани”.
- Kérdezhető egységek: 6 kontinens (Észak-Amerika, Dél-Amerika, Afrika, Eurázsia, Ausztrália, Antarktisz) és **5 óceán**: Csendes-, Atlanti-, Indiai-óceán, Északi-Jeges-tenger, Déli-óceán.
- A kontinentális szigetek a kontinens részei, például Grönland, Madagaszkár, a Brit-szigetek, Japán, Indonézia, Új-Guinea és Tasmánia. Az óceáni szigetek szürke háttérként jelennek meg: Új-Zéland, Hawaii, Fidzsi, Vanuatu, Salamon-szigetek, Új-Kaledónia, Bismarck-szigetek, Kerguelen.
- A térkép sík világtérkép, a gömbnézetet a tulajdonos elvetette. A preview után a tulajdonos döntése (2026-11-11): a Mercator helyett **Robinson-vetület**, mert a Mercator a sarkvidéket túlzottan torzította.
- Preview-visszajelzés: a feliratok nem fedhetik egymást (a Déli-óceán és az Antarktisz felirata egybeesett), és az óceánok felirata nem lóghat rá a kontinensekre.
- Kérdésszám: 5 vagy Mindegyik (11), a tektonikai témához hasonlóan.

## Adatforrás

A tulajdonos a `shp/` mappába két fájlt tett: `ne_110m_land` és `ne_110m_ocean`. Mindkettő Natural Earth 1:110m, v4.1.0, **közkincs** („All versions of Natural Earth … are in the public domain”, naturalearthdata.com/about/terms-of-use). Az eredeti fájlokat nem módosítottuk.

A forrásokból két dolog hiányzott:
- Az óceánfájl egyetlen, felosztatlan világóceán, a Kaszpi-tengerrel együtt. Ezért a pipeline csak a szárazföldi fájlt használja; az óceán a szárazföld komplementere.
- A szárazföldi fájlban Afrika és Eurázsia, illetve a két Amerika egy-egy összefüggő poligon.

## Levezetés (`npm run data:world`)

1. `scripts/data/world/derive.py` (Python, numpy) egy síkbeli elrendezésbe teszi a partvonalakat, a kép keretét és a vágóvonalakat. Minden metszéspont közös csúcs lesz, majd minden lap címkét kap, és az azonos címkéjű lapok összeolvadnak. Ezért a kontinensek és az óceánok pontosan ugyanazon a partvonalon érintkeznek.
   - **Kontinenshatár:** a Szuezi-földszoros és a Panama–Kolumbia határ. A szigetek besorolása a szkriptben lévő táblázatban van.
   - **Óceánhatárok** (egyszerűsített, oktatási vonalak; szárazföldön láthatatlanok):
     - Déli-óceán: a 60. déli szélességtől délre.
     - Atlanti- és Csendes-óceán: a Horn-fok meridiánja (67,27° Ny).
     - Atlanti- és Indiai-óceán: az Agulhas-fok meridiánja (20° K).
     - Indiai- és Csendes-óceán: Maláj-félsziget – Szumátra – Jáva – Kis-Szunda-szigetek – Timor – Ausztrália – Bass-szoros – Tasmánia, majd a 146,92° K meridián.
     - Északi-Jeges-tenger: Beringi-szoros, Fury and Hecla-szoros, Davis-szoros, Dán-szoros, Izland – Feröer – Shetland – Norvégia. A Hudson-öböl az Atlanti-óceánhoz tartozik, a Norvég- és a Barents-tenger az Északi-Jeges-tengerhez.
     - A Kaszpi-tenger nem óceán: se nem válasz, se nem háttér.
   - **Kimenetek:**
     - `build/world/units.geojson` és `background.geojson`: szárazföld, szürke alap;
     - előnézeti kép;
     - GIS-ellenőrzéshez: `world_continents.shp` és `world_oceans.shp`, `id`, `name_hu`, `name_uk` mezőkkel.
2. `scripts/data/world/build.ts` ellenőrzi az eredményt, majd megírja a `public/data/world-continents/2026.11.11.1/` csomagot. Ellenőrzések:
   - 11 egység, helyes hu/uk nevek és típusok (`continent` / `ocean`);
   - geometriai érvényesség;
   - a szárazföld és a víz területe hiánytalanul lefedett;
   - 1°-os mintavételezés: nincs átfedés, nincs óceán nélküli víz, minden kontinens szárazföldön van.

   A `--check` mód bájtra azonos újragenerálást követel. Ez a CI `data:validate` lépésében fut.

## Vetület és feliratok

- A MapLibre csak Web Mercatort tud rajzolni. Ezért a pipeline a Robinson-vetületű képet előre „átveti”: minden csúcspontot arra a hosszúság–szélesség párra tesz, amelynek Mercator-képe a Robinson-pozíciója (`derive.py`, `display_package`). A csomag tehát kijelző-koordinátákat tartalmaz, nem földrajziakat (`manifest.projection = robinson-display`). A földrajzi ellenőrzések a `build/world` földrajzi adatain futnak. A Robinson-kép a Mercator-világ felére van kicsinyítve, hogy bármilyen képarányú térképdobozban egészben látsszon.
- A feliratok helyét a pipeline számolja ki (`label`, `labelMinZoom`, `labelWidth` nyelvenként). A felirat doboza a saját egységén belül, a lehető legkisebb méretaránynál fér el; hosszabb nevek szóköznél vagy kötőjelnél tördelődnek. A doboz így se más egységre, se más feliratra nem lóghat. Ahol a felirat az adott nagyításon nem férne el, ott rejtve marad, és nagyításkor jelenik meg. Asztali gépen ilyen csak az Északi-Jeges-tenger, mert a sarki sávja Robinson-vetületben keskeny. Telefonon az alapnézetben a nevek egy nagyítás után jelennek meg.

## Alkalmazásváltozások

- Új régiótípusok: `continent`, `ocean`. Az óceánok vízszínnel jelennek meg. A háttérréteg azonosítója már nem csak `UA` lehet.
- Az egységeknek előre kiszámolt feliratpontja és minimális nagyítása lehet. A térképi feliratoknál a `MapView` ennél kisebb nagyításon elrejti őket.
- Világméretű témánál nincs pásztázási korlát (`maxBounds`), mert a MapLibre a világ szélességű korláttal nem talál érvényes kamerát. Az alapnézet gomb mindig visszaállít.

## Ellenőrzés

- Egységteszt: a csomag betölthető a futásidejű ellenőrzővel, a nevek és a forrásadatok stimmelnek, minden címkepont látható.
- E2E (1366×768):
  - mind a 11 egység kijelölhető (1100/1100);
  - Új-Zéland és a Kaszpi-tenger nem válasz;
  - ukrán számonkérés: 4/5 → 10 pont;
  - asztali gépen és telefonon a látható feliratok nem fedik egymást.
- Képernyőképek: `reports/screenshots/continents-*.png`.
- Fizikai telefonos próba: NOT RUN.
