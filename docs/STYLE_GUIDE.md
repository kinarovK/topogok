# Stílus és felületterv

## Vizuális irány

Modern, letisztult oktatási alkalmazás. A térkép a fő tartalom, nem illusztráció egy túlzsúfolt dashboardon. Kevés felületelem, rövid szövegek, finom kék/sárga hangsúlyok. Nincs kabala, hang, rezgés, konfetti, ranglista vagy versenyre ösztönző üzenet. A logó v1-ben lehet egyszerű TopoGok szójel és saját SVG térképjel; ne igényeljen külső szolgáltatást.

## Design tokenek – induló tervezői értékek

Ezek implementációkor kontrasztméréssel finomíthatók. A színek nem helyettesítik a szöveges állapotot.

| Token | Világos | Sötét | Rendeltetés |
|---|---|---|---|
| `background` | `#F5F7FA` | `#101827` | Oldal |
| `surface` | `#FFFFFF` | `#1B2738` | Kártya, dialógus |
| `text` | `#17253A` | `#F2F5FA` | Fő szöveg |
| `textMuted` | `#526176` | `#BAC5D4` | Másodlagos szöveg |
| `primary` | `#1855B6` | `#8FB8FF` | Interakció, fókusz |
| `onPrimary` | `#FFFFFF` | `#101827` | Primer gomb szövege |
| `accent` | `#EBC84B` | `#EBC84B` | Korlátozott dekoráció |
| `mapBackground` | `#EDF2F6` | `#111E2B` | Térkép környezete |
| `regionFill` | `#E5DFD2` | `#414B59` | Nyugalmi poligon |
| `regionBorder` | `#66717F` | `#A5B0BD` | Belső határ |
| `selectedFill` | `#9FC5FF` | `#315C91` | Beadás előtti semleges kijelölés |
| `wrongFill` | `#F4B3AE` | `#703C42` | Gyakorló hibás terület |
| `wrongText` | `#A32222` | `#FFB4AB` | Helytelen felirat |
| `correctFill` | `#A9DDB7` | `#285C45` | Gyakorló helyes terület |
| `correctText` | `#176238` | `#A0E7B5` | Helyes felirat |

System font stack: `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`; helyesen jelenítse meg az ő/ű és az ukrán і/ї/є/ґ betűket. Nincs külső fontkérés. Alapszöveg 16px, sorköz legalább 1.45. Cím 24–32px, kérdés 20–26px. Kis felirat 14px, lényegi információ ne ennél kisebb legyen. Gombmagasság legalább 44px, lehetőleg 48px. Távolságok 4/8/12/16/24/32px; kártyasugár 12px, gomb 8px. Visszafogott árnyék, ne minden doboz kapjon saját hangsúlyt.

## Képernyők és navigáció

### Főoldal

Fejléc: TopoGok, nyelvválasztó (Magyar / Українська), témaválasztó (Rendszer / Világos / Sötét). Rövid magyarázat: „Keresd meg a megnevezett területet a térképen.” Két elsődleges módválasztó: Gyakorlás és Számonkérés. Másodlagos „Térkép felfedezése”, Súgó és Névjegy/források. Nincs bejelentkezési gomb, statisztika vagy üres témakatalógus.

### Beállítás

Az egyetlen téma neve szövegként: Ukrajna közigazgatása. Kérdésszám választógombok: 5 / 12 / Mindegyik (27). Gyakorlásnál opcionális elteltidő-kijelzés. Számonkérésnél időkorlát: Nincs / 5 / 10 / 15 / 20 perc. Rövid szabályösszefoglaló, „Indítás” gomb. Nem kell jegyskála-választó vagy külön tanári oldal.

### Játék

Mobil álló nézet:

```text
TopoGok                 HU/UK   Téma
Gyakorlás · 3 / 12            [Idő]
Keresd meg: Rivnei terület
┌─────────────────────────────────┐
│                                 │
│            TÉRKÉP           [+] │
│                             [−] │
│                             [⤢] │
└─────────────────────────────────┘
Visszajelzés / próbálkozások
[Válasz véglegesítése]
[Mutasd meg]   [Újrakezdés] [Kilépés]
```

A rajz szerkezeti, nem pixelpontos. A nagyítás és az alapnézet ikonos gombjai (szöveges címkével) a térkép jobb szélén, egymás alatt vannak. Az alapnézet a gombok sávját kihagyja, így a vezérlők nem takarnak országrészt (2026-11-09; korábban a hosszú ukrán felirat Szevasztopolt takarta). A vizsgában a segítség és helyességi visszajelzés helye nem jelenik meg. Kérdésenként nincs teljes oldalugrás. A következő kérdésre lépéskor az ország alapnézetét visszaállítjuk; ez mindig ugyanúgy történik, a helyes választól függetlenül.

Desktopon a térkép domináns bal oldalon, a kérdés és vezérlők 300–360px széles jobb panelen. Legfeljebb 1280px széles tartalom. Mobilon egy oszlop, minimum támogatott szélesség 320 CSS px. `dvh` és safe-area kezelés; a Safari alsó sávja ne takarja a véglegesítő gombot. Kis vagy fekvő képernyőn megengedett függőleges görgetés, a térképen kívüli normál oldalgörgetés maradjon működőképes.

### Kis területek

**Tulajdonosi döntés (2026-11-09):** a Kijev és Szevasztopol betéttérkép kikerült a játékból és a felfedező nézetből; a két kis egység nagyítással (+ gomb, egérgörgő, csípő mozdulat) választható ki. A betétgombok minden kérdésnél nagy helyet foglaltak, miközben csak 2 kérdésnél volt rájuk szükség. A súgó elmagyarázza a nagyítást. A dokumentumtörténetben megmaradt az eredeti betétleírás (Git).

### Eredmény

Négy tömör adatblokk: időtartam, helyes/összes, százalék, vizsgán jegy vagy gyakorlásban pontszám. Gyakorlásban a felirat egyértelműen „Elsőre helyes”. Vizsgán például „9 / 12-es jegy”. „Új kör” és „Főoldal”. Nincs név, dátumnapló, megosztás, letöltés, ellenőrzőkód, részletes hibajegyzék vagy eredménytárolás. Időlejáratkor rövid „Lejárt az idő” magyarázat.

### Térkép felfedezése

Pontozatlan külön nézet, a térképnév-feliratok be/ki kapcsolhatók, területre kattintáskor a név olvasható. Nincs aktív kör közbeni tanulónézet: belépés előtt a körből ki kell lépni. Vizsgából nem lehet a megoldásokat megnyitni az aktív játék megőrzésével.

### Súgó és névjegy

Rövid szabályok, jegyképlet közérthetően, nincs eredménymentés, offline/telepítési segítség, app- és adatverzió, igazolt adatforrás/licenc. Technikai implementációs részletek és forrásfájl-útvonalak ne terheljék a tanulói felületet. Telepítés nem feltétele a használatnak; iOS és más böngészők eltérő telepítési lehetőségeire egyszerű segítség szolgál.

## Interakció és állapotok

- Betöltés: rövid szöveges állapot; nem indul el az óra, amíg a térkép nem választható.
- Hiba: közérthető üzenet és újrapróbálás; hibás adatból nem indul csökkentett kérdéssor.
- Kijelölés: kék kitöltés és erős körvonal, egységes mindkét módban. 
- Gyakorló visszajelzés: ikon és szöveg a szín mellett. Nincs automatikus következő feladat néhány másodperc után.
- Modális megerősítés: fókuszcsapda, kezdeti fókusz a biztonságos „Folytatom” gombon, Escape ezt választja; visszatéréskor fókusz helyreáll.
- 150–250ms áttűnés megengedett, térképre repülés nem szükséges. Reduced motion esetén azonnali váltás.
- Offline kész/frissítés elérhető: nem modalitást erőltető üzenet. Frissítés aktív körben nem választható, csak későbbre jelezhető.

## Hozzáférhetőség és korlátok

A HTML gombok, választók, navigáció és dialógusok billentyűzettel működnek; fókuszkeret mindig látható. Szövegkontraszt cél 4.5:1, nagy szöveg és lényegi UI-állapot 3:1, tényleges méréssel. A hibajelzés `aria-live` használatával közölhető, vizsgán kizárólag semleges haladás közölhető. A másodpercenkénti órát nem szabad folyamatosan felolvastatni.

A teljes képernyőolvasós térképes vizsga és alternatív nem vizuális kérdéstípus nem v1 scope. Nem szabad teljes WCAG AA megfelelőséget állítani. A korábbi teljes poligon-billentyűzetes navigációs javaslat a tulajdonos egyszerűsítési döntése alapján nem kötelező v1-funkció.
