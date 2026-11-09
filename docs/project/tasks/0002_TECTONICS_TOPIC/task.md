# 0002 – Tektonikai téma (Ukrajna lemeztektonikai egységei)

## Állapot (2026-11-09)

- **Adatcsomag: kész, validált** (`public/data/ukraine-tectonics/2026.11.09.1/`, `reports/tectonics-validation.json`, előnézet: `reports/tectonics-preview.png`).
- **Alkalmazásba építés: kész (2026-11-10).**
  - A főoldal témaválasztó (tulajdonosi döntés). Folyamat: téma → Gyakorlás / Számonkérés / Térkép felfedezése → beállítás.
  - Kérdésszám tektonikánál: 5 vagy Mindegyik (11), a 12-es lehetőség nem jelenik meg (tulajdonosi döntés).
  - A 11 egységen kívüli szárazföld (Nyugat-európai tábla, Duna mente, Krími-síkság, Kercsi-félsziget) semleges szürke háttér. Rákoppintva nem jelöl ki választ, és nem fogyaszt próbálkozást. Ezt a súgó, a játék és a felfedezés is közli.
  - E2E: tektonikai gyakorlás mind a 11 egységgel (1100/1100), szürke terület nem válasz, ukrán számonkérés 4/5 → 80%, 10-es jegy; offline kör tektonikával. Teljes futás: 24/24 PASS.

## Tulajdonosi döntések

- Forrás: a tankönyv/tanmenet tektonikai térképe, a tulajdonos szerint szabadon felhasználhatónak jelölve. Konkrét forrás és licencszöveg még nincs rögzítve; a manifest `provenance.status` értéke `unverified`.
- Csak az alábbi 11 egység kerül a térképre, törésvonal, város és vízrajz nem:

| ID | Magyar | Українська |
|---|---|---|
| TU-01 | Ukrán-pajzs | Український щит |
| TU-02 | Voronyezsi kristályos masszívum | Воронезький кристалічний масив |
| TU-03 | Volinyi–Podóliai-tábla | Волино-Подільська плита |
| TU-04 | Donyeci gyűrt szerkezet | Донецька складчаста споруда |
| TU-05 | Dnyeper–Donyeci-medence | Дніпровсько-Донецька западина |
| TU-06 | Lembergi-medence | Львівська западина |
| TU-07 | Fekete-tenger melléki medence | Причорноморська западина |
| TU-08 | Kárpátok előtere menti süllyedék | Передкарпатський прогин |
| TU-09 | Kárpáti gyűrt szerkezet | Карпатська складчаста споруда |
| TU-10 | Kárpátaljai-medence | Закарпатський прогин |
| TU-11 | A Krími-hegység gyűrt-rögös szerkezete | Складчасто-брилова споруда Гірського Криму |

## Ténylegesen elvégzett ellenőrzések

- 11 ID, a hu/uk nevek egyeznek a tulajdonos listájával.
- A geometria érvényes: zárt gyűrűk, nincs önmetszés.
- Átfedés: 0 mintapont a 0,02°-os rácson. Az egységek 0,12%-a esik a határvonal mentén kívülre (simítás).
- Georeferálás: a forráskép határvonala és a mi országhatárunk közötti eltérés mediánja 1,6 px (~1,8 km); a legnagyobb eltérések a part menti részleteknél vannak.
- Az egységek összterülete 576 090 km², az ország 599 095 km². A különbség a háttérben maradó, nem kérdezhető szárazföld.

Nyitott: nyelvi lektorálás, a forrás adatai, alkalmazásintegráció, vizuális tanári ellenőrzés.
