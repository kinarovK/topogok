# F1 – Megvalósítás, kiadási folyamat és tulajdonosi lépések

Dátum: 2026-11-10. Ág: `f1/online-guest-release`. Specifikáció: [F1_HOSTING.md](F1_HOSTING.md).

Ez a dokumentum az F1 design-, plan- és átadási leírása egyben. A kód és a CI elkészült. **Éles kiadás még nem történt.** Ahhoz a tulajdonos Cloudflare-fiókja és két GitHub-secret kell (lent, „Tulajdonosi lépések”). Valós URL-t csak az első sikeres deploy után közlünk.

## 1. Mi változott az alkalmazásban

- **Névjegy és források oldal törölve** (tulajdonosi döntés). Nincs gomb, nézet és szótárkulcs sem. Az adatforrás állapotát továbbra is a dokumentáció és a `manifest.json` `provenance` mezője rögzíti.
- **Kiadásazonosító.** A Súgó alján ez áll: `Verzió: <appVersion> (build: <commit7>) · adatok: <dataVersion…>`. A build mellé `version.json` is készül (`appVersion`, `buildId`, `commitTime`, `dataVersions`), `no-cache` fejléccel. A `buildId` CI-ben a commit rövid SHA-ja, helyben a `git rev-parse` eredménye. Felülírható a `TOPOGOK_BUILD_ID` és a `TOPOGOK_APP_VERSION` változóval. A service worker precache-e tartalom-hash alapú, ezért minden új build változásként jelenik meg a klienseknél (a recovery build is).

## 2. CI és kiadás (`.github/workflows/ci.yml`)

Minden pushra (minden ágon) lefut a `gates` job, Ubuntu 24.04-en, Node 22.23.4-gyel, tiszta `npm ci`-vel:

1. `npm run lint`, `npm run typecheck`, `npm test` (32 szabály-, óra-, adat- és szótárteszt)
2. `npm run data:validate`: az adatcsomag bájtra újragenerálható a forrásokból
3. `npm run build`: produkciós build, precache- és tiltottfájl-kapuval (SHP, backup, docs, src, sourcemap, `.env`)
4. `npm run build:e2e`
5. `scripts/release/smoke.mjs` a helyben kiszolgált buildre: fejlécek, `version.json` = commit, minden precache-elt URL elérhető, a helyi MapLibre-worker immutable cache-sel jön, a tiltott útvonalak nincsenek publikálva
6. `npx playwright install --with-deps chromium` és `npm run test:e2e` (24 böngészős teszt, köztük a teljes offline kör és az A→B→recovery frissítés)

A `deploy` job csak akkor indul, ha **minden** kapu sikeres (`needs: gates`). Ugyanazt a `dist/`-et tölti fel, amelyet a kapuk teszteltek: a GitHub cache-ből veszi vissza, nem buildel újra. Előtte újra lefuttatja a `verify-dist`-et. Cloudflare Pages Direct Uploadot használ, rögzített `wrangler@4.160.0` verzióval:

| Push | Cloudflare-ág | Cím | Éleset érinti? |
|---|---|---|---|
| `main` | `main` (production branch) | `https://topogok.pages.dev` | igen |
| bármely más ág | az ág neve | `https://<ág>.topogok.pages.dev` és egy deploymentenkénti hash-cím | **nem** |

Feltöltés után a `smoke.mjs` a valódi HTTPS-címen is lefut. Itt a `http→https` átirányítást is ellenőrzi, `main` esetén az éles címet is. Ha a secretek nincsenek beállítva, a deploy job kihagyja a feltöltést, és ezt a futás összefoglalójába írja. Ez **nem hiba**: ezért fut zölden a CI már most is.

**Nincs GitHub-artifact feltöltés.** A fiók korábban betelt Actions-artifact tárhelye miatt a tesztelt csomag a repó cache-ében utazik a két job között (külön 10 GB-os keret), a Playwright-riport pedig nem kerül feltöltésre.

Nem használunk Cloudflare Git-integrációt. Ha a tulajdonos mégis bekötné a repót a Cloudflare-ben, az a CI kapuit megkerülve buildelne. Ezt az F1_HOSTING F1-04 és az OPERATIONS tiltja.

## 3. Ingyenes keretek (F1-08)

| Szolgáltatás | Keret (ingyenes csomag) | Várható használat |
|---|---|---|
| Cloudflare Pages Free | 500 deploy/hó, 20 000 fájl/oldal, 25 MiB/fájl, korlátlan sávszélesség és kérés statikus fájlokra, korlátlan preview | ~22 fájl, legnagyobb ~1 MiB; pushonként 1 deploy |
| GitHub Free, privát repó | 2 000 Actions-perc/hó, 10 GB cache/repó | ~6–10 perc pushonként → ~200 push/hó fér bele |

Nem használunk Functions-t, KV-t, D1-et, Workers-t, saját domaint vagy Cloudflare Accesst. A Pages Free csomagban nincs automatikus fizetős túllépés: a keret elérésekor a deploy elutasul, nem számláz. Fizetős csomag csak külön tulajdonosi döntéssel aktiválható. A GitHub-oldalon a fizetési limit („spending limit”) alapértéke 0 USD; ezt nem szabad megemelni.

## 4. Tulajdonosi lépések (egyszer)

A titkokat nem kell, és nem is szabad a chatbe vagy a repóba másolni.

1. **Cloudflare-fiók:** regisztráció a dash.cloudflare.com oldalon, Free csomag. Kártyaadatot nem kell megadni.
2. **Pages-projekt létrehozása:** Workers & Pages → Create → Pages → „Upload assets” (Direct Upload, **nem** „Connect to Git”). Projektnév: `topogok`. Ha ez foglalt, más név is választható; akkor a `ci.yml` `CF_PAGES_PROJECT` értékét is át kell írni. Production branch: `main`. Az első feltöltéshez bármilyen kis mappa jó (pl. egy `index.html`), a CI később felülírja.
3. **Account ID:** a Workers & Pages oldal jobb oldali sávjában látszik.
4. **API-token:** My Profile → API Tokens → Create Token → Custom token. Jogosultság: *Account → Cloudflare Pages → Edit*. Account resources: csak a saját fiók. Lejárat: például 1 év.
5. **GitHub-secretek:** a repó Settings → Secrets and variables → Actions → New repository secret oldalán: `CLOUDFLARE_API_TOKEN` és `CLOUDFLARE_ACCOUNT_ID`.
6. Ezután az első push vagy a „Run workflow” (Actions → ci) elvégzi a deployt. A címet a futás összefoglalója mutatja.

A secretek beállítása egyben azt is jelenti, hogy a tulajdonos vállalja: az alkalmazás nyilvános `pages.dev` címen lesz elérhető, még nem igazolt adatlicenccel (lásd 6. pont). A preview-címek is nyilvánosak, csak nem kitalálhatók.

## 5. Visszaállítás (F1-07)

1. **Gyors visszaállítás:** Cloudflare dashboard → a projekt → Deployments → egy korábbi sikeres production deployment → „Rollback to this deployment”. Ez azonnal a régi fájlokat szolgálja ki. A már frissített kliensek a régi service workert új verzióként érzékelik, mert a precache-tartalom eltér, és a megszokott frissítési jelzést kapják. Aktív kör közben nincs automatikus újratöltés.
2. **Tartós javítás (recovery build):** `git revert` a hibás commitokra, PR, majd merge a `main`-be. A CI új `buildId`-vel építi újra a korábbi tartalmat. Ez a hosszú távú állapot; a dashboard-rollback csak áthidalás.
3. A recovery-folyamatot az E2E-teszt bizonyítja (T21): A build → B build (aktív körrel és két lappal) → A-tartalmú, új azonosítójú recovery build. A kliens frissül rá, és utána offline is a recovery verzióval indul.

## 6. Átvételi állapot

| ID | Állapot | Bizonyíték / hiány |
|---|---|---|
| F1-01 | **NYITOTT** | Cloudflare-fiók és secretek nélkül nincs deploy. |
| F1-02 | PASS emulációban | E2E: mindkét téma, mindkét mód, hu/uk, világos/sötét. Az éles címen és valódi telefonon NOT RUN. |
| F1-03 | PASS (Chromium) | T19, T20 E2E |
| F1-04 | PASS (konfiguráció) | `deploy` csak `needs: gates` után fut; az első GitHub-futás eredménye a PR-ban látszik |
| F1-05 | PASS (konfiguráció) | csak a `main` ág ír élesre; `version.json` és Súgó-verziósor |
| F1-06 | PASS helyben | `verify-dist`, `smoke.mjs`. Az éles fejléc-ellenőrzés automatikusan lefut az első deploy után. |
| F1-07 | PASS (Chromium) | T21: A→B aktív körrel, két lappal, recovery build, offline indulás |
| F1-08 | PASS | 3. pont; nincs fizetős szolgáltatás a konfigurációban |
| F1-09 | részben | a repó privát és a tulajdonosé; a secretek csak a GitHub Secretsben vannak. Cloudflare-fiók még nincs. |
| F1-10 | **részben** | Forrás rögzítve: Гільберг–Довгань–Савчук: Географія 8 (Генеза, 2025), a `provenance.source` mezőben. A licenc nyitott: a tankönyv jogvédett, engedély nincs (`status = unverified`), a kiadás a tulajdonos kockázatvállalásával történik. Telefonos próba: a tulajdonos közlése szerint 2026-11-10-én rendben volt; az éles címen rövid ismétlés kell. |

Az F1 akkor jelenthető teljesen kiadottnak, ha az F1-01 és az F1-10 lezárul. Ehhez kell: az első éles deploy, a smoke a valódi címen, a tulajdonos telefonos próbája a TEST_PLAN „Tanári átvételi próba” szerint, és az adatlicenc tisztázása vagy tulajdonosi kockázatvállalása.
