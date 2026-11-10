# F2 – Backend, fiókok, osztályok és jogosultságok

Állapot: specifikációtervezet. Függőség: F1 kiadási alap. Közös szerződés: [task.md](../task.md).

## Eredmény

Tanár által létrehozott diákfiókok, tanáronként elkülönített adatokkal és osztályokkal. Nincs önregisztráció, diák e-mail vagy diákoldali jelszócsere. A meglévő vendégmód megmarad; a bejelentkezés nem válik használati előfeltétellé.

## Szerepfolyamatok

Szuperadmin: első fiók biztonságos telepítési eljárással, tulajdonosi kezelésben; tanárok létrehozása, szerkesztése, jelszó-visszaállítása és letiltása; tanári kör kiválasztásával diák/osztálykezelés. Hozzáférés-helyreállítás hosting-hozzáféréssel futtatható karbantartói művelet. Kétlépcsős szuperadmin-belépés későbbi, kifejezetten elhalasztott fejlesztés; ne legyen késznek jelölve vagy üres kapcsolóként beépítve.

Tanár: saját osztály létrehozása/átnevezése/archiválása, diák egyenkénti létrehozása teljes név + egyedi login + jelszó + saját osztály megadásával, adatok módosítása, jelszóreset, saját osztályok közötti áthelyezés és diákarchiválás. Idegen osztályhoz/tanárhoz nem rendelhet. Üres osztály törölhető, tanulókat tartalmazó osztály nem hagyhatja őket osztály nélkül: előbb saját osztályba mozgatás szükséges. Az osztályarchiválás nem tüntetheti el a történeti eredményeket.

Diák: bejelentkezés, saját név és tanári hozzárendelés felismerhető megjelenítése, kézi kijelentkezés. Login/jelszó/név/osztály saját módosítása nincs. Tartós belépés, nincs tétlenségi automatikus kiléptetés. A jelszó nem tárolható olvashatóan és az adminnak sem mutatható vissza. A login összehasonlításának normalizálása és megengedett karakterei a designban rögzítendők, hogy az egyediség ne legyen megkerülhető.

A tanár archiválása/letiltása megakadályozza az ő és a hozzá tartozó diákok további fiókos használatát, a történet megmarad. Ez biztonságos alapként szereplő specifikációs részlet; nincs automatikus átrendelés más tanárhoz. Diák fizikai törlése csak szuperadminnak, egyértelmű hatásismertetéssel és megerősítéssel. Nem elég kliensoldali gombelrejtés.

## Elfogadási feltételek

| ID | Feltétel |
|---|---|
| F2-01 | Nincs önregisztrációs UI/API, diák létrehozásához nem kell e-mail. Login globálisan egyedi, teljes név külön mező. |
| F2-02 | Tanár kizárólag saját körébe, saját osztályába hozhat létre diákot; osztály és tanár kötelező és konzisztens. |
| F2-03 | A tanár egyenként létrehoz/szerkeszt/archivál, jelszót cserél és saját osztályok között mozgat; diák ezeket közvetlen API-val sem teheti. |
| F2-04 | Tanár A nem olvashat vagy módosíthat Tanár B diákját/osztályát, akkor sem, ha kitalálja az ID-t vagy paramétert cserél. |
| F2-05 | Szuperadmin tanárt és bármely tanárhoz diákot kezelhet, de nincs olvasható jelszó vagy titkos beléptetés a diák nevében. |
| F2-06 | Legalább 10 karakteres jelszó szükséges; tárolása biztonságos hash. Login hibája nem szivárogtat jelszót; belépési próbálkozások korlátozottak. |
| F2-07 | Böngésző újraindítása után a belépés megmarad, nincs idle logout. Logout/reset/archiválás/letiltás visszavonja az érintett munkameneteket. |
| F2-08 | Kijelentkezés után közös eszközön másik diák nem láthatja az előző személyes adatait, API-cache-ét vagy függő feltöltését. |
| F2-09 | Üres/archivált osztály és archivált diák kezelése nem törli az előzményeket vagy hoz létre árva aktív tagságot. |
| F2-10 | Superadmin helyreállítási eljárás tesztelhető; 2FA dokumentált jövőbeli feladat, nem jelenlegi kész funkció. |
| F2-11 | Bejelentkezés és adminfelületek hu/uk, mobil és világos/sötét témában működnek. Vendégjáték regressziója nincs. |
| F2-12 | Fiók-, jelszó- és jogosultságmódosítások végrehajtóval/idővel naplózottak, a jelszóérték nem kerül auditba. |

## Bizonyíték és határok

Legalább két tanár azonos nevű osztállyal, több diákkal; szerep- és kereszt-tanári hozzáférési negatív tesztek, valódi API-val. A látványosan elkülönített UI nem bizonyít szerveres védelmet. Tesztadatbázis külön az éles személyes adatoktól. Tömeges import, diák tanárközi mozgatása, többtanáros kapcsolat és mostani 2FA nem scope.
