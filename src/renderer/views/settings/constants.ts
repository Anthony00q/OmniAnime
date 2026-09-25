import type { ThemeId } from '../../../types/settings';
import { DEFAULT_ACCENT_HEX } from '../../utils/color';
import {
  SERVER_CANDIDATES_ANIMEAV1,
  SERVER_CANDIDATES_JKANIME,
  SERVER_ORDER_ANIMEAV1_DEFAULT,
  SERVER_ORDER_JKANIME_DEFAULT,
} from '../../../utils/serverUtils';

export const ACCENT_PRESETS = ['#e8a33d', '#c97b4a', '#b4552d', '#8a9a5b', '#d9c9a8'] as const;

export const THEME_SUGGESTED_ACCENT: Record<ThemeId, string> = {
  dark: '#e8a33d',
  oled: '#f1b150',
  quantum: '#dab681',
  tinta: '#e45944',
};

export { DEFAULT_ACCENT_HEX };

export const THEME_META: Record<ThemeId, { desc: string; hint: string; shortLabel: string }> = {
  dark: { desc: 'Fondo marrón oscuro con acento ámbar', hint: 'Recomendado', shortLabel: 'Oscuro cálido' },
  oled: { desc: 'Negro total, ideal para pantallas OLED', hint: 'AMOLED', shortLabel: 'Negro puro' },
  quantum: { desc: 'Tonos tierra con acento cobre', hint: '', shortLabel: 'Marrón oscuro' },
  tinta: { desc: 'Tonos fríos con acento rojo', hint: '', shortLabel: 'Gris azulado' },
};

export const THEME_IDS = Object.keys(THEME_META) as ThemeId[];

export const DOWNLOAD_PARALLEL_OPTIONS = [
  { value: '1', label: '1 episodio (secuencial)' },
  { value: '2', label: '2 episodios' },
  { value: '3', label: '3 episodios' },
] as const;

export const DOWNLOAD_DIRECT_CONNECTIONS_OPTIONS = [
  { value: '1', label: '1 conexión' },
  { value: '2', label: '2 conexiones' },
  { value: '4', label: '4 conexiones' },
  { value: '6', label: '6 conexiones' },
  { value: '8', label: '8 conexiones' },
] as const;

export const DOWNLOAD_HLS_CONNECTIONS_OPTIONS = [
  { value: '4', label: '4 segmentos' },
  { value: '6', label: '6 segmentos' },
  { value: '8', label: '8 segmentos' },
  { value: '10', label: '10 segmentos' },
  { value: '12', label: '12 segmentos' },
  { value: '16', label: '16 segmentos' },
] as const;

export const DOWNLOAD_RETRIES_OPTIONS = [
  { value: '0', label: 'Sin reintentos' },
  { value: '3', label: '3 reintentos' },
  { value: '5', label: '5 reintentos' },
  { value: '10', label: '10 reintentos' },
] as const;

export const DOWNLOAD_START_TIMEOUT_OPTIONS = [
  { value: '30', label: '30 s' },
  { value: '60', label: '60 s' },
  { value: '90', label: '90 s' },
  { value: '120', label: '120 s' },
] as const;

export interface ProviderServersEntry {
  id: 'animeav1' | 'jkanime';
  label: string;
  hint: string;
  /** Candidatos del proveedor. */
  servers: readonly string[];
  /** Orden por defecto de ese proveedor. */
  defaultOrder: readonly string[];
}

// Candidatos y orden por defecto salen del dominio para que AnimeAV1 y JkAnime no puedan
// desincronizarse (pasó con Mediafire, que AnimeAV1 nunca da).
export const PROVIDER_SERVERS: readonly ProviderServersEntry[] = [
  {
    id: 'animeav1',
    label: 'AnimeAV1',
    hint: 'Principal',
    servers: SERVER_CANDIDATES_ANIMEAV1,
    defaultOrder: SERVER_ORDER_ANIMEAV1_DEFAULT,
  },
  {
    id: 'jkanime',
    label: 'JkAnime',
    hint: 'Secundario',
    servers: SERVER_CANDIDATES_JKANIME,
    defaultOrder: SERVER_ORDER_JKANIME_DEFAULT,
  },
];
