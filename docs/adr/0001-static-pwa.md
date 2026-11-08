# ADR-0001 – Statikus, előfeldolgozott adatokkal működő PWA

Dátum: 2026-11-05. Állapot: a termékirány jóváhagyott; a technikai megvalósítás 2026-11-08-án elkészült a helyi MVP-ben (Vite 8, React 19, MapLibre 6, vite-plugin-pwa 2). A Cloudflare-kiadás még nem történt meg.

## Kontextus

A tulajdonos Androidon, iOS-en és számítógépen használható kvízt szeretne áruházi publikálás nélkül. Az első téma rendelkezésre áll SHP formátumban, új témákat egyelőre a fejlesztő ad hozzá. Nincs bejelentkezés vagy eredménymentés, a számonkérés felügyelt.

## Döntés

Statikus React/TypeScript/Vite PWA, MapLibre megjelenítéssel és build előtti SHP→GeoJSON feldolgozással. Külön verziózott app és adatcsomag, együtt kiadva. Cloudflare Pages szolgáltatói címen. Csak nyelv/téma tartós; a játék memóriában él. Frissítés felhasználói kezdeményezéssel, aktív kör megőrzésével.

## Következmények

Egy kódbázis és egyszerű statikus üzemeltetés; az offline használathoz előzetes teljes letöltés kell. Nincs központi eredményhitelesítés. A kliens teljes adatkészletet kap, ezért a megoldások technikailag hozzáférhetők. Az adatfrissítés kiadási folyamat, nem adminművelet. A nyelvi és domain logika különválasztása később lehetővé teszi backend integrálását újraírt játékszabályok nélkül, de ehhez most nem építünk üres szolgáltatásrétegeket.

## Elvetett alternatívák

- Natív mobilapp / MAUI / áruházi wrapper: nincs v1 igény áruházra vagy natív funkcióra.
- Szerveroldali pontozás és auth: későbbi távoli számonkéréshez lehet szükséges, most nem.
- Böngészős SHP-feltöltés: a tartalmak előre rögzítettek, felesleges UI és hibafelület.
- Külső alaptérkép: offline és adatvédelmi célokhoz nem kell, a saját országkörvonal elég.
- SVG térképrenderelés: lehetséges kisebb alternatíva, de a jóváhagyott stack MapLibre. Csak mérési eredmény alapján új döntéssel váltható.

## Dokumentációs támpontok

A pontos API-k implementációkor újra ellenőrzendők a választott verzióhoz. A terv készítésekor ellenőrzött primer források:

- [Vite PWA: frissítési értesítés](https://vite-pwa-org.netlify.app/guide/prompt-for-update.html).
- [MapLibre GL JS dokumentáció és worker-integráció](https://github.com/maplibre/maplibre-gl-js/blob/main/docs/index.md).
- [Cloudflare Pages statikus hosztolás](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/).
- [Cloudflare Pages fejlécek](https://developers.cloudflare.com/pages/configuration/headers/).
- [Cloudflare Pages visszaállítás](https://developers.cloudflare.com/pages/configuration/rollbacks/).
