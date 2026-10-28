import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function createTempDirectory(prefix: string): string {
  const parent = join(tmpdir(), 'opencode');
  mkdirSync(parent, { recursive: true });
  return mkdtempSync(join(realpathSync(parent), prefix));
}
