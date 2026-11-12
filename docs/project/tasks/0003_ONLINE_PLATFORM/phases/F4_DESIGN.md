# F4 – Design és végrehajtási terv: tanári kérdezhető elemkészletek

Dátum: 2026-11-13. Állapot: **design, tulajdonosi jóváhagyásra (docs PR)**.
Követelmények: [F4_TOPIC_SETTINGS.md](F4_TOPIC_SETTINGS.md). Erre épül: [F2_DESIGN.md](F2_DESIGN.md), [F3_DESIGN.md](F3_DESIGN.md) (a takarékos, körönként két kérés elve itt is érvényes).

## 0. Tulajdonosi döntések (2026-11-13: mind a négy javaslat elfogadva)

1. **Új fejlesztői elem egy későbbi adatfrissítésben:** automatikusan **bekapcsolt** a tanároknál is. Ezért a szerver a **kikapcsolt** elemek listáját tárolja: ami nincs rajta, az kérdezhető. Az adatfrissítésből kikerült ID-t a szerver figyelmen kívül hagyja.
2. **Tanári „Legjobb (teljes kör)”:** a tanári panelen a szűkített készlet „Mindegyik” köre is teljes körnek számít, „szűkített” jelzéssel. Az F5-ös toplistára viszont **soha** nem kerül fel (F4-09).
3. **Felfedezés mód:** a teljes térkép marad. A tanári beállítás csak a gyakorlásra és a számonkérésre hat, ahogy a specifikáció írja.
4. **Kikapcsolt terület megjelenése:** szürke, név és kiemelés nélkül, nem kattintható. A rákattintás semmit nem csinál, így próbálkozást sem fogyaszt.

## 1. Összkép

```
 Tanár:  Tanári felület → „Témák” fül → téma → jelölőnégyzetek (hu/uk név) → Mentés
           PUT /api/topic-settings/:topicId {disabled[], baseVersion}   (1 kérés mentésenként)

 Diák:   GET /api/me (alkalmazásindításkor, már most is van) → topicSettings a saját tanártól
         kör indítása: a böngésző a kapott készletből sorsol; POST /api/attempts {…, settingsVersion}
         szerver: a SAJÁT tárolt készletéből számolja a kérdéssort; eltérő verzió → 409, a kör nem menthető
```

- **Nincs új kérés a diák körénél.** A beállítás a már meglévő `/api/me` válaszban érkezik, az ellenőrzés a már meglévő indítókérésben történik. Körönként marad a két kérés.
- **A szerver dönt (F4-07).** Az indításkor a szerver a tanár tárolt készletéből számolja a kérdéssort. A diák által küldött halmazt nem fogadja el, csak a verziószámot hasonlítja össze.

## 2. Adatmodell (`migrations/0003_topic_settings.sql`)

`topic_settings`:
- `teacher_id`, `topic_id` (együtt elsődleges kulcs);
- `disabled_ids` (JSON tömb);
- `version` (egész szám, minden mentéskor +1);
- `updated_at`, `updated_by`.

Alapállapot: nincs sor, `version = 0`, minden elem kérdezhető. A „mindet visszaállítás” üres listát ment, a sort nem törli, így a verzió nem ugrik vissza.

Az `attempts` tábla két új oszlopot kap:
- `settings_version`;
- `restricted` (1, ha a kör szűkített készletből indult).

A régi körök értéke 0, vagyis teljes térkép.

## 3. API

| Végpont | Ki | Mit csinál |
|---|---|---|
| `GET /api/topic-settings` | tanár (szuperadmin: `teacherId`) | Az összes témára: `disabled`, `version`. |
| `PUT /api/topic-settings/:topicId` | tanár (szuperadmin: `teacherId`) | `{disabled, baseVersion}`. Az ismeretlen ID és a „mind kikapcsolva” → 400 (F4-03). Ha a `baseVersion` nem a tárolt verzió → **409** a friss állapottal (F4-06: nincs csendes felülírás). Naplóba kerül: téma, darabszám, ki. |
| `GET /api/me` | diák | Kiegészül: `topicSettings: {topicId: {disabled, version}}` a saját tanártól. |
| `POST /api/attempts` | diák | Kiegészül: `settingsVersion`. Ha eltér a tároltól → **409** `settings_changed` + a friss beállítás. A kör ilyenkor nem menthető, a böngésző frissíti a beállítást a következő körhöz. |

Más tanár beállítása nem kérhető le és nem írható (F2-es hatókör, idegen ID → 404).

## 4. Kliens

- **Tanári „Témák” fül:**
  - téma kiválasztása, majd jelölőnégyzetes lista ábécérendben, a felület nyelvén (a nevek a meglévő témaadatból jönnek, nincs szerverkérés);
  - „Mind” / „Egyik sem” gomb, kiválasztott darabszám („8 / 27 kérdezhető”);
  - a Mentés gomb csak változás és legalább egy kiválasztott elem esetén aktív.
  - Ütközéskor (409) ezt írja ki: „Közben máshol módosították, betöltöttük a mentett állapotot.”
- **Diák beállítóképernyő:** a kérdésszám-választó a kérdezhető elemszámból számol. A téma lehetőségei közül csak a kérdezhető elemszámnál kisebbek maradnak, a „Mindegyik (n)” mindig ott van (F4-04):

  | n | Opciók |
  |---|---|
  | 1, 3, 5 | Mindegyik (n) |
  | 8, 11, 12 | 5, Mindegyik (n) |
  | 27 | 5, 12, Mindegyik (27) |

  Ha a tanár szűkített, a „Tanárod X elemet jelölt ki” felirat látszik.
- **Játék:**
  - a kikapcsolt terület szürke, nem kattintható, nincs rajta név (F4-05);
  - az aktív kör a saját indításkori készletével fut végig (F4-06).
- **Vendég és kijelentkezés:** a beállítás csak a memóriában lévő `me` állapotban van. Kijelentkezés után ez nullázódik, így a vendég mindig a teljes térképet kapja (F4-08). Nincs `localStorage`, nincs PWA-gyorsítótár.

## 5. Terhelés

- A tanári mentés 1 írás.
- A `/api/me` 1 további olvasást kap.
- A diák körénél nincs új kérés.

Az ingyenes keretre hatása elhanyagolható.

## 6. Tesztek

- **API:**
  - mentés, ütközés (409) és ismeretlen vagy üres készlet;
  - hatókör: tanár × tanár, a diák nem írhat;
  - az indítás a tárolt készletből sorsol, verzióeltérésnél 409;
  - a régi verzióval indított kör lezárása helyes marad;
  - szűkített kör: `restricted = 1`.
- **Unit:** kérdésszám-opciók 1/3/5/8/11/12/27 elemre.
- **E2E (valódi API-val):**
  - a tanár két elemre szűkít, a diák csak „Mindegyik (2)”-t lát, és csak azt a kettőt kérdezi a játék;
  - a kikapcsolt terület kattintása nem fogy;
  - másik tanár diákja teljes térképet kap;
  - kijelentkezés után a vendég teljes térképet kap.
- **Preview:** a smoke `schema = 3`-at vár.

## 7. Terv

1. Ez a PR: a design.
2. **F4 megvalósítás, egy PR-ban:**
   - migráció, API;
   - tanári „Témák” fül hu/uk nyelven;
   - beállítóképernyő és térkép;
   - tesztek, dokumentáció.
