export interface ReleaseNotesInline {
  text: string;
  bold: boolean;
}

export type ReleaseNotesBlock =
  | { kind: 'heading'; content: ReleaseNotesInline[] }
  | { kind: 'list'; items: ReleaseNotesInline[][] }
  | { kind: 'paragraph'; content: ReleaseNotesInline[] };

// Subconjunto mínimo del CHANGELOG: `Etiqueta:` agrupa, `- ` viñeta,
// `**texto**` en negrita. Lo no reconocido cae a párrafo tal cual.
export function parseReleaseNotes(input: unknown): ReleaseNotesBlock[] {
  if (typeof input !== 'string') return [];
  const blocks: ReleaseNotesBlock[] = [];
  let paragraph: string[] = [];
  let list: ReleaseNotesInline[][] | null = null;
  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ kind: 'paragraph', content: parseInline(paragraph.join(' ')) });
    paragraph = [];
  };
  const flushList = () => {
    if (list) blocks.push({ kind: 'list', items: list });
    list = null;
  };
  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    const bullet = line.match(/^[-–•]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      if (!list) list = [];
      list.push(parseInline(bullet[1].trim()));
      continue;
    }
    if (/^[^:\n]{1,80}:$/.test(line)) {
      flushParagraph();
      flushList();
      blocks.push({ kind: 'heading', content: parseInline(line.slice(0, -1)) });
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return blocks;
}

export function parseInline(input: string): ReleaseNotesInline[] {
  const parts: ReleaseNotesInline[] = [];
  const pattern = /\*\*(.+?)\*\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(input)) !== null) {
    if (match.index > last) parts.push({ text: input.slice(last, match.index), bold: false });
    parts.push({ text: match[1], bold: true });
    last = match.index + match[0].length;
  }
  if (last < input.length) parts.push({ text: input.slice(last), bold: false });
  return parts;
}

export interface ReleaseNotesSection {
  heading: ReleaseNotesInline[] | null;
  blocks: Exclude<ReleaseNotesBlock, { kind: 'heading' }>[];
}

// Cose cada encabezado con su contenido: aire apretado dentro de la
// sección y generoso entre secciones. Sin encabezado, sección suelta.
export function groupReleaseSections(blocks: ReleaseNotesBlock[]): ReleaseNotesSection[] {
  const sections: ReleaseNotesSection[] = [];
  let current: ReleaseNotesSection | null = null;
  const pushCurrent = () => {
    if (current && (current.heading || current.blocks.length > 0)) sections.push(current);
    current = null;
  };
  for (const block of blocks) {
    if (block.kind === 'heading') {
      pushCurrent();
      current = { heading: block.content, blocks: [] };
      continue;
    }
    if (!current) current = { heading: null, blocks: [] };
    current.blocks.push(block);
  }
  pushCurrent();
  return sections;
}
