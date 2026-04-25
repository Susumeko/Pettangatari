export interface BlipOption {
  id: string;
  label: string;
  src: string;
}

const blipModules = import.meta.glob('./sounds/blips/*', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

function toBlipLabel(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '');
}

export const BLIP_OPTIONS: BlipOption[] = Object.entries(blipModules)
  .map(([path, src]) => {
    const fileName = path.split('/').pop() || path;
    return {
      id: fileName,
      label: toBlipLabel(fileName),
      src,
    };
  })
  .sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true }));

export const BLIP_OPTION_MAP = new Map(BLIP_OPTIONS.map((option) => [option.id, option]));
