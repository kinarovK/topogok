# 0003 – TopoGok online és tanári platform: követelményspecifikáció

Dátum: 2026-11-10. Szint: **Full**. Állapot: **specifikációtervezet, dokumentumszintű jóváhagyásra**. A követelményinterjú lezárult; ez a dokumentum annak döntéseit foglalja össze. Nem implementációs jelentés, nem kész backend, és nem publikálási művelet. A design és a részletes végrehajtási plan a specifikáció jóváhagyása után készül.

## 1. Cél és kiindulási állapot

A működő TopoGok vendégalkalmazás kerüljön nyilvános HTTPS-címre, majd ellenőrzött iterációkban bővüljön tanári környezetekkel, diákfiókokkal, osztályokkal, mentett próbálkozásokkal, tanári elemkészletekkel és toplistával. A vendégfunkciók továbbra is megmaradnak.

Kiindulás a 2026-11-10-i helyi repó szerint: közigazgatási téma 27, tektonikai téma 11 kérdezhető elemmel; hu/uk felület, világos/sötét/rendszer téma, PWA/offline vendégműködés. A betéttérképek korábbi tulajdonosi döntéssel kikerültek; ez a feladat nem hozza vissza őket. A munkafa a specifikáció indulásakor tiszta. A kód 2026-11-10 óta a tulajdonos privát GitHub-repójában van (`kinarovK/topogok`, `main` ág, a teljes helyi előzménnyel); a helyi checkout `origin` remote-ja erre mutat. A specifikáció írásakor a repó még nem volt bekötve, ez azóta rendeződött.

A korábbi MVP helyi megvalósítása befejezett. A 0001 P10 fennmaradó kiadási feladatai és ellenőrzései az új F1 fázisban folytatódnak; nem tekintjük őket már elvégzettnek. A 0002 tektonikai téma implementált alap, nem új aktív fejlesztési feladat. Egyetlen aktív tervezési feladat a 0003.

## 2. Dokumentáció és végrehajtási sorrend

| Fázis | Önálló specifikáció | Függőség | Cél |
|---|---|---|---|
| F1 | [Online vendégkiadás](phases/F1_HOSTING.md) | meglévő MVP | jelenlegi alkalmazás éles, ingyenes hostingon |
| F2 | [Fiókok és jogosultságok](phases/F2_ACCOUNTS.md) | F1 kiadási alap | backend, tanár/diák/szuperadmin, osztályok |
| F3 | [Próbálkozások és tanári panel](phases/F3_ATTEMPTS.md) | F2 | mentett eredmények, tanári áttekintés |
| F4 | [Tanári témabeállítások](phases/F4_TOPIC_SETTINGS.md) | F2–F3 | tanáronkénti kérdezhető elemkészlet |
| F5 | [Toplista és személyes rekord](phases/F5_LEADERBOARD.md) | F3–F4 | teljes térképes vizsgaeredmények rangsorolása |
| F6 | [Oldalelhagyási jelzések](phases/F6_INTEGRITY_SIGNALS.md) | F3–F5 | utólagos eseménynapló, jóváhagyás |

Ezek fejlesztési fázisok, nem egymástól független párhuzamos megbízások. Egy fázis lokálisan átadható és tesztkörnyezetben ellenőrizhető, mielőtt élesbe kerül. Az F6 integritási felülvizsgálati állapotának helyét már az F3/F5 szerződésekben elő kell készíteni; automatikus jelzésgyűjtés csak F6-ban kötelező. A későbbi funkciók ne jelenjenek meg működés nélküli felületként az F1-ben.

Olvasási sorrend a következő agentnek: ez a dokumentum → [döntési napló](DECISIONS.md) → aktuális fázisspecifikáció → meglévő [PRODUCT](../../../PRODUCT.md), [ASSESSMENT_MODEL](../../../ASSESSMENT_MODEL.md), [STYLE_GUIDE](../../../STYLE_GUIDE.md), [DATA_CONTRACT](../../../DATA_CONTRACT.md), [LOCALIZATION](../../../LOCALIZATION.md), [OPERATIONS](../../../OPERATIONS.md) → az implementáció előtt elkészülő és jóváhagyott design/plan.

## 3. Változatlan alapkövetelmények

- TopoGok név, meglévő térképek és a fejlesztő által kiadott térképi adatok.
- Magyar és ukrán teljes felület, minden új tanári/admin/hiba- és állapotszöveggel együtt.
- Mobil, tablet és asztali használat, világos/sötét/rendszer téma.
- Meglévő gyakorló pontozás (100/60/30/0), egyszeri hibaismétlés, számonkérési szabályok és 1–12 jegyképlet.
- A jegyben az idő továbbra sem számít; csak azonos pontosságú toplistaeredmények között rendezési szempont.
- Vendégként a két játékmód és felfedezés használható; vendég eredményét nem mentjük szerverre, nem küldjük tanári kimutatásba és nem migráljuk utólag diákhoz.
- A térképen nincs politikai magyarázat. Nincs reklám, követő analitika, natív áruházi alkalmazás vagy felhasználói SHP-import.

## 4. Terhelés, költség és frissítés

Tervezett induló létszám: körülbelül 3 tanár, legfeljebb 100 felhasználó összesen, legfeljebb 30 egyidejű használó. Nem 30 kérés/s: a valódi felhasználói folyamatokból kell terhelési profilt képezni. Nincs automatikusan újralekérő dashboard, WebSocket-alapú élő követés vagy háttérben periodikusan frissülő toplista.

Toplista: fiókonként legfeljebb 1 sikeres frissítési lekérés / 60 másodperc. Tanári eredménypanel: fiókonként legfeljebb 1 sikeres frissítési lekérés / 10 másodperc. Az első megnyitás is lekérés; a korlátot a szerver érvényesíti. A részletes lapozási/szűrési szerződést a design úgy határozza meg, hogy az ne legyen megkerülési út és ne tegye használhatatlanná a panelt. Látható utolsó frissítési idő és hátralévő várakozás kell. A válasz- és eredménymentés más művelet, ezekre nem a dashboard frissítési korlátja vonatkozik.

Kizárólag ingyenes csomag aktiválható ebben a vállalt scope-ban. Fizetős csomag vagy automatikus fizetős túllépés külön tulajdonosi döntést igényel. Kvótakimerülésnél nem lehet mentettnek állítani egy el nem mentett eredményt. A már letöltött vendégalkalmazás működjön tovább az aktuális offline korlátokkal.

Az első kiadás frontend-hosting iránya Cloudflare a korábbi terv szerint; account még nincs. A backend szolgáltató, hitelesítési eszköz és adatbázis kiválasztása design-feladat, nem lezárt Supabase/Workers/D1 döntés. A felhasználói e-mail nélküli login követelményét a választott szolgáltatásnak biztonságosan támogatnia kell.

## 5. Szerepek és adatelszigetelés

| Művelet | Vendég | Diák | Tanár | Szuperadmin |
|---|---|---|---|---|
| Vendég gyakorlás/számonkérés | igen | külön vendégmódban | igen | igen |
| Saját mentett próbálkozás létrehozása | nem | igen | diák nevében nem | diák nevében nem |
| Saját rekord megtekintése | nem | igen | saját diák rekordját igen | minden diákét igen |
| Diáktoplista | nem | saját tanár köre | saját tanár köre | tanár szerint választva |
| Próbarészletek és összesítések | nem | nincs történet | saját diákok | minden tanár diákjai |
| Diák létrehozása/szerkesztése/jelszócsere | nem | nem | saját körben | bármely tanár körében |
| Diák archiválása | nem | nem | saját körben | mindenhol |
| Végleges diáktörlés | nem | nem | nem | igen, megerősítéssel |
| Osztálykezelés | nem | nem | saját osztályok | minden tanár osztályai |
| Tanár létrehozása/kezelése | nem | nem | nem | igen |
| Témaelem-kapcsolók | nem | nem | saját összes diákra | kiválasztott tanár körére |
| Próbálkozás soft delete / toplistás felülvizsgálat | nem | nem | saját diákokra | mindenhol |

A szuperadmin teljes kezelési hozzáférése nem jelent olvasható jelszót vagy észrevétlen diák-imperszonációt. Nincs szükség másik tanárhoz diákáthelyezésre ebben a scope-ban. Az osztályok tanáronként különállóak, azonos nevük nem kapcsolja össze őket. Minden diáknak pontosan egy tanára és egy, ugyanahhoz a tanárhoz tartozó osztálya van. Más tanár ID-jának beküldése sem kerülheti meg a szerveres jogosultságellenőrzést.

## 6. Próbálkozás és tanári konfiguráció

Minden bejelentkezett diákként indított gyakorlás és számonkérés automatikusan nyilvántartott. A kezdéshez online kapcsolat és sikeres szerveres indulás szükséges. Állapotok termékszinten: folyamatban, befejezett, időkorlát miatt lezárt, megszakított. A kliens „mentés függőben” állapota külön szinkronállapot, nem kész eredmény. A böngésző bezárásáról értesítés nélkül ott maradt kezdett próbálkozás nem lehet kitaláltan befejezett: a design meghatározza a megszakítottnak minősítés határát.

Mentendő tartalom: diák/tanár/osztály az induláskor, téma, adat- és szabályverzió, mód, kérdezhető ID-k és tényleges kérdéssor, konfiguráció, kérdésenkénti beadott válaszok, gyakorló segítség és ismétlés, időadatok, kiszámított eredmény és lezárási ok. Minden eredmény szerveresen újraszámolt, nem a kliens által beküldött százalék vak elfogadása. Ez nem teljes távoli csalásbiztosság: a webes térképadatok és események kliensoldalon hozzáférhetők/manipulálhatók.

A tanár térképenként egy közös elemkészletet állít a saját összes diákjára. Nincs osztályonkénti vagy diákonkénti kivétel. Csak meglévő elemek kapcsolhatók; földrajzi átnevezés és létrehozás nem engedett. Legalább egy elem kötelező. A nem kérdezhető terület semleges, nem választható. A 5/12/Mindegyik lehetőségekből csak a teljesíthetők jelennek meg, duplikált lehetőség nélkül.

A beállításváltozás csak új körökre hat. Aktív és történeti próbálkozás a kezdéskori konfigurációját őrzi. A vendég továbbra is a teljes fejlesztői témát kapja. A tanári szűkítés megkerülésére a diák nem kaphat automatikusan teljes térképes kivételt csak a toplista kedvéért.

## 7. Toplista és személyes rekord – végleges szabály

**Toplistára kizárólag a teljes, fejlesztő által kiadott térkép valamennyi kérdezhető elemével teljesített számonkérés jogosult.** Nem elég a „Mindegyik” felirat: a tényleges ID-halmaznak kell egyeznie a teljes témával.

Példák: 25 elemes témánál 25/25 kérdéses kör lehetséges jelölt, 12 kérdéses nem. A jelenlegi közigazgatásnál 27, tektonikánál 11 elem szükséges. Ha a tanár 27-ből 20-at engedélyezett, a Mindegyik (20) eredmény tanári nyilvántartásba kerül, de nem rekord- vagy toplistajelölt.

Nincs külön szerkesztett toplistás elemkészlet, párhuzamos elemszám-toplista vagy kötelező külön kihívás-játékmód. A korábbi külön „toplistás kihívás” javaslatot ez a szabály felváltja. Az egységes, időkorlát nélküli toplistás feltételt megtartjuk: a normál, teljes térképes, időkorlát nélküli számonkérés jogosult; a határidős kör megmarad a tanárnak, de nem ranglistás. A start képernyő előre közli a jogosultságot és a kizárás okát.

További feltételek: aktív diákfiók, sikeresen szerverre mentett és ellenőrzött befejezett eredmény, megfelelő ranglista-időszak és összehasonlítható tartalom/szabály, nincs soft delete vagy toplistás kizárás, nincs függő vagy elutasított integritási felülvizsgálat. Időlejáratos, megszakított, gyakorló, vendég, hiányos mentés nem jogosult.

Rendezés: pontos helyes/összes arány csökkenően, azon belül teljes eltelt idő növekvően. Nem a 12-es jegy vagy a kijelzett kerekített százalék rangsorol: 26/27 és 27/27 lehet azonos jegy, de nem azonos pontosság. 12/12 öt perc alatt előzi 11/12 egy perc alatt. Nincs külön gyorsasági lista. A háttérben töltött időt nem vonjuk le a ranglista idejéből. Pontosan azonos pontosság és mért idő azonos helyezést kap; stabil megjelenítési sorrend nem jelent jobb teljesítményt (rangsorszám: 1, 1, 3).

Tanár + térkép + aktuális időszak szerint egy lista, osztálytól függetlenül. Diákonként egy legjobb jogosult eredmény. Teljes név, helyezés, pontosság és idő látható, osztály és login nem. Más tanár körének neve és eredménye sem listában, sem API-n nem hozzáférhető. Vendég számára nem nyilvános.

A diák térképenként csak a saját aktuális személyes rekordját látja, ugyanabból a jogosult eredményhalmazból, nem teljes történetet. Rekord nélkül világos üres állapot. A most befejezett kör eredményképernyője megmarad akkor is, ha nem rekordképes.

Tanéves időszakok támogatása, tanár által indítható új versenyidőszak a történet törlése nélkül. A tanév/időszak konkrét kezdését és zárását a tanár kezeli, nem feltételezünk meg nem beszélt automatikus naptári napot. A tanári elemkapcsolók változtatása **nem** indít új időszakot. A teljes térkép kérdezhető tartalmának vagy pontozási szabályának érdemi változását nem szabad régi rekordokkal észrevétlenül keverni; verzióváltáskor a designban rögzített új összehasonlíthatósági csoport/időszak szükséges. Pusztán helyesírási javítás nem feltétlenül új verseny.

## 8. Eseményjelzés és törlés

F6-ban külön naplózzuk: dokumentum elrejtése/visszatérése, ablak fókuszvesztése/visszatérése, hálózati kapcsolat megszakadása/visszatérése. Nem állítjuk, hogy ezek bizonyítják a puskázást. Nincs képernyő-, kamera-, mikrofon- vagy más alkalmazások tartalmának megfigyelése. Más eszköz használata nem érzékelhető.

Számonkérésnél a háttérbe kerülés figyelmeztetést és tanári felülvizsgálatot eredményez a ranglistás jogosultsághoz. A puszta fókuszvesztés naplózott, de önmagában nem függeszti fel a jogosultságot. Hálózati hiba külön technikai esemény; nem automatikus csalásjel. Nem ellenőrizhető eredmény nem kerül automatikusan toplistára. Nincs automatikus pontlevonás, vizsgamegszakítás vagy jegyátírás. A tanár utólag dönt; nincs élő felügyeleti dashboard.

A tanár saját diákja próbálkozását indoklással kizárhatja a toplistából, vagy **soft delete-tel a normál nyilvántartásból is törölheti**. Törléskor a rekord és minden alapértelmezett összesítés újraszámolódik a megmaradt adatokból. A sor fizikailag megmarad törlési idővel, végrehajtóval és indokkal; közvetlen API-n sem kerülhet vissza normál eredményként. Az érvénytelenített legjobb helyére a következő jogosult eredmény lép. Toplistás kizárás visszavonható. Soft-delete visszaállító felület nem vállalt része ennek a fázisnak; fizikai diáktörlés a szuperadmin külön, megerősített művelete.

## 9. Adatvédelem, munkamenet, megőrzés

Nincs diák e-mail, önregisztráció vagy diákoldali login/jelszóváltoztatás. Globálisan egyedi login és külön teljes név. A tanár állítja be a jelszót, később csak lecserélheti, nem olvashatja vissza. Biztonságos jelszó-hash, próbálkozáskorlátozás és hitelesítés szükséges, konkrét mechanizmus a design feladata. A minimum jelszóhossz 6 karakter (tulajdonosi döntés 2026-11-11; az eredeti javaslat 10 volt).

A munkamenet maradjon meg böngésző újraindítása után; nincs tétlenségi automatikus kijelentkezés. Ez nem korlátlan, visszavonhatatlan token: kézi logout, jelszó-visszaállítás, fiókarchiválás/letiltás visszavonja az érintett hozzáférést. A tokenrotáció és technikai élettartam úgy tervezendő, hogy a vállalt tartós belépést ne tegye kétórás idle logouttá. Mindig látszik az aktuális felhasználó. Közös eszközön kijelentkezés után a következő használó nem férhet hozzá az előző személyes adataihoz vagy függő feltöltéseihez.

Bejelentkezett kör indulásához kapcsolat szükséges. Rövid kimaradás után biztonságos újrapróbálás és egyértelmű mentési állapot kell, duplázás nélkül. Teljes offline fiókos munkamenet-szinkronizáció nem scope. A személyes API-válaszok nem kerülhetnek a vendégalkalmazás közös PWA precache-ébe.

Megőrzés: aktuális + két előző tanév (összesen 3), tárhelyfigyeléssel; automatikus korábbi adateldobás nincs. Heti adatmentés, négy heti példány, ha ingyenesen biztosítható. Ha ez az ingyenes keretben nem teljesíthető, a design konkrét eltérést jelez, nem kapcsol fizetős csomagot vagy hallgatja el a mentés hiányát. Végleges törlés és mentés-visszaállítás szabályának biztosítania kell, hogy törölt hozzáférés ne éledjen újra észrevétlenül.

Az első szuperadmin a tulajdonos; elveszett hozzáférés szerveroldali tulajdonosi karbantartási eljárással helyreállítható. Szuperadmin kétlépcsős belépés későbbi külön feladat, most nem implementálandó. Biztonsági adminműveletek naplója szükséges; ez nem felhasználókövető analitika.

## 10. Közös elfogadási feltételek

| ID | Ellenőrizhető követelmény |
|---|---|
| G-01 | Vendégként a meglévő két téma és játékmód mentett személyes adat és backend-kötelezettség nélkül végigjátszható. |
| G-02 | 3 tanár és összesen 100 fiók adatkészletével, 30 párhuzamos felhasználói folyamattal nincs adatkeveredés vagy elveszett, mentettnek jelzett eredmény. |
| G-03 | Minden új képernyő és hiba hu/uk nyelven, mobilon, világos/sötét témában használható. |
| G-04 | Bármely tanár/diák által más tanár azonosítójával indított közvetlen API-kérés megtagadott; adatok nem szivárognak. |
| G-05 | Kliens által manipulált jegyet/pontosságot a szerver nem fogad el; a mentett eredmény az ellenőrzött válaszokból készül. |
| G-06 | A dashboard és ranglista nem pollol automatikusan; a 10/60 másodperces frissítési korlát több tabon is érvényes. |
| G-07 | 25 elemes teszttémán 12 kérdés, illetve 20-ra szűkített Mindegyik nem jogosult; teljes 25, időkorlát nélkül jogosult, ha a többi feltétel teljesül. |
| G-08 | Toplistán és személyes rekordban kizárólag saját tanári kör, egy legjobb/diák, pontosság majd idő szerepel; soft delete és kizárás azonnal kihat az új lekérésekre. |
| G-09 | Tartós belépés működik, idle logout nincs; logout/jelszócsere/letiltás szerveresen visszavonja a megfelelő hozzáférést. |
| G-10 | Függő/sikertelen mentés nem jelenik meg sikeresként; ismételt kérés nem dupláz; vendég kör utólag nem válik hiteles fiókos eredménnyé. |
| G-11 | Minden éles fázist elkülönített teszt és dokumentált regresszió előz meg, rollback/mentés-visszaállítás kezelhető, fizetős erőforrás nem aktiválódik automatikusan. |
| G-12 | Háttérbe kerülés/fókusz/hálózat külön jel, nincs automatikus jegybüntetés, utólagos felülvizsgálat és napló látható a jogosult tanárnak. |

## 11. Nem vállalt funkciók

Önálló regisztráció, e-mailes diákazonosítás, import, több tanár egy diákhoz, tanárközi diákmozgatás, közös iskolai osztályobjektum, osztályonkénti/diákonkénti elemkészlet, diák eredménytörténet, gyakorlótoplista, külön gyorsasági lista, nyilvános ranglista, élő felügyelet, teljes offline fiókos sync, szerkeszthető földrajzi nevek, képernyőfigyelés, mostani 2FA-implementáció, fizetős hosting automatikus aktiválása.

## 12. Designban tisztázandó technikai részletek

Nem új termékinterjú: szolgáltató és ingyenes keretek igazolása; username-auth és jelszó-hash; session/token rotáció; kérés-, adat- és idempotencia-szerződések; server/client időmérés és rövid hálózatkimaradás; függő mentés maximális ideje; meg nem zárt körök lezárása; API lapozás és rate-limit; schema/migráció és hozzáférésvédelem; személyes cache és logout; audit/soft delete/retention; mentés/visszaállítás; CI és feature rollout. Ezeket bizonyítékkal és tesztelhető paraméterekkel kell rögzíteni, nem a végrehajtó agentre hagyni.

A dokumentum a felhasználói döntéseket konkretizálja; a pontos holtverseny-kijelzés, a tanév kézi nyitása és a soft delete utáni összesítések megfogalmazása elfogadásra javasolt specifikációs részlet. A dokumentum elfogadása után új termékdöntést csak módosítással vezessünk be.
