// Parseo tolerante para payloads JS embebidos (SvelteKit AnimeAV1, `var x` JkAnime).
// Extrae por balanceo de llaves/corchetes en vez de depender del orden de claves vecinas.

const MAX_SCAN_LEN = 2_000_000;

// Contenido interior del primer bloque `marker ... open ... close` balanceado.
// `marker` puede incluir el propio `open` (p. ej. `media:{`) o no (`var animes =`).
// Respeta strings "..." con escapes `\"` y `\\`. Null si no hay bloque válido.
export function extractBalancedBlock(source: string, marker: string, open: string, close: string): string | null {
  if (!source || !marker || open.length !== 1 || close.length !== 1) return null;
  const at = source.indexOf(marker);
  if (at < 0) return null;
  let i = at + marker.length;
  const end = Math.min(source.length, at + MAX_SCAN_LEN);
  if (i - 1 < at || source[i - 1] !== open) {
    while (i < end && source[i] !== open) {
      if (source[i] === '"' || source[i] === close) return null;
      i += 1;
    }
    if (i >= end || source[i] !== open) return null;
    i += 1;
  }
  const innerStart = i;
  let depth = 1;
  let inString = false;
  while (i < end) {
    const ch = source[i];
    if (inString) {
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === '"') inString = false;
      i += 1;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return source.slice(innerStart, i);
    }
    i += 1;
  }
  return null;
}

// Divide el interior de un `[...]` por comas de nivel 0 (fuera de
// llaves/corchetes/strings). Para `[{...},{...}]` devuelve cada objeto.
export function splitTopLevelItems(inner: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let inString = false;
  let current = '';
  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i];
    if (inString) {
      current += ch;
      if (ch === '\\' && i + 1 < inner.length) {
        current += inner[i + 1];
        i += 1;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      current += ch;
    } else if (ch === '{' || ch === '[') {
      depth += 1;
      current += ch;
    } else if (ch === '}' || ch === ']') {
      depth = Math.max(0, depth - 1);
      current += ch;
    } else if (ch === ',' && depth === 0) {
      if (current.trim()) items.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) items.push(current.trim());
  return items;
}

// Unescape de strings estilo JS/Svelte sin el hack JSON.parse("..."):
// soporta \\ \" \n \t \r y \uXXXX; escapes desconocidos se conservan.
export function unescapeSvelteString(raw: string): string {
  const input = String(raw || '');
  let out = '';
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (ch !== '\\' || i + 1 >= input.length) {
      out += ch;
      continue;
    }
    const next = input[i + 1];
    if (next === 'n') {
      out += '\n';
      i += 1;
    } else if (next === 't') {
      out += '\t';
      i += 1;
    } else if (next === 'r') {
      out += '\r';
      i += 1;
    } else if (next === '"') {
      out += '"';
      i += 1;
    } else if (next === '\\') {
      out += '\\';
      i += 1;
    } else if (next === 'u' && /^[0-9a-fA-F]{4}$/.test(input.slice(i + 2, i + 6))) {
      out += String.fromCharCode(parseInt(input.slice(i + 2, i + 6), 16));
      i += 5;
    } else {
      out += ch;
    }
  }
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

// Decodifica base64 a texto UTF-8. Null si es ilegible o vacío.
// No valida el contenido: el llamador decide si la URL resultante sirve.
export function decodeBase64Text(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text || text.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(text)) return null;
  try {
    const decoded = Buffer.from(text, 'base64').toString('utf8').trim();
    if (!decoded) return null;
    // Rechaza restos binarios típicos de un base64 corrupto válido en alfabeto.
    for (let i = 0; i < decoded.length; i += 1) {
      const code = decoded.charCodeAt(i);
      if (code === 65533) return null;
      if (code < 32 && code !== 9 && code !== 10 && code !== 13) return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

function braceDepthAt(text: string, index: number): number {
  let depth = 0;
  let inString = false;
  for (let i = 0; i < index && i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i += 1;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') depth += 1;
    else if (ch === '}' || ch === ']') depth = Math.max(0, depth - 1);
  }
  return depth;
}

// Primer match de `pattern` a profundidad 0 (campos propios del bloque,
// no de objetos anidados como `relations[].destination`).
export function matchAtTopLevel(text: string, pattern: RegExp): RegExpExecArray | null {
  if (!text) return null;
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const re = new RegExp(pattern.source, flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[0] === '') {
      re.lastIndex += 1;
      continue;
    }
    if (braceDepthAt(text, m.index) === 0) return m;
  }
  return null;
}

// Extrae cada objeto `{...}` balanceado del interior de un array.
// Un objeto corrupto (llaves sin cerrar) se salta sin arrastrar al resto,
// a diferencia de dividir por comas de nivel 0.
export function extractBalancedObjects(inner: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < inner.length) {
    const at = inner.indexOf('{', i);
    if (at < 0) break;
    let depth = 0;
    let inString = false;
    let j = at;
    let ok = false;
    while (j < inner.length) {
      const ch = inner[j];
      if (inString) {
        if (ch === '\\') {
          j += 2;
          continue;
        }
        if (ch === '"') inString = false;
        j += 1;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          ok = true;
          j += 1;
          break;
        }
      }
      j += 1;
    }
    if (ok) {
      out.push(inner.slice(at, j));
      i = j;
    } else {
      i = at + 1;
    }
  }
  return out;
}

export function isHttpUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const url = value.trim();
  if (!/^https?:\/\//i.test(url)) return false;
  if (/[\s<>"']/.test(url)) return false;
  return true;
}

export function safeParseInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || !/^-?\d+$/.test(trimmed)) return null;
  const num = parseInt(trimmed, 10);
  return Number.isSafeInteger(num) ? num : null;
}
