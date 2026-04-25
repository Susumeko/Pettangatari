export interface InterfaceSettings {
  accentColor: string;
  wallpaperDataUrl: string;
  roleplayLanguagePreference: string;
}

export const ROLEPLAY_LANGUAGE_OPTIONS = [
  'Afrikaans',
  'Akan',
  'Albanian',
  'Algerian Arabic',
  'Amharic',
  'Arabic',
  'Aragonese',
  'Armenian',
  'Aromanian',
  'Assamese',
  'Awadhi',
  'Azerbaijani',
  'Balinese',
  'Balochi',
  'Bashkir',
  'Basque',
  'Bavarian',
  'Belarusian',
  'Bengali',
  'Bhojpuri',
  'Bosnian',
  'Breton',
  'Bulgarian',
  'Burmese',
  'Buryat',
  'Catalan',
  'Cebuano',
  'Chhattisgarhi',
  'Chittagonian',
  'Cornish',
  'Croatian',
  'Czech',
  'Danish',
  'Dari',
  'Deccan',
  'Dhivehi',
  'Dogri',
  'Dutch',
  'Eastern Min',
  'Egyptian Arabic',
  'English',
  'Erzya',
  'Estonian',
  'Faroese',
  'Filipino',
  'Finnish',
  'French',
  'Friulian',
  'Fula',
  'Galician',
  'Georgian',
  'German',
  'Greek',
  'Gujarati',
  'Haitian Creole',
  'Hakka Chinese',
  'Haryanvi',
  'Hausa',
  'Hebrew',
  'Hiligaynon',
  'Hindi',
  'Hmong',
  'Hungarian',
  'Icelandic',
  'Igbo',
  'Ilocano',
  'Indonesian',
  'Ingush',
  'Inari Sami',
  'Irish',
  'Italian',
  'Japanese',
  'Javanese',
  'Jin Chinese',
  'Jordanian Arabic',
  'Kachin',
  'Kalmyk',
  'Kannada',
  'Karelian',
  'Kashmiri',
  'Kashubian',
  'Kazakh',
  'Khmer',
  'Kinyarwanda',
  'Komi',
  'Konkani',
  'Korean',
  'Kurdish',
  'Kyrgyz',
  'Ladin',
  'Lao',
  'Latvian',
  'Ligurian',
  'Lingala',
  'Lithuanian',
  'Lombard',
  'Lower Sorbian',
  'Lule Sami',
  'Luxembourgish',
  'Macedonian',
  'Madurese',
  'Magahi',
  'Maithili',
  'Makassar',
  'Malay',
  'Malayalam',
  'Mandarin Chinese',
  'Manx',
  'Marathi',
  'Mari',
  'Marwari',
  'Minangkabau',
  'Min Nan Chinese',
  'Modern Standard Arabic',
  'Mongolian',
  'Montenegrin',
  'Moroccan Arabic',
  'Mossi',
  'Nepali',
  'Nigerian Pidgin',
  'Northern Pashto',
  'Northern Sami',
  'Norwegian',
  'Occitan',
  'Odia',
  'Ossetian',
  'Persian',
  'Polish',
  'Portuguese',
  'Punjabi',
  'Quechua',
  'Romanian',
  'Romansh',
  'Rundi',
  'Russian',
  'Rusyn',
  'Scottish Gaelic',
  'Serbian',
  'Shan',
  'Shona',
  'Sicilian',
  'Sindhi',
  'Sinhala',
  'Slovak',
  'Slovenian',
  'Somali',
  'Sorani Kurdish',
  'South Azerbaijani',
  'Southern Sami',
  'Spanish',
  'Sudanese Arabic',
  'Sunda',
  'Swahili',
  'Swedish',
  'Swiss German',
  'Sylheti',
  'Syriac',
  'Syrian Arabic',
  'Tagalog',
  'Tajik',
  'Tamil',
  'Tatar',
  'Telugu',
  'Thai',
  'Tibetan',
  'Tigrinya',
  'Tunisian Arabic',
  'Turkish',
  'Turkmen',
  'Udmurt',
  'Ukrainian',
  'Upper Sorbian',
  'Urdu',
  'Uyghur',
  'Uzbek',
  'Venetian',
  'Vietnamese',
  'Welsh',
  'Western Armenian',
  'Western Punjabi',
  'Wu Chinese',
  'Xhosa',
  'Xiang Chinese',
  'Yakut',
  'Yiddish',
  'Yoruba',
  'Yue Chinese (Cantonese)',
  'Zaza',
  'Zhuang',
  'Zulu',
] as const;

export const INTERFACE_SETTINGS_STORAGE_KEY = 'pettangatari:interface-settings';

export const DEFAULT_INTERFACE_SETTINGS: InterfaceSettings = {
  accentColor: '#D4A667',
  wallpaperDataUrl: '',
  roleplayLanguagePreference: 'English',
};

function normalizeHexColor(value: unknown, fallback = DEFAULT_INTERFACE_SETTINGS.accentColor): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  const withHash = raw.startsWith('#') ? raw : `#${raw}`;

  if (/^#[0-9a-fA-F]{3}$/.test(withHash)) {
    return `#${withHash
      .slice(1)
      .split('')
      .map((part) => `${part}${part}`)
      .join('')}`.toUpperCase();
  }

  return /^#[0-9a-fA-F]{6}$/.test(withHash) ? withHash.toUpperCase() : fallback;
}

export function normalizeInterfaceSettings(value: unknown): InterfaceSettings {
  const source = value && typeof value === 'object' ? (value as Partial<InterfaceSettings>) : {};
  return {
    accentColor: normalizeHexColor(source.accentColor),
    wallpaperDataUrl: typeof source.wallpaperDataUrl === 'string' ? source.wallpaperDataUrl.trim() : '',
    roleplayLanguagePreference:
      typeof source.roleplayLanguagePreference === 'string' && source.roleplayLanguagePreference.trim()
        ? source.roleplayLanguagePreference.trim()
        : DEFAULT_INTERFACE_SETTINGS.roleplayLanguagePreference,
  };
}

export function loadInterfaceSettings(): InterfaceSettings {
  if (typeof window === 'undefined') {
    return DEFAULT_INTERFACE_SETTINGS;
  }

  try {
    const stored = window.localStorage.getItem(INTERFACE_SETTINGS_STORAGE_KEY);
    if (!stored) {
      return DEFAULT_INTERFACE_SETTINGS;
    }

    return normalizeInterfaceSettings(JSON.parse(stored));
  } catch {
    return DEFAULT_INTERFACE_SETTINGS;
  }
}
