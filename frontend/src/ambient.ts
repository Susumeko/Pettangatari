import ambientApartmentUrl from './sounds/ambient/apartment.mp3?url';
import ambientIndoorsCrowdUrl from './sounds/ambient/indoors with crowd.mp3?url';
import ambientJungleUrl from './sounds/ambient/jungle.mp3?url';
import ambientMorningCityUrl from './sounds/ambient/morning city.mp3?url';
import ambientMorningOutdoorsUrl from './sounds/ambient/morning outdoors.mp3?url';
import ambientNightCityUrl from './sounds/ambient/night city.mp3?url';
import ambientNightOutdoorsUrl from './sounds/ambient/night outdoors.mp3?url';

export const AMBIENT_PRESET_OPTIONS = [
  { id: 'apartment', label: 'Apartment', src: ambientApartmentUrl },
  { id: 'indoors-crowd', label: 'Indoors with crowd', src: ambientIndoorsCrowdUrl },
  { id: 'jungle', label: 'Jungle', src: ambientJungleUrl },
  { id: 'morning-city', label: 'Morning city', src: ambientMorningCityUrl },
  { id: 'morning-outdoors', label: 'Morning outdoors', src: ambientMorningOutdoorsUrl },
  { id: 'night-city', label: 'Night city', src: ambientNightCityUrl },
  { id: 'night-outdoors', label: 'Night outdoors', src: ambientNightOutdoorsUrl },
] as const;

export const AMBIENT_PRESET_MAP: Map<string, (typeof AMBIENT_PRESET_OPTIONS)[number]> = new Map(
  AMBIENT_PRESET_OPTIONS.map((option) => [option.id, option]),
);
