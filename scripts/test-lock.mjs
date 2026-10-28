import { randomUUID } from 'node:crypto';
import { mkdirSync, openSync, closeSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

export function acquireTestLock(root, inheritedToken = '') {
  mkdirSync(resolve(root, '.cache'), { recursive: true });
  const file = resolve(root, '.cache/test-run.lock');
  let previous;
  try {
    previous = JSON.parse(readFileSync(file, 'utf8'));
    if (!Number.isSafeInteger(previous.pid) || previous.pid <= 0 || typeof previous.token !== 'string') {
      throw new Error('Candado de pruebas inválido.');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (inheritedToken) {
    if (!previous || previous.token !== inheritedToken) throw new Error('Ejecución hija no autorizada.');
    process.kill(previous.pid, 0);
    return { token: inheritedToken, release() {} };
  }
  if (previous) {
    try {
      process.kill(previous.pid, 0);
      throw new Error('Ya hay otra ejecución de pruebas en curso.');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
      unlinkSync(file);
    }
  }
  const token = randomUUID();
  const fd = openSync(file, 'wx', 0o600);
  try {
    writeFileSync(fd, JSON.stringify({ pid: process.pid, token }));
  } finally {
    closeSync(fd);
  }
  let released = false;
  return {
    token,
    release() {
      if (released) return;
      const current = JSON.parse(readFileSync(file, 'utf8'));
      if (current.token !== token) throw new Error('El candado ya no pertenece a esta ejecución.');
      unlinkSync(file);
      released = true;
    },
  };
}
