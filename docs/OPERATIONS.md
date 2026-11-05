# Fejlesztés, kiadás és üzemeltetés

## Repo és környezet

Projektgyökér: `D:\Work\Suli\Topo`, külön helyi Git-repó. A tágabb `D:\Work\Suli` más iskolai anyagai nem részei. A távoli Git-szolgáltató és Cloudflare-projekt még nincs kiválasztva/létrehozva. Az első helyi repó létrehozása nem jelenti nyilvános repó létrehozását.

A runtime-verziót és csomagverziókat implementációkor rögzíteni kell. Egyetlen npm lockfile; CI-ben tiszta `npm ci`. A frontend futtatásához a már validált GeoJSON elegendő. Új SHP feldolgozásához dokumentált GDAL/GEOS környezet kell; a jelenlegi Windows QGIS útvonal nem lehet CI-be égetett feltétel.

## Tartalomfrissítés

1. Új inputot először külön ideiglenes helyen ellenőrizz; a korábbi fájlcsoportot mentsd el.
2. Ellenőrizd a licencet, CRS-t, ID-ket, a teljes hu/uk névkészletet és geometriát.
3. Változásról készíts jelentést: új/törölt ID, név és geometriai eltérés. Az eltérő darabszám scope-változás, nem csendes javítás.
4. Generálj új `dataVersion` csomagot, futtasd a teljes adatellenőrzést és térképi smoke-ot.
5. Az alkalmazásbuild ugyanazt az adatverziót referálja a manifestben, precache-ben és eredmény metadata mezőiben.
6. Kiadás után a régi futó kör a korábbi csomaggal fejeződik be; az új csomag csak frissítéskor aktiválódik.

## Verziózás

App semver: kezdeti prototípus 0.1.0, átvett stabil v1 1.0.0. Adatverzió külön semver vagy dátum+revízió, következetesen egy választott rendszerrel; javasolt `2026.11.05.1`. Manifest `schemaVersion` egész szám, változása migrációs/kompatibilitási döntés. Release record: appVersion, dataVersion, commit SHA, build hash, forráshashek és tesztjelentés. Verziót nem szabad pusztán marketingcélból késznek tekinteni.

## Cloudflare Pages kiadás

A cél statikus `dist` artifact HTTPS-en, szolgáltatói `pages.dev` címmel; a konkrét foglalható aldomaint csak létrehozáskor lehet megadni. Nincs saját domain, Functions vagy adatbázis. A statikus hosztolási mód a [Cloudflare dokumentációja](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/) szerint alakítandó.

CI sorrend: install → lint/typecheck → unit/integration → adatvalidáció/regenerálási diff → build → E2E smoke → artifact → engedélyezett deploy. Production branch `main`; preview külön címen. A deploy nem kerülheti meg a teszteket automatikus, párhuzamos Git-integrációval. CI-provider nincs előírva addig, amíg a távoli repo helye nem ismert.

Publikálás előfeltétele: dokumentált adatforrás és licenc, tulajdonosi hozzáférés/engedély, sikeres release gate. A licenc ismeretlensége miatt nyilvános preview sem kerülheti meg az adatkiadás ellenőrzését. A lokális implementáció folytatható.

## HTTP és csomag

A statikus fejlécek a buildbe másolt `_headers` fájlban kezelhetők a [Pages leírása](https://developers.cloudflare.com/pages/configuration/headers/) szerint. Elvárt: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, iframe-be ágyazás tiltása (`frame-ancestors 'none'`, kompatibilis X-Frame-Options), szükségtelen kamera/mikrofon/geolokáció tiltása.

CSP induló cél: default/script/connect/font/img források alapvetően self, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`. Worker és stílus kivételek kizárólag tényleges MapLibre bundle igény alapján; preferált a saját originről töltött worker. `unsafe-eval` ne kerüljön bele hiba elrejtésére. Runtime inline style szükségletét mérni és dokumentálni kell. Nem írunk elő ellenőrizetlen kész CSP stringet.

HTML, SW és verziójelző ne kapjon hosszú immutable cache-t. Hash-elt assetek kaphatnak hosszú cache-t. Publikus source map alapból nincs, fejlesztői artifactként megtartható. A distben ne legyen SHP, backup, report személyes adattal, `.env`, token vagy fejlesztői forrás. A production hálózati ellenőrzés a worker/glyph hívásokat is tartalmazza.

## PWA frissítés és több tab

A frissítési UI a [vite-plugin-pwa prompt módjára](https://vite-pwa-org.netlify.app/guide/prompt-for-update.html) épülhet, de az aktív kör és több tab koordinációja saját alkalmazásfelelősség. Nem használunk általános auto-update reloadot. Frissítés csak home/setup vagy már elolvasott eredmény állapotban, kifejezett műveletre; az eredmény memóriabeli elvesztésére figyelmeztetni kell.

Ha más tabon aktív kör van, a frissítés vár. A régi kliensek cache-ének takarítása nem történhet használat közben. Browser cache eviction után az offline támogatás megszűnhet az új letöltésig; a súgó ezt röviden közli. A telepítés böngészőfüggő, iOS-en kézi kezdőképernyőre helyezési útmutató is kell. Telepítési prompt nem blokkolhatja az első játékot.

## Visszaállítás

A Cloudflare [rollback funkciója](https://developers.cloudflare.com/pages/configuration/rollbacks/) a kiszolgált deploymentet állítja vissza. Ez nem jelenti, hogy a már telepített kliens SW/cache is azonnal visszaáll. Rögzített korábbi artifactot kell megtartani, majd a visszaállított kódot szükség esetén új recovery buildazonosítóval kiadni, hogy a kliens változást érzékeljen. Ne használjunk numerikus „csak nagyobb appverzió lehet frissítés” feltételt; a buildtartalom/hash és kompatibilitás számít.

Próba: A működő build → B új build → visszaállított A-tartalmú recovery build. Online frissítés és offline indulás is működjön. Aktív kör nem veszhet el automatikus reload miatt. Hibás SW-csapda esetére a súgóban helyreállítási lépések: online oldal újranyitása, frissítés; végső esetben adott oldal helyi adatainak törlése és új letöltés. Ez a nyelv/téma beállítást törölheti, eredményarchívum nincs.

## Adatvédelem és üzemeltetési határ

Az alkalmazás nem kér és nem küld neveket, osztályt, válaszokat vagy eredményt; nincs analitika és hirdetés. A hoszting szolgáltató szokásos hálózati infrastruktúrája ettől független, ezért ne állítsuk, hogy a teljes internetes szolgáltatás semmilyen technikai naplót nem kezel. Nincs appoldali felhasználóprofil vagy követő süti. A preferenciák helyileg törölhetők a böngészőből; külön adatkezelő adminfelület nem szükséges.

## Kiadási ellenőrzőlista

- [ ] Adatforrás/licenc és szükséges forrásmegjelölés igazolt.
- [ ] 27 névpár, geometria és country-unió ellenőrzött.
- [ ] Build/lockfile/runtime reprodukálható, minden CI kapu sikeres.
- [ ] Valódi eszközös ellenőrzések és hiányzó próbák rögzítve.
- [ ] Két nyelv, két téma, minden játékmód, teljes offline kör működik.
- [ ] A→B frissítés, többtabos aktív kör, recovery próba dokumentált.
- [ ] CSP és hálózati audit sikeres, nincs külső szükségtelen hívás.
- [ ] Release record, ismert korlátok és tulajdonosi átvétel elkészült.
- [ ] Publikálás után HTTPS címen smoke megtörtént; URL csak valódi deploy után közölve.
