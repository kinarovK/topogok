# F3 – Próbálkozások mentése és tanári panel

Állapot: **kiadva (PR #9, 2026-11-12)** ([F3_DESIGN.md](F3_DESIGN.md) 11. pont). Korábban: specifikáció, a 2026-11-12-i tulajdonosi módosításokkal ([F3_DESIGN.md](F3_DESIGN.md), 0. és 8. pont: takarékos mentés, nincs tanári kérdésenkénti nézet, a legjobb eredmény csak teljes körből). Függőség: F2. Közös szerződés: [task.md](../task.md).

## Eredmény

A tanár saját diákjairól megtudja, melyik térképen, melyik módban hány kört indítottak, fejeztek be vagy szakítottak meg, mennyi idővel és milyen eredménnyel. A részletes válaszokból tanulási nehézséget is azonosíthat. A diák nem kap eredménytörténeti felületet; a mostani eredményképernyő marad, személyes rekordja F5-ben készül.

## Mentési viselkedés

A bejelentkezett diákkör szerveresen rögzített indulással kezdődik. Minden kezdéshez saját próbálkozás tartozik, újrakezdés az előző megszakítását jelenti. Az eredeti kérdéshalmaz, sorrend, adatverzió, pontozási szabály és konfiguráció snapshot, későbbi tanári változás nem írja át.

A tanár kérdésenként látja a beadott választ, helyességet, gyakorló kísérleteket, segítséget és ismétlési szakaszt. Nem szükséges egérmozgást vagy minden ideiglenes kijelölést gyűjteni. A szerver ellenőrzi a diák/attempt kapcsolatot, ID-ket, sorrendet és játékszabályokat, majd újraszámolja az eredményt. A saját HTTP-kéréssel beadott hamis százalék nem válik hiteles rekorddá.

Időtartamok: teljes köridő és látható oldalon töltött idő külön. Gyakorló alap- és ismétlőkör a meglévő szabály szerint; vizsgán háttérben is telő óra. A láthatósági idő technikai mérés, nem bizonyított koncentráció. Pontosan mérhetetlen lezárásnál hiányos időadatot jelezni kell, nem hamis pontosságot. Az F3 időméréshez szükséges láthatósági állapot még nem F6-os csalásjelzés vagy automatikus ranglistás büntetés.

Rövid hálózatkimaradás: játékállapot megőrzése az aktív oldalon, mentés függőben visszajelzés, visszatéréskor ellenőrzött retry. Az ismételt kérés ugyanazt a próbálkozást/ választ véglegesíti, nem dupláz. Bezárt böngészőből teljes offline helyreállítást nem vállalunk; a nem mentett adatot nem szabad mentettként feltüntetni. A design dönti el a feladásonkénti vagy kötegelt küldést és a megbízhatósági határokat, alacsony forgalommal. Kijelentkezés/fiókváltás után a függő adat nem tölthető fel másik diákhoz.

## Tanári felület

Szűrők: saját osztály, diák, térkép, mód, dátumtartomány. Mutatók: indított, befejezett, lejárt/megszakított próbálkozások; teljes és aktív idő; legutóbbi és legjobb eredmény. A legjobb eredmény csak összehasonlítható módban/konfigurációban értelmezhető; eltérő gyakorlópontot és vizsgajegyet ne egyetlen félrevezető számmá vonjunk össze. Kiválasztható próbálkozás részletes válaszlistával.

Kézi frissítés, legalább 10 másodperc két sikeres frissítési lekérés között. Látható utolsó frissítés és betöltési/hibás/üres állapot. Nincs élő megfigyelő képernyő, grafikon, export vagy push értesítés.

A tanár indoklás és megerősítés után soft delete-tel törölhet saját próbálkozást. A törölt rekord nem szerepel a normál listákon, összesítésekben és később a toplistán sem; a tanár számára nem „csak elrejtett sor ugyanazzal az összponttal”. Audit és soft-delete marker marad. A fiók archiválása ettől külön művelet.

## Elfogadási feltételek

| ID | Feltétel |
|---|---|
| F3-01 | Minden bejelentkezett indítás szerveresen azonosított; vendégkör nem generál próbálkozási rekordot. |
| F3-02 | Befejezés, lejárat, újrakezdés és megszakítás elkülönül; sikeres újrakezdés nem törli az előző nyomát. |
| F3-03 | A konfiguráció/sorrend/elemhalmaz snapshot alapján később is értelmezhető az eredmény, tanári változás nem írja át. |
| F3-04 | A tanár látja a saját diák kérdésenkénti beadott válaszait, gyakorló kísérleteit, segítségét és összesített eredményét. |
| F3-05 | Manipulált százalék, idegen attempt ID, nem létező feature, szabálytalan válaszsor elutasított vagy érvénytelenként kezelt, nem ranglistás eredmény. |
| F3-06 | Dupla küldés, válasz/lezárás verseny és retry nem dupláz adatot/pontot. Hiányzó mentés világosan függő vagy sikertelen. |
| F3-07 | Teljes és látható oldali idő külön, nem negatív és konzisztens; háttéridő nem javítja a vizsga teljes idejét. |
| F3-08 | Tanári szűrők, darabszámok, legutóbbi/legjobb adatok a megjelenített körre helyesen számolnak; más tanár adata nem kérhető le. |
| F3-09 | Manuális frissítés 10 s korláttal működik; nincs periodikus háttérlekérés. |
| F3-10 | Soft delete a részletelérést és alapértelmezett összesítéseket is érinti; audit megőrzi a műveletet, a rekord fizikailag megmarad. |
| F3-11 | Kijelentkezés és másik fiók belépése után nincs adatkeveredés; személyes eredmény nincs közös PWA-cache-ben. |
| F3-12 | 3 tanév megőrzési szabály és heti/4 heti mentés dokumentált; visszaállítás tesztkörnyezetben ellenőrzött vagy konkrétan nyitott. |

## Bizonyíték

Valódi háttérszolgáltatással tesztelt két tanári kör; helyes/hibás/segített játék; időlejárat; hálózatkiesés és ismételt küldés; bezárt tab miatt hiányos kör; soft delete; fiókváltás. A backend hibája nem bonthatja meg a vendégként elérhető alkalmazást.
