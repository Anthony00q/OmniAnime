export interface ReleaseNotesInline {
  text: string;
  bold: boolean;
  code?: boolean;
  href?: string;
}

export type ReleaseNotesHeadingRole = 'version' | 'zone' | 'free';

export type ReleaseNotesBlock =
  | { kind: 'heading'; content: ReleaseNotesInline[]; role: ReleaseNotesHeadingRole }
  | { kind: 'list'; items: ReleaseNotesInline[][] }
  | { kind: 'paragraph'; content: ReleaseNotesInline[] };

// Subconjunto del CHANGELOG: `### Etiqueta` o `Etiqueta:` agrupa, `- ` viñeta,
// y en línea `**negrita**`, `` `código` `` y `[texto](url)`. Lo demás, párrafo.
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
    // Encabezado Markdown (`### Zona`): misma agrupación en el modal y
    // encabezado real en la web de GitHub. Solo dentro de la sección.
    const mdHeading = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (mdHeading) {
      flushParagraph();
      flushList();
      const text = mdHeading[2].trim();
      blocks.push({
        kind: 'heading',
        content: parseInline(text),
        role: isVersionLine(text) ? 'version' : mdHeading[1].length <= 3 ? 'zone' : 'free',
      });
      continue;
    }
    if (/^[^:\n]{1,80}:$/.test(line)) {
      flushParagraph();
      flushList();
      const text = line.slice(0, -1);
      blocks.push({ kind: 'heading', content: parseInline(text), role: isVersionLine(text) ? 'version' : 'zone' });
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return blocks;
}

// Cada llamada monta su propio RegExp: el patrón es global y la recursión
// (etiquetas de enlace, negrita) compartiría el lastIndex si fuese común.
const INLINE_PATTERN =
  '`([^`\\n]+)`|\\[([^\\]\\n]*)\\]\\(\\s*([^)\\s]+)\\s*\\)|\\*\\*(.+?)\\*\\*|(https?:\\/\\/[^\\s<>"\']+)';

export function parseInline(input: string): ReleaseNotesInline[] {
  const parts: ReleaseNotesInline[] = [];
  const pattern = new RegExp(INLINE_PATTERN, 'g');
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(input)) !== null) {
    if (match.index > last) parts.push({ text: input.slice(last, match.index), bold: false });
    const [full, code, label, href, boldText, bareUrl] = match;
    if (code !== undefined) {
      parts.push({ text: code, bold: false, code: true });
    } else if (label !== undefined && href !== undefined) {
      parts.push(...parseInline(label).map((node) => ({ ...node, href })));
    } else if (boldText !== undefined) {
      parts.push(...parseInline(boldText).map((node) => ({ ...node, bold: true })));
    } else {
      const url = trimUrlTail(bareUrl);
      parts.push({ text: url, bold: false, href: url });
      if (url.length < bareUrl.length) parts.push({ text: bareUrl.slice(url.length), bold: false });
    }
    last = match.index + full.length;
  }
  if (last < input.length) parts.push({ text: input.slice(last), bold: false });
  return parts;
}

// La puntuación que cierra la frase no forma parte de la URL: `page.)` deja
// fuera el punto y, si el paréntesis no cierra ninguno, también él.
function trimUrlTail(rawUrl: string): string {
  let url = rawUrl.replace(/[.,;:!?]+$/, '');
  while (url.endsWith(')') && (url.match(/\(/g)?.length ?? 0) < (url.match(/\)/g)?.length ?? 0)) {
    url = url.slice(0, -1);
  }
  return url;
}

export interface ReleaseNotesSection {
  heading: ReleaseNotesInline[] | null;
  headingRole: ReleaseNotesHeadingRole | null;
  blocks: Exclude<ReleaseNotesBlock, { kind: 'heading' }>[];
}

export function inlineText(nodes: ReleaseNotesInline[]): string {
  return nodes.map((node) => node.text).join('');
}

const VERSION_LINE_RE = /^v?\[?(\d+)\.(\d+)\.(\d+)\]?(\s*[-–—(].*)?$/;

// Marca de versión (`vX.Y.Z`, `## [X.Y.Z] - fecha`): el modal la trata como
// divisor de entradas del changelog.
export function isVersionLine(text: string): boolean {
  return VERSION_LINE_RE.test(text.trim());
}

function versionTriple(text: string): string | null {
  const match = VERSION_LINE_RE.exec(text.trim());
  return match ? `${match[1]}.${match[2]}.${match[3]}` : null;
}

function dropLeadingBlanks(lines: string[]): string {
  const rest = [...lines];
  while (rest.length > 0 && !rest[0].trim()) rest.shift();
  return rest.join('\n');
}

// Muestra solo las entradas de la versión a la que se actualiza (hasta la
// marca siguiente de cualquier versión). Sin marcas, o sin la suya, conserva
// el preámbulo sin versionar.
export function releaseNotesForVersion(notes: string, version: string): string {
  const wanted = versionTriple(version);
  if (!wanted) return notes;
  const lines = notes.split(/\r?\n/);
  const marks: Array<{ line: number; triple: string }> = [];
  lines.forEach((line, index) => {
    const triple = versionTriple(line.trim().replace(/^#{1,6}\s+/, ''));
    if (triple) marks.push({ line: index, triple });
  });
  if (marks.length === 0) return notes;
  const own = marks.filter((mark) => mark.triple === wanted);
  if (own.length === 0) return dropLeadingBlanks(lines.slice(0, marks[0].line));
  const parts = own.flatMap((mark) => {
    const next = marks.find((other) => other.line > mark.line);
    const part = dropLeadingBlanks(lines.slice(mark.line + 1, next ? next.line : lines.length));
    return part ? [part] : [];
  });
  return parts.reduce((acc, part) => (acc ? `${acc.replace(/\n+$/, '')}\n\n${part}` : part), '');
}

// Cose cada encabezado con su contenido: aire apretado dentro de la
// sección y generoso entre secciones. Sin encabezado, sección suelta.
// Un encabezado de zona sin contenido no genera sección (evita huecos
// vacíos); uno de versión sí, porque separa entradas del changelog.
export function groupReleaseSections(blocks: ReleaseNotesBlock[]): ReleaseNotesSection[] {
  const sections: ReleaseNotesSection[] = [];
  let current: ReleaseNotesSection | null = null;
  const pushCurrent = () => {
    const isVersionDivider = current?.headingRole === 'version';
    if (current && (current.blocks.length > 0 || isVersionDivider)) sections.push(current);
    current = null;
  };
  for (const block of blocks) {
    if (block.kind === 'heading') {
      pushCurrent();
      current = { heading: block.content, headingRole: block.role, blocks: [] };
      continue;
    }
    if (!current) current = { heading: null, headingRole: null, blocks: [] };
    current.blocks.push(block);
  }
  pushCurrent();
  return sections;
}
