export const RELEASE_NOTES_LIMIT = 20000;

interface ReleaseNoteEntry {
  version?: string;
  note?: string | null;
}

// Normaliza releaseNotes de electron-updater (string | ReleaseNoteInfo[] | null)
// a texto del modal: el HTML del feed Atom y el markdown de latest.yml salen
// con la misma estructura mínima (`#` encabezados, `- ` viñetas, `**negrita**`).
// Sin red.
export function normalizeReleaseNotes(input: unknown): string | undefined {
  if (typeof input === 'string') {
    const text = toPlainText(input).trim();
    return text ? truncate(text) : undefined;
  }
  if (Array.isArray(input)) {
    const parts = (input as ReleaseNoteEntry[])
      .filter((entry) => entry && typeof entry.note === 'string' && entry.note.trim())
      .map((entry) =>
        entry.version ? `v${entry.version}\n${(entry.note as string).trim()}` : (entry.note as string).trim(),
      );
    if (parts.length === 0) return undefined;
    return truncate(parts.join('\n\n'));
  }
  return undefined;
}

// Solo hay actualización si la publicada es estrictamente mayor que la instalada:
// un "distinto de" ofrecería una bajada de versión si la instalada fuese más nueva.
export function isNewerVersion(latest: unknown, current: unknown): boolean {
  const a = parseTriple(latest);
  const b = parseTriple(current);
  if (!a || !b) return false;
  if (a[0] !== b[0]) return a[0] > b[0];
  if (a[1] !== b[1]) return a[1] > b[1];
  return a[2] > b[2];
}

function parseTriple(version: unknown): [number, number, number] | null {
  if (typeof version !== 'string') return null;
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

// El corte a ciegas partía negritas y entidades por la mitad: se retrocede a
// la frontera de bloque y se cierra lo que quede abierto.
function truncate(text: string): string {
  if (text.length <= RELEASE_NOTES_LIMIT) return text;
  let cut = text.slice(0, RELEASE_NOTES_LIMIT);
  const boundary = cut.lastIndexOf('\n\n');
  if (boundary > 0) {
    cut = cut.slice(0, boundary);
  } else {
    const lineBreak = cut.lastIndexOf('\n');
    if (lineBreak > 0) cut = cut.slice(0, lineBreak);
  }
  if ((cut.match(/\*\*/g)?.length ?? 0) % 2 === 1) {
    cut = cut.slice(0, cut.lastIndexOf('**'));
  }
  // Un encabezado huérfano al final sobra: se queda sin contenido que abrir.
  // Una entidad a medias en el borde también: se veía como `&algo`.
  const withoutOrphanHeading = cut.replace(/\n#{1,6}\s+[^\n]*$/, '');
  if (withoutOrphanHeading.trim()) cut = withoutOrphanHeading;
  return `${cut.replace(/&[a-z0-9#]*$/i, '').replace(/\n+$/, '')}\n…`;
}

function toPlainText(text: string): string {
  const stripped = /<[a-zA-Z][^>]*>/.test(text) ? stripHtml(text) : text;
  return decodeEntities(stripped);
}

function stripHtml(html: string): string {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, '');
  // El enlace pasa a markdown antes de que se pierdan las etiquetas: sin esto
  // la URL desaparece y solo queda el texto suelto.
  const withAnchors = withoutComments.replace(
    /<a\s[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi,
    (_match, doubleQuoted, singleQuoted, text) => `[${String(text).trim()}](${doubleQuoted ?? singleQuoted})`,
  );
  const withBreaks = withAnchors
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<h[1-6][^>]*>/gi, '\n# ')
    .replace(/<\/(p|div|ul|ol|h[1-6]|li|tr|table)>/gi, '\n')
    .replace(/<(br|p|div|ul|ol|tr|table)[^>]*>/gi, '\n');
  const withoutTags = withBreaks.replace(/<\/?(strong|b)[^>]*>/gi, '**').replace(/<[^>]+>/g, '');
  return withoutTags
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  ndash: '\u2013',
  mdash: '\u2014',
  hellip: '\u2026',
  lsquo: '\u2018',
  rsquo: '\u2019',
  ldquo: '\u201c',
  rdquo: '\u201d',
  copy: '\u00a9',
  reg: '\u00ae',
  trade: '\u2122',
  deg: '\u00b0',
  times: '\u00d7',
  bull: '\u2022',
  middot: '\u00b7',
  laquo: '\u00ab',
  raquo: '\u00bb',
  rarr: '\u2192',
};

// Una sola pasada, sin reescanear lo ya convertido: `&amp;lt;` queda en `&lt;`.
// Numérica fuera de rango o nombrada desconocida, la entidad se ve tal cual.
function decodeEntities(text: string): string {
  return text.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (match, decimal, hex, name) => {
    if (decimal !== undefined) return codePointOrLiteral(match, Number(decimal));
    if (hex !== undefined) return codePointOrLiteral(match, parseInt(hex, 16));
    return NAMED_ENTITIES[String(name).toLowerCase()] ?? match;
  });
}

function codePointOrLiteral(match: string, codePoint: number): string {
  if (!Number.isInteger(codePoint) || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
    return match;
  }
  return String.fromCodePoint(codePoint);
}
