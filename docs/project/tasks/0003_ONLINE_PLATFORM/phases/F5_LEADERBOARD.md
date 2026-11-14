# F5 – Teljes térképes toplista és személyes rekord

Állapot: **megvalósítva a `staging` ágban** ([F5_DESIGN.md](F5_DESIGN.md)). Korábban: specifikációtervezet. Függőség: F3–F4. Közös, elsőbbséget élvező ranglistaszerződés: [task.md, 7. szakasz](../task.md).

## Eredmény

Diák csak saját tanárának diákjai között láthatja a térképenkénti aktuális ranglistát, osztályhatártól függetlenül. Egy diák legjobb jogosult próbálkozása szerepel. Teljes név, pontosság és idő megjelenik; login/osztály nem. Nincs gyakorlótoplista, külön gyorsasági nézet vagy nyilvános vendégtoplista.

## Jogosultsági szabály

A kör normál számonkérés, bejelentkezett aktív diákhoz tartozik, időkorlát nélkül befejezett, teljes szerveres mentéssel és validálással. A kérdések ID-halmaza pontosan a fejlesztői témaverzió teljes kérdezhető halmaza, mindegyik egyszer szerepel. Az `all` konfigurációs string vagy az N/N kijelzés önmagában nem bizonyítja ezt.

A 27 elemes közigazgatási témán 5, 12 és tanár által 20-ra szűkített Mindegyik kizárt. A teljes 27 jogosult lehet. A 11 elemes tektonikán a teljes 11 jogosult lehet. Ugyanez a szabály jövőbeli 25 elemes témán teljes 25-re vonatkozik. Nem kell külön „toplistás kihívás” játékmód vagy tanári listakészlet.

Kizárt továbbá: vendég, gyakorlás, időkorlátos/lejárt, megszakított, soft-deleted, tanár által kizárt, hiányosan mentett/ellenőrizhetetlen, illetve F6 után felülvizsgálatra váró/elutasított eredmény. Az F6 előtt keletkezett adatot később nem szabad „nem hagyta el az oldalt” jelzéssel visszamenőleg minősíteni: arra az időszakra még nem volt ilyen ellenőrzés.

Az induló képernyő közli: ranglistaképes vagy nem, utóbbinál közérthető okkal. A részleges körök továbbra is értékes tanári adatok, nem hibásnak vagy sikertelen mentésnek minősülnek.

## Rendezés és időszak

Pontosság csökkenően, azonos pontosságnál teljes köridő növekvően. Nem a jegy a rendezési alap. Pontos holtverseny azonos helyezés (1,1,3). A visszamenőleges szerveres újraszámítás ugyanazt a rangot adja; a kliens nem küldhet helyezést vagy saját rekordállítást.

Tanár/térkép/aktuális versenyidőszak szerint egy ranglista. A tanár tanéven belül is új időszakot nyithat megerősítéssel, a korábbi adatok megmaradnak a tanári történetben. A diák aktuális rekordja az új időszakban üresről indul. Tanári elemkapcsolás nem indít időszakot. Az alap térkép teljes kérdezhető halmazának vagy szabályának érdemi változásához a design összehasonlíthatósági kezelést ír elő; eltérő nehézségű régi/új eredmény nem keverhető csendben.

A diák a téma oldalán ugyanebből a halmazból számított saját rekordot látja: helyes/összes, százalék és idő; teljes múltbeli próbálkozáslista nincs. A befejezett aktuális kör eredményoldalán a nem ranglistás eredmény is látható.

## Frissítés és moderálás

Kézi ranglista-frissítés, 60 másodperces fiókszintű szerveres limit. Nincs élő frissítés. Visszaszámláló, utolsó frissítés ideje, hiba és üres állapot. A kliens nem kerülheti meg a korlátot új tabbal. A tanári törlés a szerver új válaszaiban azonnal érvényes, más diák már megjelenített listáján a következő engedett frissítéskor látszik; nincs erre automatikus polling.

A tanár indoklással kizárhat eredményt csak a toplistából, visszavonhatóan, vagy F3 szerinti soft delete-tel a normál nyilvántartásból is. A következő legjobb jogosult eredmény lép a helyére. A diák személyes rekordja ugyanígy újraszámolódik. Archivált diák nem szerepel az aktuális aktív ranglistán, történeti adata megmarad a tanárnak.

## Elfogadási feltételek

| ID | Feltétel |
|---|---|
| F5-01 | Teljes ID-halmaz szerveresen ellenőrzött; rövid és tanár által szűkített Mindegyik kizárt, nem csak darabszám alapján vizsgáljuk. |
| F5-02 | Csak időkorlát nélküli befejezett számonkérés jogosult; az összes kizáró állapot tesztelve. |
| F5-03 | 12/12, 5 perc előzi 11/12, 1 perc eredményét. Egyforma helyességnél a gyorsabb előz. 26/27 és 27/27 nem egyenlő a közös 12-es jegy miatt. |
| F5-04 | Tanár/osztályok szerint két tanári kör tesztjén csak a saját tanár összes osztályának diákjai látszanak. Más kör API-n sem elérhető. |
| F5-05 | Diákonként egy legjobb sor; teljes név, eredmény és idő látszik, login/osztály nincs. Pontos holtverseny azonos helyezés. |
| F5-06 | Személyes rekord ugyanabból a jogosult halmazból készül; hiányában üres állapot, nincs diák eredménytörténet. |
| F5-07 | 60 s szerveres frissítési limit több tabon is működik; hiba/retry nem ad jogosulatlan betekintést vagy végtelen automatikus lekérést. |
| F5-08 | Kizárás, soft delete, archiválás után a rang és rekord újraszámolódik; következő legjobb eredmény helyesen lép elő. |
| F5-09 | Új versenyidőszak új aktuális listát ad, a tanári történet nem törlődik. Tanári elemszűrés nem indít új időszakot. |
| F5-10 | A UI előre jelzi a kör ranglistás jogosultságát; tanári szűkítéshez nem ad rejtett megkerülést. |

## Átadás

Jogosultsági és rangsorolási tesztadatok pontos elvárt eredményekkel, két tanár több osztálya, több próbálkozás/diák, soft delete és időszakváltás. A design rögzítse az F6 előtti/utáni szabályverziót és felülvizsgálati átmenetet; régi adatból ne állítson elő hiányzó integritásbizonyítékot.
