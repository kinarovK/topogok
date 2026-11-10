# Döntési napló és a korábbi MVP-től való eltérések

2026-11-10. A beszélgetésben elfogadott döntések összesítése. A részletes, jóváhagyandó szerződés a [task.md](task.md). Ez nem backend-implementáció és nem szolgáltatói fióklétrehozás.

| Téma | Végső döntés |
|---|---|
| Terhelés | körülbelül 3 tanár, max. 100 használó, max. 30 egyszerre |
| Hosting | indulás ingyenesen, fizetős csak külön döntés; szolgáltatói URL megfelel |
| Kiadás | jelenlegi vendégverzió előbb éles, új részek alaposan tesztelve, fokozatosan |
| Tulajdonosi fiókok | privát GitHub-repó: `kinarovK/topogok` (2026-11-10 óta, teljes előzménnyel); Cloudflare még nincs |
| Munkafolyamat | fázisonként külön PR; a `main`-be csak tulajdonosi jóváhagyás után kerül változás |
| Névjegy és források oldal | a felületről kikerül (tulajdonosi döntés, 2026-11-10); végrehajtás az F1-ben |
| Szerepek | vendég, diák, tanár, szuperadmin; saját tanári kör szigorúan elkülönített |
| Diák tulajdonosa | egy tanár, egy saját osztály; más tanárhoz áthelyezés most nincs |
| Regisztráció | csak tanár/szuperadmin, egyenként; nincs e-mail vagy önregisztráció |
| Login | globálisan egyedi, külön teljes név; tanár adja meg és módosítja |
| Jelszó | tanár állítja, diák nem módosítja, régi nem olvasható, reset lehetséges |
| Superadmin | tulajdonos az első; karbantartói helyreállítás; 2FA későbbi külön fázis |
| Belépés | megmarad, nincs tétlenségi automatikus logout; kézi logout és visszavonás van |
| Diák archiválás | tanár saját körben; fizikai diáktörlés csak superadmin |
| Mentett játék | minden fiókos gyakorlás és vizsga, kezdett/megszakított is |
| Diáknézet | térképenként aktuális személyes rekord, nem eredménytörténet |
| Tanárnézet | saját diákok, összesítések és kérdésenkénti részletek, szűrők, export/grafikon nélkül |
| Idő | teljes idő + látható oldalon töltött idő külön; ranglistán teljes idő |
| Internet | online fiókos kezdés, rövid kiesésre függő mentés és retry; teljes offline sync nincs |
| Elemkészlet | tanár/térkép, minden saját diákra és mindkét módra; nincs osztályos kivétel |
| Kizárt elem | semleges és nem választható, nincs átnevezés/létrehozás |
| Toplista | csak teljes fejlesztői térkép, számonkérés; kisebb kérdésszám és tanári szűkítés kizár |
| Toplista időkorlát | korábban elfogadott egységes feltétel: nincs időkorlát |
| Rang | pontosság első, idő csak holtversenynél; nincs gyakorló- vagy gyorsasági lista |
| Lista láthatósága | csak saját tanár köre, osztályok között közös; teljes név, osztály/login nélkül |
| Időszak | tanéves, tanár új időszakot indíthat, történet megmarad |
| Frissítés | kézi: diák toplista 60 s, tanári panel 10 s, szerveresen korlátozva |
| Törlés | tanár soft delete-tel a nyilvántartásból is törölhet; nem csak toplistás kizárás |
| Oldalelhagyás | utólagos napló és diákfigyelmeztetés, nem automatikus csalásvád/jegylevonás |
| Jelzett ranglistaeredmény | elrejtés után tanári jóváhagyás kell; fókuszvesztés önmagában nem; hálózat külön |
| Megőrzés | 3 tanév, heti minimális mentés 4 hétre, ingyenesség ellenőrzésével |

## Felülírt korábbi javaslatok

1. Osztályonkénti elemkészlet helyett egy tanári elemkészlet minden saját diákra.
2. Diák eredménytörténet helyett csak személyes rekord.
3. Külön eredmény- és gyorsasági ranglista helyett egy lista, pontosság majd idő.
4. Kétórás idle kijelentkezés helyett tartós bejelentkezés.
5. Diák tanárok közötti áthelyezése most nem szükséges.
6. Pusztán ranglistából kizárás mellett próbálkozás-adatbázis soft delete is szükséges.
7. Külön, tanári elemkészletű toplistás kihívás helyett teljes térképes normál számonkérés. A tanári elemkészlet változása nem nullázza a listát; a szűkített kör nem jogosult.

## Korábbi dokumentumok hatálya

A 0001 és az ADR-0001 a backend nélküli vendég-MVP történeti specifikációja. Az ottani „nincs backend/fiók/mentés” továbbra is igaz a vendégfolyamra, de az új fiókos fázisokra ez a 0003 specifikáció lép a helyére. A pontozás, térképi adatok, lokalizáció és vizuális alapok változatlanok, ahol ez a dokumentumcsomag kifejezetten nem módosítja őket. A korábbi sikeres tesztek nem igazolják az új backend működését.

## Külső és ellenőrzési előfeltételek

Az adatforrásokról a tulajdonos nyílt, oktatási vektorizálást közölt; konkrét licencszöveg nincs rögzítve. Ez a specifikáció nem állít új ellenőrzést és nem minősíti megoldottnak a korábbi kiadási pontot. A GitHub-repó (`kinarovK/topogok`) bekötése megtörtént; a Cloudflare-fiók és az éles kiadás tényleges állapota a kiadási munkában ellenőrizendő. Fizikai telefonos és böngészős hiányzó próbák továbbra is külön bizonyítékot igényelnek.
