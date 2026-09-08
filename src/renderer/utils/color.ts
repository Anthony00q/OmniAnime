const HEX_3_RE = /^#[0-9a-f]{3}$/i;
const HEX_6_RE = /^#[0-9a-f]{6}$/i;
const HEX_SHORT_RE = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i;
const HSL_RE = /^hsla?\(\s*([0-9.]+)(?:deg)?\s*[,\s]\s*([0-9.]+)%\s*[,\s]\s*([0-9.]+)%\s*(?:[,/]\s*[0-9.]+\s*)?\)$/i;

export function hslStringToHex(input: string): string | null {
  const str = String(input || '').trim();
  if (!str) return null;
  if (HEX_SHORT_RE.test(str)) {
    if (str.length === 4) {
      const r = str[1];
      const g = str[2];
      const b = str[3];
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    return str.toLowerCase();
  }
  const hslMatch = str.match(HSL_RE);
  if (!hslMatch) return null;
  const rawH = parseFloat(hslMatch[1]);
  const rawS = parseFloat(hslMatch[2]);
  const rawL = parseFloat(hslMatch[3]);
  if (Number.isNaN(rawH) || Number.isNaN(rawS) || Number.isNaN(rawL)) return null;
  const h = ((rawH % 360) + 360) % 360;
  const s = Math.min(100, Math.max(0, rawS)) / 100;
  const l = Math.min(100, Math.max(0, rawL)) / 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (h < 60) {
    r1 = c;
    g1 = x;
  } else if (h < 120) {
    r1 = x;
    g1 = c;
  } else if (h < 180) {
    g1 = c;
    b1 = x;
  } else if (h < 240) {
    g1 = x;
    b1 = c;
  } else if (h < 300) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }
  const toHex = (v: number) => {
    const n = Math.round((v + m) * 255);
    return n.toString(16).padStart(2, '0');
  };
  return `#${toHex(r1)}${toHex(g1)}${toHex(b1)}`.toLowerCase();
}

export const DEFAULT_ACCENT_HEX = '#3b82f6';
export const DEFAULT_ACCENT_HSL = 'hsl(217.2 91.2% 59.8%)';

export function normalizeAccentToHex(color: string, fallback = DEFAULT_ACCENT_HEX): string {
  const hex = hslStringToHex(color);
  if (hex) return hex;
  const trimmed = String(color || '').trim();
  if (HEX_6_RE.test(trimmed)) return trimmed.toLowerCase();
  if (HEX_3_RE.test(trimmed)) {
    const r = trimmed[1];
    const g = trimmed[2];
    const b = trimmed[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return fallback;
}

export function isValidHexColor(value: string): boolean {
  return HEX_SHORT_RE.test(String(value || '').trim());
}

export function isValidAccentColor(value: string): boolean {
  const trimmed = String(value || '').trim();
  if (!trimmed) return false;
  if (isValidHexColor(trimmed)) return true;
  return hslStringToHex(trimmed) !== null;
}

export function getAccentHex(color: string | undefined | null, fallback = DEFAULT_ACCENT_HEX): string {
  return normalizeAccentToHex(String(color || '').trim() || fallback, fallback);
}

export function isThemeValue(value: unknown): value is 'dark' | 'oled' | 'quantum' {
  return value === 'dark' || value === 'oled' || value === 'quantum';
}
