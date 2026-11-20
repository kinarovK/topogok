"""10th grade (regions and countries of the world) source layers: sources/grade10/<topic>/*.geojson.

Countries, land and rivers from Natural Earth (public domain; 1:10m countries from the Ukraine point of view, 1:50m
land, 1:10m rivers). City and region points from atlas knowledge – to be checked by the owner. Very small states are
points. Usage: python3 make_sources.py <natural-earth-vector checkout> <out-dir>
"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from geolib import Countries, feature, land, line, pts, rivers, writer

NE, OUT = sys.argv[1], sys.argv[2]
write = writer(OUT); C = Countries(NE); LAND = 'shp/ne_50m_land.shp'
def base(topic, window, cell=0.05): write(topic, 'hatter', [feature('land', 'Szárazföld', 'Суходіл', {'type': 'MultiPolygon', 'coordinates': [[[list(p) for p in r] for r in poly] for poly in land(LAND, window, cell)]})])
def areas(rows, cell=0.05, window=None): return [C.area(i, hu, uk, ne, cell, window) for i, hu, uk, ne in rows]

# --- 1. Európa országai (by the textbook's regions) -------------------------------------------------------------
EU_WIN = (-25.0, 34.0, 60.0, 71.5)
base('europa', EU_WIN, 0.03)
write('europa', 'nyugat', areas([
    ('ausztria', 'Ausztria', 'Австрія', 'Austria'), ('belgium', 'Belgium', 'Бельгія', 'Belgium'), ('luxemburg', 'Luxemburg', 'Люксембург', 'Luxembourg'),
    ('hollandia', 'Hollandia', 'Нідерланди', 'Netherlands'), ('nemetorszag', 'Németország', 'Німеччина', 'Germany'),
    ('franciaorszag', 'Franciaország', 'Франція', 'France'), ('svajc', 'Svájc', 'Швейцарія', 'Switzerland'),
], 0.02, EU_WIN) + pts([('liechtenstein', 'Liechtenstein', 'Ліхтенштейн', 9.55, 47.15), ('monaco', 'Monaco', 'Монако', 7.42, 43.74)]))
write('europa', 'eszak', areas([
    ('egyesultkiralysag', 'Egyesült Királyság', 'Сполучене Королівство', 'United Kingdom'), ('dania', 'Dánia', 'Данія', 'Denmark'),
    ('izland', 'Izland', 'Ісландія', 'Iceland'), ('irorszag', 'Írország', 'Ірландія', 'Ireland'), ('esztorszag', 'Észtország', 'Естонія', 'Estonia'),
    ('lettorszag', 'Lettország', 'Латвія', 'Latvia'), ('litvania', 'Litvánia', 'Литва', 'Lithuania'), ('norvegia', 'Norvégia', 'Норвегія', 'Norway'),
    ('svedorszag', 'Svédország', 'Швеція', 'Sweden'), ('finnorszag', 'Finnország', 'Фінляндія', 'Finland'),
], 0.03, EU_WIN))
write('europa', 'del', areas([
    ('albania', 'Albánia', 'Албанія', 'Albania'), ('andorra', 'Andorra', 'Андорра', 'Andorra'), ('bosznia', 'Bosznia-Hercegovina', 'Боснія і Герцеговина', 'Bosnia and Herz.'),
    ('gorogorszag', 'Görögország', 'Греція', 'Greece'), ('spanyolorszag', 'Spanyolország', 'Іспанія', 'Spain'), ('olaszorszag', 'Olaszország', 'Італія', 'Italy'),
    ('eszakmacedonia', 'Észak-Macedónia', 'Північна Македонія', 'North Macedonia'), ('malta', 'Málta', 'Мальта', 'Malta'), ('portugalia', 'Portugália', 'Португалія', 'Portugal'),
    ('szerbia', 'Szerbia', 'Сербія', 'Serbia'), ('szlovenia', 'Szlovénia', 'Словенія', 'Slovenia'), ('horvatorszag', 'Horvátország', 'Хорватія', 'Croatia'),
    ('montenegro', 'Montenegró', 'Чорногорія', 'Montenegro'),
], 0.02, EU_WIN) + pts([('vatikan', 'Vatikán', 'Ватикан', 12.45, 41.90), ('sanmarino', 'San Marino', 'Сан-Марино', 12.46, 43.94)]))
write('europa', 'kelet', areas([
    ('feheroroszorszag', 'Fehéroroszország', 'Білорусь', 'Belarus'), ('bulgaria', 'Bulgária', 'Болгарія', 'Bulgaria'), ('lengyelorszag', 'Lengyelország', 'Польща', 'Poland'),
    ('romania', 'Románia', 'Румунія', 'Romania'), ('szlovakia', 'Szlovákia', 'Словаччина', 'Slovakia'), ('csehorszag', 'Csehország', 'Чехія', 'Czechia'),
    ('magyarorszag', 'Magyarország', 'Угорщина', 'Hungary'), ('ukrajna', 'Ukrajna', 'Україна', 'Ukraine'), ('moldova', 'Moldova', 'Молдова', 'Moldova'),
    ('oroszorszageuropai', 'Oroszország európai része', 'Європейська частина Росії', 'Russia'),
], 0.03, EU_WIN))

# --- 2. Ázsia országai ---------------------------------------------------------------------------------------------
AS_WIN = (25.0, -11.5, 150.0, 56.0)
base('azsia', AS_WIN, 0.05)
write('azsia', 'kelet', areas([
    ('kina', 'Kína', 'Китай', 'China'), ('mongolia', 'Mongólia', 'Монголія', 'Mongolia'), ('japan', 'Japán', 'Японія', 'Japan'),
    ('eszakkorea', 'Észak-Korea', 'Північна Корея', 'Dem. Rep. Korea'), ('delkorea', 'Dél-Korea', 'Південна Корея', 'Republic of Korea'), ('tajvan', 'Tajvan', 'Тайвань', 'Taiwan'),
], 0.05, AS_WIN))
write('azsia', 'delkelet', areas([
    ('mianmar', 'Mianmar', 'М’янма', 'Myanmar'), ('thaifold', 'Thaiföld', 'Таїланд', 'Thailand'), ('laosz', 'Laosz', 'Лаос', 'Laos'),
    ('kambodzsa', 'Kambodzsa', 'Камбоджа', 'Cambodia'), ('vietnam', 'Vietnam', 'В’єтнам', 'Vietnam'), ('malajzia', 'Malajzia', 'Малайзія', 'Malaysia'),
    ('indonezia', 'Indonézia', 'Індонезія', 'Indonesia'), ('brunei', 'Brunei', 'Бруней', 'Brunei'), ('fulopszigetek', 'Fülöp-szigetek', 'Філіппіни', 'Philippines'),
    ('keletitimor', 'Kelet-Timor', 'Східний Тимор', 'Timor-Leste'),
], 0.04, AS_WIN) + pts([('szingapur', 'Szingapúr', 'Сінгапур', 103.82, 1.35)]))
write('azsia', 'del', areas([
    ('india', 'India', 'Індія', 'India'), ('pakisztan', 'Pakisztán', 'Пакистан', 'Pakistan'), ('banglades', 'Banglades', 'Бангладеш', 'Bangladesh'),
    ('nepal', 'Nepál', 'Непал', 'Nepal'), ('bhutan', 'Bhután', 'Бутан', 'Bhutan'), ('srilanka', 'Srí Lanka', 'Шрі-Ланка', 'Sri Lanka'),
], 0.05, AS_WIN) + pts([('maldiv', 'Maldív-szigetek', 'Мальдіви', 73.51, 4.18)]))
write('azsia', 'kozep', areas([
    ('kazahsztan', 'Kazahsztán', 'Казахстан', 'Kazakhstan'), ('uzbegisztan', 'Üzbegisztán', 'Узбекистан', 'Uzbekistan'), ('turkmenisztan', 'Türkmenisztán', 'Туркменістан', 'Turkmenistan'),
    ('kirgizisztan', 'Kirgizisztán', 'Киргизстан', 'Kyrgyzstan'), ('tadzsikisztan', 'Tádzsikisztán', 'Таджикистан', 'Tajikistan'),
], 0.05, AS_WIN))
write('azsia', 'nyugat', areas([
    ('iran', 'Irán', 'Іран', 'Iran'), ('afganisztan', 'Afganisztán', 'Афганістан', 'Afghanistan'), ('torokorszag', 'Törökország', 'Туреччина', 'Turkey'),
    ('gruzia', 'Grúzia', 'Грузія', 'Georgia'), ('ormenyorszag', 'Örményország', 'Вірменія', 'Armenia'), ('azerbajdzsan', 'Azerbajdzsán', 'Азербайджан', 'Azerbaijan'),
    ('ciprus', 'Ciprus', 'Кіпр', 'Cyprus'), ('sziria', 'Szíria', 'Сирія', 'Syria'), ('libanon', 'Libanon', 'Ліван', 'Lebanon'), ('izrael', 'Izrael', 'Ізраїль', 'Israel'),
    ('palesztina', 'Palesztina', 'Палестина', 'Palestine'), ('jordania', 'Jordánia', 'Йорданія', 'Jordan'), ('irak', 'Irak', 'Ірак', 'Iraq'), ('kuvait', 'Kuvait', 'Кувейт', 'Kuwait'),
    ('szaudarabia', 'Szaúd-Arábia', 'Саудівська Аравія', 'Saudi Arabia'), ('katar', 'Katar', 'Катар', 'Qatar'), ('eae', 'Egyesült Arab Emírségek', 'Об’єднані Арабські Емірати', 'United Arab Emirates'),
    ('oman', 'Omán', 'Оман', 'Oman'), ('jemen', 'Jemen', 'Ємен', 'Yemen'),
], 0.03, AS_WIN) + pts([('bahrein', 'Bahrein', 'Бахрейн', 50.55, 26.07)]))

# --- 3. Amerika országai --------------------------------------------------------------------------------------------
AM_WIN = (-170.0, -56.5, -30.0, 72.0)
base('amerika', AM_WIN, 0.1)
write('amerika', 'foorszagok', areas([
    ('kanada', 'Kanada', 'Канада', 'Canada'), ('usa', 'Amerikai Egyesült Államok', 'Сполучені Штати Америки', 'United States'), ('mexiko', 'Mexikó', 'Мексика', 'Mexico'),
    ('brazilia', 'Brazília', 'Бразилія', 'Brazil'), ('argentina', 'Argentína', 'Аргентина', 'Argentina'), ('chile', 'Chile', 'Чилі', 'Chile'), ('peru', 'Peru', 'Перу', 'Peru'),
    ('kolumbia', 'Kolumbia', 'Колумбія', 'Colombia'), ('venezuela', 'Venezuela', 'Венесуела', 'Venezuela'), ('bolivia', 'Bolívia', 'Болівія', 'Bolivia'),
    ('ecuador', 'Ecuador', 'Еквадор', 'Ecuador'), ('paraguay', 'Paraguay', 'Парагвай', 'Paraguay'), ('uruguay', 'Uruguay', 'Уругвай', 'Uruguay'),
], 0.1, AM_WIN))
write('amerika', 'tovabbi', areas([
    ('guatemala', 'Guatemala', 'Гватемала', 'Guatemala'), ('belize', 'Belize', 'Беліз', 'Belize'), ('honduras', 'Honduras', 'Гондурас', 'Honduras'),
    ('salvador', 'Salvador', 'Сальвадор', 'El Salvador'), ('nicaragua', 'Nicaragua', 'Нікарагуа', 'Nicaragua'), ('costarica', 'Costa Rica', 'Коста-Рика', 'Costa Rica'),
    ('panama', 'Panama', 'Панама', 'Panama'), ('kuba', 'Kuba', 'Куба', 'Cuba'), ('haiti', 'Haiti', 'Гаїті', 'Haiti'), ('dominikai', 'Dominikai Köztársaság', 'Домініканська Республіка', 'Dominican Rep.'),
    ('jamaica', 'Jamaica', 'Ямайка', 'Jamaica'), ('bahama', 'Bahama-szigetek', 'Багамські Острови', 'Bahamas'), ('trinidad', 'Trinidad és Tobago', 'Тринідад і Тобаго', 'Trinidad and Tobago'),
    ('guyana', 'Guyana', 'Гаяна', 'Guyana'), ('suriname', 'Suriname', 'Суринам', 'Suriname'),
], 0.03, AM_WIN))

# --- 4. Óceánia: Ausztrália városai, Óceánia nagytérségei és államai (points) ------------------------------------
OC_WIN = (110.0, -48.0, 180.0, 22.0)
base('oceania', OC_WIN, 0.05)
write('oceania', 'ausztraliavarosok', pts([
    ('canberra', 'Canberra', 'Канберра', 149.13, -35.28), ('sydney', 'Sydney', 'Сідней', 151.21, -33.87), ('melbourne', 'Melbourne', 'Мельбурн', 144.96, -37.81),
    ('brisbane', 'Brisbane', 'Брисбен', 153.03, -27.47), ('perth', 'Perth', 'Перт', 115.86, -31.95), ('adelaide', 'Adelaide', 'Аделаїда', 138.60, -34.93),
]))
write('oceania', 'allamok', [C.area('papuaujguinea', 'Pápua Új-Guinea', 'Папуа Нова Гвінея', 'Papua New Guinea', 0.05), C.area('ujzeland', 'Új-Zéland', 'Нова Зеландія', 'New Zealand', 0.05, (165.0, -48.0, 180.0, -33.0))] + pts([
    ('salamonszigetek', 'Salamon-szigetek', 'Соломонові Острови', 160.0, -9.6), ('vanuatu', 'Vanuatu', 'Вануату', 167.7, -16.0), ('fidzsi', 'Fidzsi', 'Фіджі', 178.0, -17.8),
    ('ujkaledonia', 'Új-Kaledónia', 'Нова Каледонія', 165.6, -21.3), ('mikroneziaiszov', 'Mikronéziai Szövetségi Államok', 'Федеративні Штати Мікронезії', 158.2, 6.9),
    ('marshall', 'Marshall-szigetek', 'Маршаллові Острови', 171.2, 7.1), ('palau', 'Palau', 'Палау', 134.6, 7.5), ('nauru', 'Nauru', 'Науру', 166.93, -0.52),
    ('kiribati', 'Kiribati', 'Кірибаті', 173.0, 1.4), ('guam', 'Guam', 'Гуам', 144.79, 13.44), ('eszakimariana', 'Északi-Mariana-szigetek', 'Північні Маріанські Острови', 145.75, 15.2),
    ('tonga', 'Tonga', 'Тонга', 179.8, -21.2), ('tuvalu', 'Tuvalu', 'Тувалу', 179.2, -8.5),
]))

# --- 5. Afrika gazdasága ---------------------------------------------------------------------------------------------
AF_WIN = (-26.0, -36.0, 60.0, 38.5)
base('afrika', AF_WIN, 0.05)
write('afrika', 'orszagok', areas([
    ('algeria', 'Algéria', 'Алжир', 'Algeria'), ('libia', 'Líbia', 'Лівія', 'Libya'), ('egyiptom', 'Egyiptom', 'Єгипет', 'Egypt'), ('nigeria', 'Nigéria', 'Нігерія', 'Nigeria'),
    ('angola', 'Angola', 'Ангола', 'Angola'), ('mauritania', 'Mauritánia', 'Мавританія', 'Mauritania'), ('liberia', 'Libéria', 'Ліберія', 'Liberia'), ('guinea', 'Guinea', 'Гвінея', 'Guinea'),
    ('delafrika', 'Dél-afrikai Köztársaság', 'Південно-Африканська Республіка', 'South Africa'), ('kongoidk', 'Kongói Demokratikus Köztársaság', 'Демократична Республіка Конго', 'Democratic Republic of the Congo'),
    ('zambia', 'Zambia', 'Замбія', 'Zambia'), ('tunezia', 'Tunézia', 'Туніс', 'Tunisia'), ('marokko', 'Marokkó', 'Марокко', 'Morocco'), ('zimbabwe', 'Zimbabwe', 'Зімбабве', 'Zimbabwe'),
    ('kenya', 'Kenya', 'Кенія', 'Kenya'), ('tanzania', 'Tanzánia', 'Танзанія', 'Tanzania'),
], 0.05, AF_WIN) + pts([('seychelle', 'Seychelle-szigetek', 'Сейшельські Острови', 55.45, -4.62)]))
write('afrika', 'kozpontok', pts([
    ('kairo', 'Kairó', 'Каїр', 31.24, 30.04), ('algir', 'Algír', 'Алжир (місто)', 3.06, 36.75), ('johannesburg', 'Johannesburg', 'Йоганнесбург', 28.05, -26.20),
    ('pretoria', 'Pretoria', 'Преторія', 28.19, -25.75), ('witwatersrand', 'Witwatersrand (aranybányászat)', 'Вітватерсранд (золото)', 27.4, -26.3),
    ('rezovezet', 'Kongó–Zambia rézövezet', 'Мідний пояс Конго–Замбії', 27.5, -12.0),
]))
write('afrika', 'kikotok', pts([
    ('casablanca', 'Casablanca', 'Касабланка', -7.59, 33.57), ('dakar', 'Dakar', 'Дакар', -17.45, 14.69), ('fokvaros', 'Fokváros', 'Кейптаун', 18.42, -33.92),
    ('durban', 'Durban', 'Дурбан', 31.02, -29.86), ('mombasa', 'Mombasa', 'Момбаса', 39.67, -4.04), ('portsaid', 'Port Said', 'Порт-Саїд', 32.30, 31.26),
    ('alexandria', 'Alexandria', 'Александрія', 29.92, 31.20), ('lagos', 'Lagos', 'Лагос', 3.39, 6.45), ('daresszalam', 'Dar es-Salaam', 'Дар-ес-Салам', 39.28, -6.79),
    ('richardsbay', 'Richards Bay', 'Річардс-Бей', 32.04, -28.78), ('forcados', 'Forcados', 'Форкадос', 5.36, 5.36), ('portharcourt', 'Port Harcourt', 'Порт-Гаркорт', 7.01, 4.78),
]))
write('afrika', 'csatornak', [line('szuezicsatorna', 'Szuezi-csatorna', 'Суецький канал', (32.30, 31.25), (32.32, 30.6), (32.34, 30.3), (32.56, 29.95))])

# --- 6–12. Country chapters: country areas, main cities and regions (points), rivers ------------------------------
def chapter(topic, window, cell, countries, cities, river_rows=None, extra=None):
    base(topic, window, 0.05 if cell >= 0.05 else 0.03)
    write(topic, 'orszagok', areas(countries, cell, window))
    write(topic, 'varosok', pts(cities))
    if river_rows: write(topic, 'folyok', rivers(NE, river_rows))
    for layer, feats in (extra or {}).items(): write(topic, layer, feats)

chapter('nyugateuropa', (-11.0, 35.5, 25.0, 61.0), 0.03, [
    ('nemetorszag', 'Németország', 'Німеччина', 'Germany'), ('franciaorszag', 'Franciaország', 'Франція', 'France'),
    ('egyesultkiralysag', 'Egyesült Királyság', 'Сполучене Королівство', 'United Kingdom'), ('olaszorszag', 'Olaszország', 'Італія', 'Italy'), ('lengyelorszag', 'Lengyelország', 'Польща', 'Poland'),
], [
    ('berlin', 'Berlin', 'Берлін', 13.40, 52.52), ('hamburg', 'Hamburg', 'Гамбург', 9.99, 53.55), ('munchen', 'München', 'Мюнхен', 11.58, 48.14), ('koln', 'Köln', 'Кельн', 6.96, 50.94),
    ('frankfurt', 'Frankfurt am Main', 'Франкфурт-на-Майні', 8.68, 50.11), ('stuttgart', 'Stuttgart', 'Штутгарт', 9.18, 48.78), ('ruhrvidek', 'Ruhr-vidék', 'Рурський регіон', 7.2, 51.5),
    ('parizs', 'Párizs', 'Париж', 2.35, 48.86), ('lyon', 'Lyon', 'Ліон', 4.84, 45.76), ('marseille', 'Marseille', 'Марсель', 5.37, 43.30), ('toulouse', 'Toulouse', 'Тулуза', 1.44, 43.60),
    ('bordeaux', 'Bordeaux', 'Бордо', -0.58, 44.84), ('lille', 'Lille', 'Лілль', 3.06, 50.63), ('lehavre', 'Le Havre', 'Гавр', 0.11, 49.49),
    ('london', 'London', 'Лондон', -0.13, 51.51), ('birmingham', 'Birmingham', 'Бірмінгем', -1.89, 52.49), ('manchester', 'Manchester', 'Манчестер', -2.24, 53.48),
    ('liverpool', 'Liverpool', 'Ліверпуль', -2.98, 53.41), ('glasgow', 'Glasgow', 'Глазго', -4.25, 55.86), ('edinburgh', 'Edinburgh', 'Единбург', -3.19, 55.95),
    ('cardiff', 'Cardiff', 'Кардіфф', -3.18, 51.48), ('belfast', 'Belfast', 'Белфаст', -5.93, 54.60),
    ('roma', 'Róma', 'Рим', 12.50, 41.90), ('milano', 'Milánó', 'Мілан', 9.19, 45.46), ('torino', 'Torino', 'Турин', 7.69, 45.07), ('genova', 'Genova', 'Генуя', 8.93, 44.41),
    ('napoly', 'Nápoly', 'Неаполь', 14.27, 40.85), ('velence', 'Velence', 'Венеція', 12.33, 45.44),
    ('varso', 'Varsó', 'Варшава', 21.01, 52.23), ('krakko', 'Krakkó', 'Краків', 19.94, 50.06), ('lodz', 'Łódź', 'Лодзь', 19.46, 51.76), ('poznan', 'Poznań', 'Познань', 16.93, 52.41),
    ('wroclaw', 'Wrocław', 'Вроцлав', 17.04, 51.11), ('katowice', 'Katowice', 'Катовиці', 19.02, 50.26), ('gdansk', 'Gdańsk', 'Гданськ', 18.65, 54.35), ('gdynia', 'Gdynia', 'Гдиня', 18.53, 54.52),
    ('szczecin', 'Szczecin', 'Щецин', 14.55, 53.43),
], {'rajna': ('Rajna', 'Рейн', [967, 968, 986]), 'elba': ('Elba', 'Ельба', [954]), 'duna': ('Duna', 'Дунай', [996, 997]),
    'visztula': ('Visztula', 'Вісла', [957, 958]), 'odera': ('Odera', 'Одра', [979])})

chapter('oroszorszag', (19.0, 41.0, 180.0, 78.0), 0.08, [('oroszorszag', 'Oroszország', 'Росія', 'Russia')], [
    ('moszkva', 'Moszkva', 'Москва', 37.62, 55.76), ('szentpetervar', 'Szentpétervár', 'Санкт-Петербург', 30.32, 59.94), ('novoszibirszk', 'Novoszibirszk', 'Новосибірськ', 82.92, 55.03),
    ('jekatyerinburg', 'Jekatyerinburg', 'Єкатеринбург', 60.61, 56.84), ('nyizsnyijnovgorod', 'Nyizsnyij Novgorod', 'Нижній Новгород', 44.00, 56.33), ('kazany', 'Kazany', 'Казань', 49.11, 55.79),
    ('kuzbassz', 'Kuzbassz', 'Кузбас', 86.9, 54.6), ('kurszkianomalia', 'Kurszki mágneses anomália', 'Курська магнітна аномалія', 37.3, 51.3),
    ('volgavidek', 'Volga-vidék', 'Поволжя', 47.0, 53.5), ('nyugatsziberia', 'Nyugat-Szibéria', 'Західний Сибір', 73.0, 61.0),
    ('keletsziberia', 'Kelet-Szibéria', 'Східний Сибір', 105.0, 62.0), ('tavolkelet', 'Távol-Kelet', 'Далекий Схід', 135.0, 55.0),
], {'volga': ('Volga', 'Волга', [991, 992])}, {'hegysegek': [line('ural', 'Urál', 'Урал', (59.0, 68.0), (60.5, 64.0), (59.5, 60.0), (59.0, 56.0), (58.5, 52.5), (58.0, 51.0))]})

chapter('keletazsia', (95.0, 18.0, 146.0, 54.0), 0.05, [
    ('kina', 'Kína', 'Китай', 'China'), ('japan', 'Japán', 'Японія', 'Japan'), ('delkorea', 'Dél-Korea', 'Південна Корея', 'Republic of Korea'),
], [
    ('peking', 'Peking', 'Пекін', 116.40, 39.90), ('sanghaj', 'Sanghaj', 'Шанхай', 121.47, 31.23), ('tiencsin', 'Tiencsin', 'Тяньцзінь', 117.20, 39.13),
    ('csungking', 'Csungking', 'Чунцін', 106.55, 29.56), ('kuangcsou', 'Kuangcsou (Kanton)', 'Гуанчжоу', 113.26, 23.13), ('sencsen', 'Sencsen', 'Шеньчжень', 114.06, 22.54),
    ('hongkong', 'Hongkong', 'Гонконг', 114.17, 22.32),
    ('tokio', 'Tokió', 'Токіо', 139.69, 35.69), ('jokohama', 'Jokohama', 'Йокогама', 139.64, 35.44), ('oszaka', 'Oszaka', 'Осака', 135.50, 34.69), ('kobe', 'Kóbe', 'Кобе', 135.19, 34.69),
    ('kioto', 'Kiotó', 'Кіото', 135.77, 35.01), ('nagoja', 'Nagoja', 'Нагоя', 136.91, 35.18),
    ('szoul', 'Szöul', 'Сеул', 126.98, 37.57), ('incshon', 'Incshon', 'Інчхон', 126.70, 37.46), ('puszan', 'Puszan', 'Пусан', 129.08, 35.18),
], {'jangce': ('Jangce', 'Янцзи', [745, 763, 760]), 'huangho': ('Huangho', 'Хуанхе', [695, 696, 720])})

chapter('india', (60.0, 5.0, 98.0, 37.5), 0.05, [('india', 'India', 'Індія', 'India')], [
    ('ujdelhi', 'Újdelhi', 'Нью-Делі', 77.21, 28.61), ('mumbai', 'Mumbai', 'Мумбаї', 72.88, 19.08), ('kolkata', 'Kolkata', 'Колката', 88.36, 22.57),
    ('bengaluru', 'Bengaluru', 'Бенгалуру', 77.59, 12.97), ('chennai', 'Chennai', 'Ченнаї', 80.27, 13.08),
])

chapter('eszakamerika', (-170.0, 18.0, -50.0, 72.0), 0.08, [
    ('usa', 'Amerikai Egyesült Államok', 'Сполучені Штати Америки', 'United States'), ('kanada', 'Kanada', 'Канада', 'Canada'),
], [
    ('washington', 'Washington', 'Вашингтон', -77.04, 38.91), ('newyork', 'New York', 'Нью-Йорк', -74.01, 40.71), ('losangeles', 'Los Angeles', 'Лос-Анджелес', -118.24, 34.05),
    ('chicago', 'Chicago', 'Чикаго', -87.63, 41.88), ('boston', 'Boston', 'Бостон', -71.06, 42.36), ('sanfrancisco', 'San Francisco', 'Сан-Франциско', -122.42, 37.77),
    ('detroit', 'Detroit', 'Детройт', -83.05, 42.33), ('houston', 'Houston', 'Х’юстон', -95.37, 29.76), ('dallas', 'Dallas', 'Даллас', -96.80, 32.78),
    ('sziliciumvolgy', 'Szilícium-völgy', 'Кремнієва долина', -122.0, 37.35),
    ('ottawa', 'Ottawa', 'Оттава', -75.70, 45.42), ('toronto', 'Toronto', 'Торонто', -79.38, 43.65), ('montreal', 'Montréal', 'Монреаль', -73.57, 45.50),
    ('vancouver', 'Vancouver', 'Ванкувер', -123.12, 49.28), ('calgary', 'Calgary', 'Калгарі', -114.07, 51.05), ('edmonton', 'Edmonton', 'Едмонтон', -113.49, 53.55),
    ('quebec', 'Québec', 'Квебек', -71.21, 46.81),
], {'szentlorinc': ('Szent Lőrinc-folyó', 'Річка Святого Лаврентія', [1458])})

chapter('brazilia', (-75.0, -34.5, -34.0, 6.0), 0.05, [('brazilia', 'Brazília', 'Бразилія', 'Brazil')], [
    ('brasilia', 'Brasília', 'Бразиліа', -47.88, -15.79), ('saopaulo', 'São Paulo', 'Сан-Паулу', -46.63, -23.55), ('riodejaneiro', 'Rio de Janeiro', 'Ріо-де-Жанейро', -43.17, -22.91),
    ('belohorizonte', 'Belo Horizonte', 'Белу-Оризонті', -43.94, -19.92), ('portoalegre', 'Porto Alegre', 'Порту-Алегрі', -51.23, -30.03), ('manaus', 'Manaus', 'Манаус', -60.02, -3.12),
])

chapter('egyiptomdaf', (-20.0, -36.0, 52.0, 38.0), 0.05, [
    ('egyiptom', 'Egyiptom', 'Єгипет', 'Egypt'), ('delafrika', 'Dél-afrikai Köztársaság', 'Південно-Африканська Республіка', 'South Africa'),
], [
    ('kairo', 'Kairó', 'Каїр', 31.24, 30.04), ('alexandria', 'Alexandria', 'Александрія', 29.92, 31.20), ('portsaid', 'Port Said', 'Порт-Саїд', 32.30, 31.26), ('szuez', 'Szuez', 'Суец', 32.55, 29.97),
    ('pretoria', 'Pretoria', 'Преторія', 28.19, -25.75), ('johannesburg', 'Johannesburg', 'Йоганнесбург', 28.05, -26.20), ('fokvaros', 'Fokváros', 'Кейптаун', 18.42, -33.92),
    ('durban', 'Durban', 'Дурбан', 31.02, -29.86), ('bloemfontein', 'Bloemfontein', 'Блумфонтейн', 26.21, -29.12), ('portelizabeth', 'Port Elizabeth', 'Порт-Елізабет', 25.60, -33.96),
], {'nilus': ('Nílus', 'Ніл', [748, 749])}, {'csatornak': [line('szuezicsatorna', 'Szuezi-csatorna', 'Суецький канал', (32.30, 31.25), (32.32, 30.6), (32.34, 30.3), (32.56, 29.95))]})
