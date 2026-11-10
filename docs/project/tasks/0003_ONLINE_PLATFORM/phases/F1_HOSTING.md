# F1 – A jelenlegi vendégalkalmazás online kiadása

Állapot: specifikációtervezet. Függőség: működő helyi MVP. Közös követelmények: [task.md](../task.md). Ez a fázis a 0001 P10 fennmaradó kiadási munkáját viszi tovább; nem backend-fejlesztés.

## Eredmény

A tulajdonos laptopjától függetlenül elérhető TopoGok, HTTPS-en, ingyenes szolgáltatói címen. A jelenlegi két téma vendégként használható, az offline PWA és biztonságos frissítés megmarad. Külön tesztelési/előnézeti környezet szolgál a későbbi változtatásokhoz.

## Scope

- A GitHub-repó (`kinarovK/topogok`) és a helyi checkout összekötése 2026-11-10-én megtörtént; az F1 erre építi a CI-t és a kiadási folyamatot.
- A „Névjegy és források” oldal eltávolítása a felületről (tulajdonosi döntés, 2026-11-10).
- Tulajdonosi Cloudflare-fiók és statikus hosting előkészítése, ingyenes csomaggal. A személyes fióklétrehozási lépéseket és titkokat nem kell chatbe másolni.
- Reprodukálható build, CI kapuk, a tesztelt artifact kiadása, szolgáltatói URL, HTTPS, biztonsági fejlécek.
- Éles és tesztkiadás elkülönítése; későbbi backend-adatok nem keveredhetnek a két környezet között.
- Frissítési és visszaállítási eljárás, éles smoke és valódi telefonos ellenőrzés.

Nem scope: diákfiók, backend, új játékszabály, új térkép, saját domain, fizetős csomag vagy áruházi build. A jelenlegi SHP-kat és backupokat nem tesszük weben letölthetővé a build részeként.

## Elfogadási feltételek

| ID | Feltétel |
|---|---|
| F1-01 | A szolgáltatói HTTPS-címen a laptop/dev server kikapcsolt állapotában is betölt az alkalmazás. |
| F1-02 | Közigazgatás és tektonika vendég gyakorlása/számonkérése működik; hu/uk és világos/sötét nézet ellenőrzött. |
| F1-03 | Teljes első letöltés után offline kör végigjátszható; nincs téves offline-kész jelzés hiányzó cache-nél. |
| F1-04 | Kiadás előtt lint, typecheck, szabálytesztek, adatvalidáció, build és böngészős smoke sikeres; sikertelen kapu mellett nincs éles deploy. |
| F1-05 | Előnézeti változtatás nem írja felül az éles oldalt. Az éles artifacthoz commit/build/adatverzió azonosítható. |
| F1-06 | Éles fejlécek, helyi worker és hiányzó külső font/tile függőség ellenőrizve. Titok, forrás-SHP vagy helyi backup nem kerül a publikált csomagba. |
| F1-07 | A→B frissítés aktív körrel és több tabbal nem szakítja meg a játékot; visszaállítás/recovery próbáról bizonyíték készül. |
| F1-08 | Ingyenes csomag és kvóták rögzítve; nincs fizetős túllépés vagy szolgáltatás automatikus bekapcsolása. |
| F1-09 | A szolgáltatói erőforrás a tulajdonosé; a GitHub-repó valódi hozzárendelése dokumentált, hozzáférési titkok nem verziókövetettek. |
| F1-10 | Kiadási előfeltételek (adatforrás/licenc, telefonos próbák) igazolva vagy konkrétan nyitottként jelentve; nyitott előfeltétellel a fázis nem jelenthető teljesen kiadottnak. |

## Átadás

Valós éles és előnézeti URL, build/kiadási leírás, CI bizonyíték, mobil/offline/frissítési próba, visszaállítási útmutató. Ha fiókhozzáférés hiányzik, az előkészítés elvégezhető, de publikált URL nem található ki. A jelenlegi specifikáció elkészítése önmagában nem hajt végre deployt.
