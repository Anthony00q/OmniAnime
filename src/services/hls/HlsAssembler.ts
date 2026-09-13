import { spawn } from 'child_process';
import * as fsp from 'fs/promises';
import { terminateChildProcessTree } from '../../utils/processUtils';

const REMUX_TIMEOUT_MS = 120_000;
const STDERR_TAIL = 4000;
const STDOUT_TAIL = 64 * 1024;

// Una sola pasada con los mismos bytes del pegado manual (init primero, en orden).
// El demuxer concat NO vale: los .m4s dependen del init y ffmpeg los rechaza en silencio.
export function buildConcatProtocolUrl(partPaths: string[]): string {
  if (partPaths.length === 0) throw new Error('sin segmentos para ensamblar');
  for (const part of partPaths) {
    // `|` separa entradas sin escape (imposible en Windows): fail-closed antes de ffmpeg.
    if (String(part).includes('|')) throw new Error('ruta de segmento no soportada para ensamblar');
  }
  const inputUrl = `concat:${partPaths.join('|')}`;
  // Cinturón argv Windows (~32 KB): el llamador pasa nombres relativos + cwd.
  if (inputUrl.length > 28000) throw new Error('demasiados segmentos para ensamblar en una pasada');
  return inputUrl;
}

export interface ConcatRemuxOptions {
  // Con cwd, los nombres viajan relativos (episodios largos); sin cwd, rutas tal cual.
  cwd?: string;
}

export async function remuxPartsViaConcatProtocol(
  partPaths: string[],
  outPath: string,
  ffmpegPath: string,
  signal?: AbortSignal,
  onRemuxProgress?: (outTimeMs: number) => void,
  options?: ConcatRemuxOptions,
): Promise<void> {
  if (signal?.aborted) throw new Error('remux abortado');
  const names = options?.cwd ? partPaths.map((part) => part.split(/[\\/]/).pop() as string) : partPaths;
  const inputUrl = buildConcatProtocolUrl(names);
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let timer: NodeJS.Timeout | null = null;
    let stdoutTail = '';
    const finish = (err: Error | null) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      if (err) {
        fsp.rm(outPath, { force: true }).catch(() => undefined);
        reject(err);
      } else {
        resolve();
      }
    };
    const child = spawn(
      ffmpegPath,
      ['-y', '-v', 'error', '-i', inputUrl, '-c', 'copy', '-progress', 'pipe:1', outPath],
      { windowsHide: true, ...(options?.cwd ? { cwd: options.cwd } : {}) },
    );
    let stderr = '';
    child.stderr?.on('data', (data: Buffer) => {
      if (stderr.length < STDERR_TAIL) stderr += data.toString().slice(0, STDERR_TAIL - stderr.length);
    });
    // Progreso best-effort: nunca tumba el remux.
    child.stdout?.on('data', (data: Buffer) => {
      try {
        stdoutTail = `${stdoutTail}${data.toString()}`.slice(-STDOUT_TAIL);
        const lines = stdoutTail.split('\n');
        stdoutTail = lines.pop() ?? '';
        for (const line of lines) {
          const match = line.match(/^out_time_ms=(-?\d+)/);
          if (match) onRemuxProgress?.(Number(match[1]));
        }
      } catch {
        /* progreso best-effort */
      }
    });
    const onAbort = () => {
      terminateChildProcessTree(child);
      finish(new Error('remux abortado'));
    };
    signal?.addEventListener('abort', onAbort);
    timer = setTimeout(() => {
      terminateChildProcessTree(child);
      finish(new Error('remux agotó el tiempo de espera'));
    }, REMUX_TIMEOUT_MS);
    child.on('error', (err) => finish(new Error(`no se pudo ejecutar ffmpeg: ${err.message}`)));
    child.on('close', (code) => {
      if (code === 0 && !signal?.aborted) finish(null);
      else if (signal?.aborted) finish(new Error('remux abortado'));
      else finish(new Error(`ffmpeg remux falló (código ${code ?? 'desconocido'}): ${stderr.trim().slice(0, 300)}`));
    });
  });
}
