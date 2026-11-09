# TopoGok – termékleírás

## Cél

A TopoGok rövid térképes feladatokkal segíti Ukrajna földrajzának tanulását. A felhasználó egy megnevezett területet keres meg a térképen. Ugyanaz az alkalmazás használható önálló otthoni tanulásra, tanórai gyakorlásra és tanári felügyelettel értékelt számonkérésre. Nincs meghatározott célkorosztály.

A v1 célja egy teljes, gyorsan indítható közigazgatási téma. A tartalom nem a használó által importált fájlokból születik: a fejlesztő ellenőrzött adatcsomagot állít elő a meglévő shapefile-okból, és az alkalmazással együtt adja ki.

## Használati történetek

1. Otthoni gyakorlóként kiválasztok 5, 12 vagy minden területet, majd a térképen válaszolok. A hibáimból azonnali visszajelzéssel tanulok, a kör végén újra próbálom őket.
2. Tanórai használóként telefonon, táblagépen vagy számítógépen gyorsan elindítom ugyanazt a témát. A kis területeket (Kijev, Szevasztopol) ránagyítva választom ki.
3. Tanárként szóban megadom a kérdésszámot és az időkorlátot. A tanuló ugyanazt a közös felületet használja, a végén megmutatja a százalékot és az 1–12-es jegyet.
4. Ukrán nyelvű használóként minden utasítást és területnevet ukránul kapok, és bármikor válthatok magyarra.
5. Korábbi sikeres letöltés után internet nélkül is lejátszom a teljes témát. A frissítés nem szakítja félbe a futó számonkérést.

## Első kiadás

| Terület | V1 tartalom |
|---|---|
| Téma | Közigazgatás: 24 terület, Krími Autonóm Köztársaság, Kijev és Szevasztopol; 27 kérdezhető egység |
| Kérdés | Megnevezett poligon megkeresése és kiválasztása |
| Gyakorlás | 3 kísérlet, segítség, hibaismétlés, pontszám és elsőre helyes arány |
| Számonkérés | Egyszeri végleges válaszok, opcionális határidő, százalék és ukrán skálájú jegy |
| Felület | Magyar/ukrán, reszponzív, világos/sötét/rendszer téma |
| Platform | Böngésző és telepíthető PWA, azonos alkalmazás mobilon és asztali gépen |
| Tartalomkiadás | Fejlesztői előfeldolgozás, verziózott adatcsomag |
| Adatkezelés | Csak nyelv/téma beállítás tartós; játék és eredmény kizárólag memóriában |

## Kifejezetten nem része

Fiók, szerepkör, tanulóadat, központi eredményküldés, napló, eredménytörténet, export vagy nyomtatási nézet, statisztika, analitika, reklám, ranglista, tanári dashboard, közös kérdéssorlink, QR, csalásbiztos távoli vizsga, felhasználói tartalomfeltöltés, folyó/pontréteg feladat, hang, rezgés, natív Android/iOS build.

## Termékhang és térkép

Egyszerű, nyugodt, oktatási célú felület; nem gyerekes és nem versenyjáték. Rövid, tárgyilagos visszajelzések. Ukrajna teljes területe megjelenik; nincs politikai magyarázat, területi vita vagy katonai helyzet jelölése. A forrásoldal csak az adatok eredetét, licencét és verzióját közli, ha ez igazolható.

## Siker fogalma

Az első használó segítség nélkül eljut egy 5 kérdéses kör végéig. A pontozás kiszámítható, a felület nem árulja el a számonkérés válaszait, a 27 egység mindegyike kényelmesen választható. A teljes feladatkör két nyelven, két témában, kis kijelzőn és offline is végigjátszható. A megvalósítás minőségét tesztek és kézi próbák igazolják, nem felhasználókövetés.

## Későbbi irányok – nem vállalt v1 feladatok

További poligontémák, vízrajz és tektonika; folyók és pontobjektumok saját találati szabályokkal; más kérdéstípusok; megosztható kérdéssor; helyi statisztika külön jóváhagyás után. Később autentikáció, tanulói/tanári jogosultság, csoportok, szerveroldali eredmények és ranglista is készülhet. Supabase lehetséges későbbi szolgáltató, jelenleg nem függőség és nem rögzített beszerzési döntés.
