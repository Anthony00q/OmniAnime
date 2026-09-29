import type { HomeEpisode } from '../../types/anime';

// Orden de secciones del home; lo desconocido va al final.
const SECTION_ORDER = ['anime', 'donghua', 'ova'];

const SECTION_LABELS: Record<string, string> = {
  anime: 'Anime',
  donghua: 'Donghua',
  ova: 'OVAs',
};

export function homeSectionId(item: HomeEpisode): string {
  return typeof item.kind === 'string' && item.kind ? item.kind : 'anime';
}

export function listHomeSections(items: HomeEpisode[]): string[] {
  const seen = new Set<string>();
  for (const item of items) seen.add(homeSectionId(item));
  return [
    ...SECTION_ORDER.filter((section) => seen.has(section)),
    ...Array.from(seen).filter((section) => !SECTION_ORDER.includes(section)),
  ];
}

// Filtro local (sin refetch).
export function filterHomeBySection(items: HomeEpisode[], section: string): HomeEpisode[] {
  return items.filter((item) => homeSectionId(item) === section);
}

export function homeSectionLabel(section: string): string {
  return SECTION_LABELS[section] ?? section;
}
