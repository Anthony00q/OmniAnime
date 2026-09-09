export const RELEASE_NOTES_LIMIT = 20000;

interface ReleaseNoteEntry {
  version?: string;
  note?: string | null;
}

// Normaliza releaseNotes de electron-updater (string | ReleaseNoteInfo[] | null)
// a texto plano listo para mostrar. El feed Atom de GitHub entrega HTML;
// latest.yml entrega markdown: ambos quedan en texto limpio. Sin red.
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

function truncate(text: string): string {
  if (text.length <= RELEASE_NOTES_LIMIT) return text;
  return `${text.slice(0, RELEASE_NOTES_LIMIT)}\n…`;
}

function toPlainText(text: string): string {
  const stripped = /<[a-zA-Z][^>]*>/.test(text) ? stripHtml(text) : text;
  return decodeEntities(stripped);
}

function stripHtml(html: string): string {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, '');
  const withBreaks = withoutComments
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/(p|div|ul|ol|h1|h2|h3|h4|h5|h6|li|tr|table)>/gi, '\n')
    .replace(/<(br|p|div|ul|ol|h1|h2|h3|h4|h5|h6|tr|table)[^>]*>/gi, '\n');
  const withoutTags = withBreaks.replace(/<[^>]+>/g, '');
  return withoutTags
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&');
}
