import { spawn } from 'child_process';
import * as fsp from 'fs/promises';
import { terminateChildProcessTree } from '../../utils/processUtils';

const REMUX_TIMEOUT_MS = 120_000;
const STDERR_TAIL = 4000;

export async function concatFilesInOrder(partPaths: string[], concatPath: string): Promise<void> {
  const out = await fsp.open(concatPath, 'w');
  try {
    for (const part of partPaths) {
      const bytes = await fsp.readFile(part);
      await out.write(bytes);
    }
  } finally {
    await out.close().catch(() => undefined);
  }
}

export async function remuxConcatToMp4(
  concatPath: string,
  outPath: string,
  ffmpegPath: string,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) throw new Error('remux abortado');
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let timer: NodeJS.Timeout | null = null;
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
    const child = spawn(ffmpegPath, ['-y', '-v', 'error', '-i', concatPath, '-c', 'copy', outPath], {
      windowsHide: true,
    });
    let stderr = '';
    child.stderr?.on('data', (data: Buffer) => {
      if (stderr.length < STDERR_TAIL) stderr += data.toString().slice(0, STDERR_TAIL - stderr.length);
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
