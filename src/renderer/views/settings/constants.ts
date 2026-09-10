import type { ThemeId } from '../../../types/settings';
import { DEFAULT_ACCENT_HEX } from '../../utils/color';

export const ACCENT_PRESETS = [
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#06b6d4',
  '#a855f7',
] as const;

export { DEFAULT_ACCENT_HEX };

export const THEME_META: Record<ThemeId, { desc: string; hint: string; shortLabel: string }> = {
  dark: { desc: 'Equilibrio entre contraste y descanso visual', hint: 'Recomendado', shortLabel: 'Oscuro' },
  oled: { desc: 'Negro puro para paneles OLED, máximo ahorro', hint: 'AMOLED', shortLabel: 'OLED' },
  quantum: { desc: 'Azul profundo con acentos cian', hint: 'Futurista', shortLabel: 'Quantum' },
};

export const THEME_IDS = Object.keys(THEME_META) as ThemeId[];

export const DOWNLOAD_PARALLEL_OPTIONS = [
  { value: '1', label: '1 episodio (secuencial)' },
  { value: '2', label: '2 episodios' },
  { value: '3', label: '3 episodios' },
] as const;

export const DOWNLOAD_RETRIES_OPTIONS = [
  { value: '0', label: 'Sin reintentos' },
  { value: '3', label: '3 intentos' },
  { value: '5', label: '5 intentos' },
  { value: '10', label: '10 intentos' },
] as const;

export const DOWNLOAD_TIMEOUT_OPTIONS = [
  { value: '10', label: '10 s' },
  { value: '30', label: '30 s' },
  { value: '60', label: '60 s' },
] as const;

export const DOWNLOAD_START_TIMEOUT_OPTIONS = [
  { value: '30', label: '30 s' },
  { value: '60', label: '60 s' },
  { value: '90', label: '90 s' },
  { value: '120', label: '120 s' },
] as const;

export const PROVIDER_SERVERS = [
  {
    id: 'animeav1',
    label: 'AnimeAV1',
    hint: 'Principal',
    servers: ['HLS', 'Mega', 'Mediafire', 'MP4Upload'],
  },
  {
    id: 'jkanime',
    label: 'JkAnime',
    hint: 'Secundario',
    servers: ['Mediafire', 'Mega', 'MP4Upload'],
  },
] as const;
