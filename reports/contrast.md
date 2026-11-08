# Kontrasztmérés (2026-11-08)

Módszer: WCAG 2.x relatív fénysűrűség-képlet a `src/styles/tokens.css` és a `src/map/mapStyle.ts` színeire. Ez számított érték, nem képernyőről mért. Cél: szöveg 4,5:1; lényegi UI-állapot 3:1.

| Pár | Világos | Sötét | Cél |
|---|---:|---:|---:|
| szöveg / háttér | 14,36 | 16,26 | 4,5 |
| szöveg / felület | 15,42 | 13,79 | 4,5 |
| másodlagos szöveg / háttér | 5,88 | 10,17 | 4,5 |
| másodlagos szöveg / felület | 6,31 | 8,63 | 4,5 |
| primer gomb szövege / primer | 6,97 | 8,86 | 4,5 |
| „Helytelen” szöveg / felület | 7,48 | 8,87 | 4,5 |
| „Helyes” szöveg / felület | 7,39 | 10,47 | 4,5 |
| kijelölés körvonala / terület | 5,25 | 4,41 | 3 |
| hibás terület körvonala / terület | 5,63 | 5,21 | 3 |
| belső határ / terület | 3,74 | 4,02 | 3 |
| kijelölt kitöltés / terület | 1,33 | 1,29 | – |
| hibás kitöltés / terület | 1,33 | 1,02 | – |
| helyes kitöltés / terület | 1,15 | 1,14 | – |

A kitöltőszínek önmagukban gyengén különülnek el a nyugalmi területtől. A térképi állapotot ezért mindig 3 px-es, legalább 4,4:1 kontrasztú körvonal jelzi, gyakorlásban pedig ikon és szöveg is (pl. „✗ Helytelen. Próbáld újra!”). A STYLE_GUIDE szerint a színek nem helyettesítik a szöveges állapotot. Ha a kitöltésnek magának is el kell érnie a 3:1-et, az tokenmódosítás, és tulajdonosi jóváhagyást igényel.

Teljes WCAG AA megfelelőséget ez a mérés nem igazol, és nem is állítunk.
