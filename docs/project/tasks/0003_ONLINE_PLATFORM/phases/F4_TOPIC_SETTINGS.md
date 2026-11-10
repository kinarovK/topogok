# F4 – Tanári kérdezhető elemkészletek

Állapot: specifikációtervezet. Függőség: F2–F3. Közös szerződés: [task.md](../task.md).

## Eredmény és scope

A tanár minden térképhez checkboxlistán választja ki a kérdezhető földrajzi elemeket. Egy tanár/térkép beállítás érvényes az összes saját diákra, minden saját osztályban, gyakorlásra és számonkérésre egyaránt. Alapállapot a teljes fejlesztői elemkészlet. Külön osztályos/egyéni kivétel, névátírás, új elem és térképszerkesztés nincs.

A lista az aktuális hu/uk földrajzi neveket mutatja stabil ID alapján. Mentés előtt látszik a kiválasztott darabszám. Legalább egy elem szükséges; idegen, törölt vagy nem létező ID nem menthető. Az összes kiválasztása/visszaállítása kényelmi vezérlőként megengedett, de nem külön tartalomkezelési funkció.

Csak új körre hat, meglévő próbálkozás snapshotját nem módosítja. A kliens helyi cache helyett az induláskor érvényes tanári beállítást kapja. A diák nem küldhet saját tetszőleges elemhalmazt a tanári szabály megkerülésére. Tanári párhuzamos szerkesztésnél ne vesszen el észrevétlenül a másik mentés; a konkrét verziókezelés design-feladat.

5/12/Mindegyik közül a ténylegesen teljesíthetők jelennek meg, azonos elemszámú választás nem duplázódik. Három bekapcsolt elem → Mindegyik (3); nyolc → 5 és Mindegyik (8); tizenegy → 5 és Mindegyik (11). A kikapcsolt terület semleges és nem választható, kattintása nem fogyaszt próbálkozást.

A vendég teljes fejlesztői térképet használ, nem egy utoljára belépett tanár cache-elt szűrését. Szűkített tanári kör nem toplistaképes, még ha az összes engedélyezett elemet kérdezi is. A tanár elemkapcsolóinak módosítása nem nullázza a toplistát vagy személyes rekordokat.

## Elfogadási feltételek

| ID | Feltétel |
|---|---|
| F4-01 | Tanár saját térképenkénti checkboxlistát lát, kizárólag létező ID-kre, mindkét nyelven. |
| F4-02 | Mentés minden saját osztály/diák mindkét játékmódjára azonosan hat; más tanár diákjaira nem. |
| F4-03 | Üres elemkészlet és ismeretlen ID elutasított; legalább egy elem kötelező. |
| F4-04 | A kérdésszámválasztó csak lehetséges, nem duplázott opciókat mutat 1/3/5/8/11/12/27 elemszámnál. |
| F4-05 | Kikapcsolt poligon semleges, nem választható, nem fogyaszt kísérletet; engedélyezett elem normálisan működik. |
| F4-06 | Aktív kör és korábbi eredmény változatlan, következő kör új verziót használ. Elavult mentés ütközése nem csendes felülírás. |
| F4-07 | Diák API-val sem bővítheti a kérdezhető halmazt, és nincs kötelező toplistás kivétel a tanári szabály alól. |
| F4-08 | Vendégmód teljes térképet kap bejelentkezett használat és logout után is. |
| F4-09 | A szűkített Mindegyik eredmény tanárnak mentett, toplistára nem jogosult; tanári beállításváltás nem indít új ranglista-időszakot. |

## Átadás és továbbfejlesztési határ

Két tanárral eltérő elemkészlet, több osztály, aktív kör közbeni módosítás és vendég-visszaváltás tesztje. Új fejlesztői térképelem megjelenésének alapértelmezett engedélyezési/migrációs szabályát a designban külön rögzíteni kell; frissítés nem módosíthat futó kört.
