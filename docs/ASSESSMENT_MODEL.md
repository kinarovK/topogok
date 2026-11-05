# Játékmenet és értékelés

Ez a dokumentum a pontozás és időzítés egyetlen normatív részletes leírása. Mindkét mód ugyanazon 27 feature ID-val dolgozik. A megjelenített név nem azonosító.

## Konfiguráció és sorsolás

Kérdésszám: 5, 12, `all`; `all` a téma kérdezhető objektumainak száma. A 27 elem egyenletes véletlen keveréséből vesszük az első N-et. Fisher–Yates jellegű keverés, nem `sort(() => random - 0.5)`. A véletlengenerátor tesztben injektálható. Egy alapkörön belül nincs ismétlés. Két külön kör véletlenül lehet azonos; a teszt ne követeljen lehetetlen abszolút eltérést.

Alapbeállítás: 12 kérdés. Gyakorlás: nincs határidő, az eltelt idő kijelzése opcionális, alapból ki. Számonkérés: nincs vagy 5/10/15/20 perc. Nincs feladatsorlink, közös seed vagy tanári konfigurációs jogosultság.

Mindkét módban egy érintés kijelölés, nem beadás. Új terület kiválasztásával módosítható. A „Válasz véglegesítése” csak érvényes kijelölésnél aktív. A térképen kívüli kattintás megőrzi az előző kijelölést; nem próbálkozás. Kettős kattintás vagy gyors gombnyomás nem adhat be két választ.

## Gyakorlás állapotai

1. A kérdés név szerint megjelenik, előző színezések és kijelölés törlődnek.
2. Véglegesítéskor helyes válasz esetén zöld helyes poligon és „Helyes!” szöveg jelenik meg. A feladat megoldott; „Következő” gomb léptet.
3. Első vagy második rossz véglegesítés: a hibás poligon piros és „Helytelen. Próbáld újra!” szöveg jelenik meg, a helyes válasz rejtve marad. A kijelölés kiürül, új területet lehet választani. A korábban hibás poligon ugyanennél a kérdésnél nem adható be újra; ez nem fogyaszt új kísérletet. A hibajelölések a kérdés lezárásáig látszanak.
4. Harmadik hiba: a rossz piros, a helyes zöld, a helyes név szövegesen is látszik. A feladat lezárul, 0 pont, „Következő”.
5. „Mutasd meg”: bármely még nyitott gyakorlófeladatnál, akár kijelölés után is használható. Felfedi és lezárja a feladatot 0 ponttal. Nem számít helyesnek.
6. Pontszám az első sikeres véglegesítés pozíciója szerint: 1. = 100, 2. = 60, 3. = 30; lezárt sikertelenség/segítség = 0.

A két hibás próbálkozás utáni siker 30 pont, de az elem így is bekerül a hibaismétlésbe. Minden olyan alapfeladat ismétlendő, ahol legalább egy hiba vagy megmutatás történt. A sor ID szerint egyedi, az alapkör végén újrakeverjük. Mindegyiket pontosan egyszer kérdezzük újra, legfeljebb 3 próbálkozással és ugyanazzal a visszajelzési logikával. Az ismétlésből nem keletkezik újabb ismétlési sor és nem jár további pont.

Az alapkör utolsó feladatának „Következő” gombja a hibaismétléshez, hibamentes körben az eredményhez vezet. Ismétlésnél a fejléc „Hibák ismétlése • 1 / M”, és röviden közli, hogy az eredeti pontszám nem változik.

### Gyakorlóeredmény

- Időtartam: az alapfeladatsor és ismétlés együttes ideje, utolsó lezárt feladatig.
- Elsőre helyes: csak az első próbálkozásra sikeres alapfeladatok száma / N.
- Találati arány: `100 × elsőreHelyes / N`, egy tizedesjegyig lokalizálva.
- Pontszám: alapkör pontjainak összege / `100 × N`.
- Nincs jegy, hibajegyzék, teljesítménygrafikon vagy tartós mentés.

Példa: 5 alapfeladatból 3 elsőre helyes, 1 másodikra, 1 megmutatott: 360/500 pont, 3/5 elsőre helyes, 60%. Az ismétlés eredménye ettől függetlenül nem módosítja a 360 pontot.

## Számonkérés

A kijelölés minden feladaton semleges kék. A véglegesítés eltárolja a választ memóriában, majd közvetlenül a következő kérdésre lép. Nem jelenik meg helyes/hibás szín, helyes választ közlő szöveg, pont, sikeranimáció vagy képernyőolvasós helyességi bejelentés. Minden válasz után azonos módon viselkedik a felület. Nincs „Mutasd meg”, névfelirat-kapcsoló, visszalépés vagy kihagyás.

Az utolsó válasz beadása azonnal eredményt készít. Időlejáratkor a nem véglegesített kijelölés nem számít válasznak. A teljes eredeti N marad a nevező: nincs részleges tesztből jobb arány. Nincs korai beadásgomb. Az „Újrakezdés” megszakítja a régit; nem minősíti befejezett tesztnek.

### Százalék és jegy

`rawPercent = 100 * correct / total`.

`grade = max(1, ceil(12 * correct / total))`.

A jegy az egész számláló/nevező alapján készül; nem a megjelenített kerekített százalékból. Célszerű egész számokkal számolni: `max(1, floor((12 * correct + total - 1) / total))`. Csak `total > 0` és `0 <= correct <= total` bemenet fogadható el. Maximum 12.

| Összes | Helyes | Kijelzett százalék | Jegy |
|---:|---:|---:|---:|
| 12 | 0 | 0% | 1 |
| 12 | 1 | 8,3% | 1 |
| 12 | 9 | 75% | 9 |
| 12 | 12 | 100% | 12 |
| 5 | 1 | 20% | 3 |
| 5 | 4 | 80% | 10 |
| 27 | 1 | 3,7% | 1 |
| 27 | 26 | 96,3% | 12 |

A 26/27-re adott 12 a jóváhagyott felfelé kerekítő szabály következménye. Nem szabad utólag „csak hibátlan lehet 12” szabállyal felülírni. Eltérő kérdésszámoknál nem feltétlenül érhető el minden jegy. A súgó ezt röviden elmagyarázza, nem állít hivatalos országos osztályozási standardot.

## Idő és eseménysorrend

A kör ideje akkor indul, amikor az adatok és a térkép készen állnak, és az első feladat látható. A betöltési idő nem része a számonkérésnek. Nyelv- és témaváltás, zoom, dialógus és háttérbe lépés nem állítja meg az órát. Nincs szüneteltetés.

A Clock interfész monoton, nem visszafelé mozgó elapsed értéket ad. Megvalósítási javaslat: az indulás óta eltelt falióra- és monotónikus idő maximuma, az előző elapsed értéknél nem kisebb eredménnyel. A falióra előreállítása így lejáratot okozhat; kliensoldalon nincs megbízható csalásvédelem. A névleges határidő vizsgálata nem függhet az interval tickek számától.

Minden véglegesítési művelet előtt ellenőrizni kell a lejáratot. Ha `elapsed >= limit`, az időlejárat elsőbbséget élvez, a kijelölés már nem számít. Ugyanez lefut `visibilitychange`, `pageshow`, fókusz-visszatérés és időzítő eseménynél. A reducer egyszer zárhatja le a kört; későbbi események hatástalanok.

Időlejáratos eredmény időtartama pontosan a választott limit; ne a háttérből visszatérés későbbi időpontja legyen. Egyébként a befejező esemény elapsed értéke. Kijelzés `mm:ss`, egy óránál hosszabb időnél `h:mm:ss`; visszaszámlálás egész másodpercre felfelé kerekítve, eredmény egész másodpercre lefelé.

## Kilépés, újrakezdés, adatvesztés

Aktív játékban belső kilépés és újrakezdés megerősítő dialógust kér. Az idő közben is telik. Lejáratkor a dialógust az eredmény váltja fel. Újrakezdés azonos beállításokkal új sorsolást és új órát indít; a régi eredmény/állapot törlődik. Az eredményképernyőről már nem szükséges megerősítés.

Frissítés vagy tabbezárás után nincs helyreállítás. `beforeunload` figyelmeztetés csak ahol a böngésző engedi, nem garantálható. A vissza/előre cache-ből visszatérő aktív oldalnál az órát újra kell ellenőrizni. Oldaltörténettel nem lehet visszajutni lezárt kérdéshez. A memóriában lévő eredményt a főoldalra lépés vagy új kör törli.
