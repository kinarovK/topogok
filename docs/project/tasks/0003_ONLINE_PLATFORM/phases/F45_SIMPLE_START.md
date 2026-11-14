# F4.5 – Egyszerűbb indítás

Állapot: **megvalósítva, a `staging` ágban** (2026-11-13). Tulajdonosi kérés és döntések: [DECISIONS.md](../DECISIONS.md), 2026-11-13.

## Változás

- **Gyakorlás:** nincs beállítóképernyő.
  - A téma oldalán a „Gyakorlás” gombra kattintva azonnal megnyílik a térkép az **összes kérdezhető elemmel**. Vendégnél ez a teljes téma, bejelentkezett diáknál a tanára által engedélyezett elemek (F4).
  - Az **eltelt idő mindig látszik**, és a kör végén mentődik (F3).
  - A gyakorló pontozás változatlan.
- **Számonkérés:** a beállítóképernyőn csak a kérdésszám maradt (5 / 12 / Mindegyik, az F4 szerint a kérdezhető elemszámhoz igazítva). **Időkorlát-választó nincs**, alapból nincs korlát, és nincs visszaszámláló.
- A `src/domain` és a szerver továbbra is ismeri az időkorlátot. Így a régi, időkorlátos körök a tanári panelen értelmezhetők maradnak, és egy frissítés előtti kliens köre sem lesz érvénytelen. Új időkorlátos kör a felületről nem indítható.

## Hatás a többi fázisra

- F5: a toplistán csak az időkorlát nélküli számonkérés vehet részt. Ez mostantól minden új számonkérésre teljesül.
- A tanári „Legjobb (teljes kör)” mező a gyakorlásban mindig teljes kört mutat, mert a gyakorlás mindig az összes kérdezhető elemmel megy.

## Tesztek

E2E (`tests/e2e/game.spec.ts`):
- a gyakorlás azonnal indul, látszik az óra;
- 11 elemes vegyes kör: 960/1100, 9/11, 81,8%;
- a számonkérésnél nincs időkorlát és nincs visszaszámláló;
- a tektonika és a kontinensek számonkérésnél csak 5 és Mindegyik.

Az időkorlát lejáratát továbbra is unit- és API-tesztek fedik (domain, F3 visszajátszás).
