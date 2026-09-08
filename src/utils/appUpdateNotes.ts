export const RELEASE_NOTES_LIMIT = 20000;

interface ReleaseNoteEntry {
  version?: string;
  note?: string | null;
}

// Normaliza releaseNotes de electron-updater (string | ReleaseNoteInfo[] | null)
// a texto plano listo para mostrar. Sin red, sin dependencias.
export function normalizeReleaseNotes(input: unknown): string | undefined {
  if (typeof input === 'string') {
    const text = input.trim();
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
