// Fixed pipeline configuration. The ID/name list mirrors docs/DATA_CONTRACT.md.
export const TOPIC_ID = 'ukraine-administration';
export const DATA_VERSION = '2026.11.05.1';

export const EXPECTED_REGIONS: Record<string, { hu: string; uk: string }> = {
  'UA-05': { hu: 'Vinnicjai terület', uk: 'Вінницька область' },
  'UA-07': { hu: 'Volinyi terület', uk: 'Волинська область' },
  'UA-09': { hu: 'Luhanszki terület', uk: 'Луганська область' },
  'UA-12': { hu: 'Dnyipropetrovszki terület', uk: 'Дніпропетровська область' },
  'UA-14': { hu: 'Donecki terület', uk: 'Донецька область' },
  'UA-18': { hu: 'Zsitomiri terület', uk: 'Житомирська область' },
  'UA-21': { hu: 'Kárpátalja', uk: 'Закарпатська область' },
  'UA-23': { hu: 'Zaporizzsjai terület', uk: 'Запорізька область' },
  'UA-26': { hu: 'Ivano-frankivszki terület', uk: 'Івано-Франківська область' },
  'UA-30': { hu: 'Kijev', uk: 'Київ' },
  'UA-32': { hu: 'Kijevi terület', uk: 'Київська область' },
  'UA-35': { hu: 'Kirovohradi terület', uk: 'Кіровоградська область' },
  'UA-40': { hu: 'Szevasztopol', uk: 'Севастополь' },
  'UA-43': { hu: 'Krími Autonóm Köztársaság', uk: 'Автономна Республіка Крим' },
  'UA-46': { hu: 'Lvivi terület', uk: 'Львівська область' },
  'UA-48': { hu: 'Mikolajivi terület', uk: 'Миколаївська область' },
  'UA-51': { hu: 'Odesszai terület', uk: 'Одеська область' },
  'UA-53': { hu: 'Poltavai terület', uk: 'Полтавська область' },
  'UA-56': { hu: 'Rivnei terület', uk: 'Рівненська область' },
  'UA-59': { hu: 'Szumi terület', uk: 'Сумська область' },
  'UA-61': { hu: 'Ternopili terület', uk: 'Тернопільська область' },
  'UA-63': { hu: 'Harkivi terület', uk: 'Харківська область' },
  'UA-65': { hu: 'Herszoni terület', uk: 'Херсонська область' },
  'UA-68': { hu: 'Hmelnickiji terület', uk: 'Хмельницька область' },
  'UA-71': { hu: 'Cserkaszi terület', uk: 'Черкаська область' },
  'UA-74': { hu: 'Csernyihivi terület', uk: 'Чернігівська область' },
  'UA-77': { hu: 'Csernyivci terület', uk: 'Чернівецька область' },
};

/** Inset view = anchor bbox expanded on every side by this fraction of its larger side. */
export const INSET_PADDING_RATIO = 0.6;

export const INSETS = [
  { id: 'kyiv', anchorFeatureId: 'UA-30', title: { hu: 'Kijev környéke', uk: 'Київ і околиці' } },
  { id: 'sevastopol', anchorFeatureId: 'UA-40', title: { hu: 'Szevasztopol környéke', uk: 'Севастополь і околиці' } },
];

/**
 * Owner statement (2026-11-05): the maps are vectorised from open sources for educational use.
 * No concrete source link or licence was given, so nothing here is verified.
 */
export const PROVENANCE = {
  source: 'Гільберг Т. Г., Довгань А. І., Савчук І. Г. Географія : підруч. для 8-го кл. закл. заг. серед. освіти. — Київ : Генеза, 2025. — 256 с. ISBN 978-617-8468-07-1; форзац «Адміністративно-територіальний устрій України», М 1 : 4 500 000',
  sourceUrl: null,
  license: null,
  licenseUrl: null,
  status: 'unverified',
  ownerStatement: {
    hu: 'A tulajdonos közlése szerint a határok a megjelölt tankönyvi térképről, oktatási célra vektorizált, egyszerűsített ábrázolások. A tankönyv szerzői jogi védelem alatt áll (© a szerzők, © Geneza); külön felhasználási engedély vagy nyílt licenc nincs rögzítve.',
    uk: 'За повідомленням власника, межі векторизовано зі вказаної карти підручника для освітніх цілей у спрощеному вигляді. Підручник захищений авторським правом (© автори, © «Генеза»); окремого дозволу чи відкритої ліцензії не зафіксовано.',
  },
} as const;
