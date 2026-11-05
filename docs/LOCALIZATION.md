# Lokalizáció

## Nyelvek és választás

A v1 támogatott kódjai `hu` és `uk`. Az ukrán ISO nyelvkód **uk**, nem `ua`; UA országkód. A választóban „Magyar” és „Українська” szerepeljen, ne kizárólag zászló.

Első indulás: a böngésző elsődleges nyelvének normalizált alapkódja `uk` esetén ukrán, egyébként magyar. Példák: uk-UA → uk; hu-HU → hu; en-US → hu. Nem választjuk a másodlagos ukránt az elsődleges angol helyett. Ha már van érvényes kézi beállítás, az megelőzi a böngészőt. Ismeretlen vagy sérült tárolt értéket figyelmen kívül hagyunk.

Nyelvváltáskor a dokumentum `lang` attribútuma, minden felirat és kérdésnév azonnal vált. A feature ID, kérdéssor, kijelölés, kísérletszám, pont és óra nem változik. Mindkét nyelvi csomag része az offline cache-nek.

## Szerkezet

`src/i18n/hu.json`, `src/i18n/uk.json`, típusozott kulcsok és közös `t()` hozzáférés. Rövid felületszöveghez elég egyszerű interpoláció; ne legyen magyar mondattöredékekből összerakott ukrán mondat. Szám, százalék és idő formázása locale szerint. A `hu-HU` és `uk-UA` explicit formázó locale használható.

Kulcscsoportok: `common`, `home`, `setup`, `game`, `practice`, `assessment`, `result`, `explore`, `settings`, `help`, `pwa`, `errors`, `sources`. A földrajzi neveket a GeoJSON `names[locale]` adja, nem a UI szótára és nem a régi DBF `name` mezője.

## Mintaszövegek a végrehajtónak

| Kulcs | Magyar | Українська |
|---|---|---|
| home.practice | Gyakorlás | Практика |
| home.assessment | Számonkérés | Перевірка знань |
| home.explore | Térkép felfedezése | Ознайомлення з картою |
| setup.count | Kérdések száma | Кількість запитань |
| setup.all | Mindegyik ({count}) | Усі ({count}) |
| setup.noLimit | Nincs időkorlát | Без обмеження часу |
| setup.start | Indítás | Почати |
| game.find | Keresd meg: {name} | Знайди: {name} |
| game.confirm | Válasz véglegesítése | Підтвердити відповідь |
| game.next | Következő | Далі |
| practice.wrong | Helytelen. Próbáld újra! | Неправильно. Спробуй ще раз! |
| practice.correct | Helyes! | Правильно! |
| practice.reveal | Mutasd meg | Показати відповідь |
| practice.repeat | Hibák ismétlése | Повторення помилок |
| assessment.expired | Lejárt az idő. | Час вичерпано. |
| result.firstTry | Elsőre helyes | Правильно з першої спроби |
| result.correct | Helyes válaszok | Правильні відповіді |
| result.duration | Időtartam | Тривалість |
| result.grade | Jegy | Оцінка |
| common.restart | Újrakezdés | Почати заново |
| common.continue | Folytatom | Продовжити |
| pwa.ready | Az alkalmazás offline is használható. | Застосунок готовий до роботи офлайн. |

Ez kiinduló tartalomjegyzék, nem a teljes szótár. Minden hibaüzenet, dialógus, aria-label, telepítési segítség és forrásszöveg is lefordítandó. A kulcsok pontos halmaza egyezzen a két JSON-ban; paraméterek is egyezzenek. Kiadási ellenőrzésként kézi olvasás kell mindkét nyelven; anyanyelvi lektorálást csak akkor jelentsünk, ha valóban megtörtént.

## Fallback és hibák

Hiányzó runtime szövegnél magyar fallback és fejlesztői figyelmeztetés. CI-ben a hiányzó hu/uk kulcs vagy földrajzi név hiba, nem megengedett normál kiadási állapot. A felhasználónak ne jelenjen meg nyers kulcs vagy `undefined`. A név megjelenítésénél biztonságos szövegkezelés, nem HTML-beszúrás.

Az opcionális angol adatnév megőrizhető a jövő számára; nincs angol UI kapcsoló vagy részlegesen angol oldal. Új nyelv később a Locale unió, szótár és adatnevek együttes bővítése; nem runtime adminfelület.
