# F6 – Oldalelhagyás és utólagos tanári felülvizsgálat

Állapot: **megvalósítva a `staging` ágban** ([F6_DESIGN.md](F6_DESIGN.md)); a valódi eszközös próba (F6-09) nyitott. Korábban: specifikációtervezet. Függőség: F3–F5. Közös szerződés: [task.md](../task.md).

## Cél és korlát

A felügyelt számonkérésnél a diák és a tanár is lássa, ha az oldal elrejtődött, elvesztette a fókuszt vagy megszakadt a kapcsolat. Ez eseménynapló, nem puskázásbizonyíték. A tanár jellemzően a diák mellett van; élő felügyeleti képernyő nem szükséges.

Nem vizsgálunk más ablak tartalmát, nem készítünk képernyőképet vagy felvételt, nem figyelünk kamerát/mikrofont. Másik készülék használata nem felismerhető. Böngészőbezáráskor nem garantálható utolsó eseményküldés; hiányzó adatot nem szabad „minden rendben” bizonyítéknak venni.

## Események és következmények

| Esemény | Diák visszajelzése | Tanári megjelenés | Ranglista |
|---|---|---|---|
| Oldal elrejtése majd visszatérés | rövid figyelmeztetés visszatéréskor | eseményszám, időpont/időtartam | tanári jóváhagyásig függő |
| Puszta fókuszvesztés | semleges jelzés, nem csalásvád | külön eseménytípus | önmagában nem függeszti fel |
| Kapcsolat megszakadása | mentés/kapcsolat állapota | technikai esemény | ha a mentés validálható, nem automatikus kizárás; ellenőrizhetetlennél nincs automatikus ranglista |
| Hiányzó visszatérés/lezárás | ha lehetséges, állapotjelzés | hiányos intervallum vagy megszakított kör | nem hamis sikeres eredmény |

A számonkérés előtti rövid tájékoztatás közli a jelzésgyűjtést és a korlátokat. A visszatérési figyelmeztetés nem állítja meg az órát, nem von le pontot, nem zárja le automatikusan a vizsgát és nem fedi fel a megoldást. Fókusz- és láthatóság-események összefügghetnek: ugyanazt a kiesést nem szabad kétszeres időnek számolni. A pontos duplikációs/összefűzési szabály a design része.

A tanár a meglévő próbálkozás-részletben látja a naplót, elkülönített kategóriákkal. A befejezett és egyébként ranglistás körre jóváhagyás vagy elutasítás adható rövid indokkal, auditálva. A jegy változatlan. A jóváhagyott eredmény bekerülhet, az elutasított nem; soft-deleted vagy egyéb okból nem jogosult eredményt a jóváhagyás nem tehet jogosulttá. A diák a saját rekord/aktuális eredmény állapotán látja a függő minősítést, de nem kap teljes történeti naplóböngészőt.

## Elfogadási feltételek

| ID | Feltétel |
|---|---|
| F6-01 | Tab/app háttérbe kerülése, fókuszvesztés és kapcsolatvesztés külön eseménytípus, nem egyetlen „csalt” boolean. |
| F6-02 | Visszatéréskor figyelmeztetés van, a vizsga folytatható; idő nem áll meg és pont/jegy nem változik az esemény miatt. |
| F6-03 | Elrejtés ranglistás jóváhagyást igényel; fókuszvesztés önmagában nem; hálózati hiba külön kezelt. |
| F6-04 | Jogosult tanár utólag látja a számot/időt/időtartamot és a hiányos adat jelzését; idegen tanár/diák nem fér hozzá. |
| F6-05 | Kettős esemény és ismételt küldés nem növeli tévesen a kiesési időt; időintervallumok nem negatívak és nem fedik többször ugyanazt az időt. |
| F6-06 | Tanári jóváhagyás/elutasítás auditált és helyesen módosítja a toplistát/rekordot, de nem a jegyet vagy más jogosultsági feltételt. |
| F6-07 | Nincs kamera/mikrofon/képernyőhozzáférés, nincs automatikus csalásállítás és nincs élő dashboard polling. |
| F6-08 | F6 előtti próbálkozás nem kap visszamenőleg „ellenőrzött, nem hagyta el” minősítést. |
| F6-09 | Android/iOS és desktop valós viselkedés ellenőrzési eredménye és korlátai dokumentáltak; hiányzó eszközteszt nem állítható késznek. |

## Átadás

Eseményforgatókönyvek: tabváltás, alkalmazásváltás, rendszerablak miatti fókuszvesztés, képernyőzár, rövid hálózatkiesés, tabbezárás, jóváhagyás/törlés versenyhelyzet. Az alkalmazás jelezzen bizonytalanságot, ne ígérjen megkerülhetetlen vizsgafelügyeletet.
