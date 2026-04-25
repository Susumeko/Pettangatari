export interface DialogueQuoteFontOption {
  id: string;
  label: string;
  family: string;
  cssUrl: string;
  kind: 'sans' | 'serif' | 'mono' | 'display' | 'script';
}

export const DIALOGUE_QUOTE_FONT_OPTIONS: DialogueQuoteFontOption[] = [
  { id: 'roboto-3', label: 'Roboto - Neutral', family: "'Roboto', sans-serif", cssUrl: 'https://fonts.cdnfonts.com/css/roboto-3', kind: 'sans' },
  { id: 'cinzel', label: 'Cinzel - Noble', family: "'Cinzel', serif", cssUrl: 'https://fonts.cdnfonts.com/css/cinzel', kind: 'serif' },
  { id: 'uncial-antiqua', label: 'Uncial Antiqua - Arcane', family: "'Uncial Antiqua', serif", cssUrl: 'https://fonts.cdnfonts.com/css/uncial-antiqua', kind: 'serif' },
  { id: 'playfair-display', label: 'Playfair Display - Elegant', family: "'Playfair Display', serif", cssUrl: 'https://fonts.cdnfonts.com/css/playfair-display', kind: 'serif' },
  { id: 'cormorant-garamond', label: 'Cormorant Garamond - Courtly', family: "'Cormorant Garamond', serif", cssUrl: 'https://fonts.cdnfonts.com/css/cormorant-garamond', kind: 'serif' },
  { id: 'merriweather', label: 'Merriweather - Dramatic', family: "'Merriweather', serif", cssUrl: 'https://fonts.cdnfonts.com/css/merriweather', kind: 'serif' },
  { id: 'lora', label: 'Lora - Reflective', family: "'Lora', serif", cssUrl: 'https://fonts.cdnfonts.com/css/lora', kind: 'serif' },
  { id: 'libre-baskerville', label: 'Libre Baskerville - Poised', family: "'Libre Baskerville', serif", cssUrl: 'https://fonts.cdnfonts.com/css/libre-baskerville', kind: 'serif' },
  { id: 'vollkorn', label: 'Vollkorn - Literary', family: "'Vollkorn', serif", cssUrl: 'https://fonts.cdnfonts.com/css/vollkorn', kind: 'serif' },
  { id: 'crimson-text', label: 'Crimson Text - Melancholic', family: "'Crimson Text', serif", cssUrl: 'https://fonts.cdnfonts.com/css/crimson-text', kind: 'serif' },
  { id: 'cardo', label: 'Cardo - Ancient', family: "'Cardo', serif", cssUrl: 'https://fonts.cdnfonts.com/css/cardo', kind: 'serif' },
  { id: 'great-vibes', label: 'Great Vibes - Romantic', family: "'Great Vibes', cursive", cssUrl: 'https://fonts.cdnfonts.com/css/great-vibes', kind: 'script' },
  { id: 'dancing-script', label: 'Dancing Script - Cheerful', family: "'Dancing Script', cursive", cssUrl: 'https://fonts.cdnfonts.com/css/dancing-script', kind: 'script' },
  { id: 'kaushan-script', label: 'Kaushan Script - Flirty', family: "'Kaushan Script', cursive", cssUrl: 'https://fonts.cdnfonts.com/css/kaushan-script', kind: 'script' },
  { id: 'yellowtail', label: 'Yellowtail - Smooth', family: "'Yellowtail', cursive", cssUrl: 'https://fonts.cdnfonts.com/css/yellowtail', kind: 'script' },
  { id: 'allura', label: 'Allura - Soft', family: "'Allura', cursive", cssUrl: 'https://fonts.cdnfonts.com/css/allura', kind: 'script' },
  { id: 'marck-script', label: 'Marck Script - Casual', family: "'Marck Script', cursive", cssUrl: 'https://fonts.cdnfonts.com/css/marck-script', kind: 'script' },
  { id: 'lobster', label: 'Lobster - Bold Charm', family: "'Lobster', cursive", cssUrl: 'https://fonts.cdnfonts.com/css/lobster', kind: 'script' },
  { id: 'pacifico', label: 'Pacifico - Playful', family: "'Pacifico', cursive", cssUrl: 'https://fonts.cdnfonts.com/css/pacifico', kind: 'script' },
  { id: 'satisfy', label: 'Satisfy - Warm', family: "'Satisfy', cursive", cssUrl: 'https://fonts.cdnfonts.com/css/satisfy', kind: 'script' },
  { id: 'caveat', label: 'Caveat - Personal', family: "'Caveat', cursive", cssUrl: 'https://fonts.cdnfonts.com/css/caveat', kind: 'script' },
  { id: 'bebas-neue', label: 'Bebas Neue - Confident', family: "'Bebas Neue', sans-serif", cssUrl: 'https://fonts.cdnfonts.com/css/bebas-neue', kind: 'display' },
  { id: 'bangers', label: 'Bangers - Comic Energy', family: "'Bangers', cursive", cssUrl: 'https://fonts.cdnfonts.com/css/bangers', kind: 'display' },
  { id: 'righteous', label: 'Righteous - Heroic', family: "'Righteous', sans-serif", cssUrl: 'https://fonts.cdnfonts.com/css/righteous', kind: 'display' },
  { id: 'permanent-marker', label: 'Permanent Marker - Rebellious', family: "'Permanent Marker', cursive", cssUrl: 'https://fonts.cdnfonts.com/css/permanent-marker', kind: 'display' },
  { id: 'special-elite', label: 'Special Elite - Noir', family: "'Special Elite', cursive", cssUrl: 'https://fonts.cdnfonts.com/css/special-elite', kind: 'display' },
  { id: 'amatic-sc', label: 'Amatic SC - Whimsical', family: "'Amatic SC', cursive", cssUrl: 'https://fonts.cdnfonts.com/css/amatic-sc', kind: 'display' },
  { id: 'orbitron', label: 'Orbitron - Sci-Fi', family: "'Orbitron', sans-serif", cssUrl: 'https://fonts.cdnfonts.com/css/orbitron', kind: 'display' },
  { id: 'audiowide', label: 'Audiowide - Neon', family: "'Audiowide', sans-serif", cssUrl: 'https://fonts.cdnfonts.com/css/audiowide', kind: 'display' },
  { id: 'jetbrains-mono', label: 'JetBrains Mono - Tactical', family: "'JetBrains Mono', monospace", cssUrl: 'https://fonts.cdnfonts.com/css/jetbrains-mono', kind: 'mono' },
  { id: 'press-start-2p', label: 'Press Start 2P - Retro', family: "'Press Start 2P', monospace", cssUrl: 'https://fonts.cdnfonts.com/css/press-start-2p', kind: 'mono' },
];

export const DEFAULT_DIALOGUE_QUOTE_FONT_ID = 'roboto-3';

export function getDialogueQuoteFontOption(fontId: string | undefined | null): DialogueQuoteFontOption {
  const normalized = `${fontId || ''}`.trim().toLowerCase();
  return (
    DIALOGUE_QUOTE_FONT_OPTIONS.find((entry) => entry.id === normalized) ||
    DIALOGUE_QUOTE_FONT_OPTIONS[0]
  );
}

export function getDialogueQuoteFontFamily(fontId: string | undefined | null): string {
  return getDialogueQuoteFontOption(fontId).family;
}

export function ensureDialogueQuoteFontStylesheet(fontId: string | undefined | null): void {
  if (typeof document === 'undefined') {
    return;
  }

  const option = getDialogueQuoteFontOption(fontId);
  const linkId = `dialogue-quote-font-${option.id}`;
  if (document.getElementById(linkId)) {
    return;
  }

  const link = document.createElement('link');
  link.id = linkId;
  link.rel = 'stylesheet';
  link.href = option.cssUrl;
  document.head.appendChild(link);
}
