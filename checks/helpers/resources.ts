import type { ChildProcess } from 'node:child_process';
import { terminateChildProcessTree } from '../../src/utils/processUtils';

type Cleanup = () => void | Promise<void>;

export async function withResourceCleanup<T>(work: (defer: (cleanup: Cleanup) => void) => Promise<T>): Promise<T> {
  const cleanups: Cleanup[] = [];
  const errors: unknown[] = [];
  let result: T | undefined;
  try {
    result = await work((cleanup) => cleanups.push(cleanup));
  } catch (error) {
    errors.push(error);
  }
  for (const cleanup of cleanups.reverse()) {
    try {
      await cleanup();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, 'Fallaron la prueba o la liberación de sus recursos.');
  return result as T;
}

async function withDeadline<T>(pending: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      pending,
      new Promise<never>((_accept, reject) => {
        timer = setTimeout(
          () => reject(new Error('Se agotó el plazo de cierre del proceso de pruebas.')),
          milliseconds,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function closeOwnedElectron(child: ChildProcess, requestExit: () => Promise<unknown>): Promise<void> {
  const exited = () => child.exitCode !== null || child.signalCode !== null;
  let onClose: () => void = () => {};
  const closed = exited()
    ? Promise.resolve()
    : new Promise<void>((accept) => {
        onClose = accept;
        child.once('close', onClose);
      });
  try {
    try {
      await withDeadline(requestExit(), 5000);
    } catch {
      // app.exit puede cerrar el transporte antes de responder.
    }
    if (exited()) return;
    try {
      await withDeadline(closed, 2000);
      return;
    } catch {
      terminateChildProcessTree(child);
      await withDeadline(closed, 5000);
      throw new Error('Electron requirió un cierre forzado; la prueba no se considera correcta.');
    }
  } finally {
    child.removeListener('close', onClose);
  }
}
