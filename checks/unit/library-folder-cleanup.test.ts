import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import fsNative from 'node:fs';
import { LibraryFolderCleanupService } from '../../src/services/library/LibraryFolderCleanupService';

for (const extra of [null, 'subtitulos.srt', 'cover.jpg', '.oculto', '.cache/notas.txt', 'Extras/nota.txt']) {
  test(`la limpieza de carpeta conserva contenido ajeno: ${extra ?? 'solo archivos propios'}`, async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'omni-folder-cleanup-'));
    const folder = path.join(root, 'Anime');
    const cleanup = new LibraryFolderCleanupService({ getAllowedBaseDirs: () => [root] });
    try {
      const before = await cleanup.snapshot(folder);
      await fs.mkdir(folder);
      await fs.writeFile(path.join(folder, '.omnianime'), '{"slug":"anime"}');
      await fs.writeFile(path.join(folder, '.poster.jpg'), 'imagen propia');
      await cleanup.record(folder, before);
      await fs.mkdir(path.join(folder, '.cache'));
      if (extra) {
        await fs.mkdir(path.dirname(path.join(folder, extra)), { recursive: true });
        await fs.writeFile(path.join(folder, extra), 'personal');
      }
      assert.equal(await cleanup.removeIfEmpty(folder), extra ? 'preserved' : 'removed');
      if (extra) {
        assert.equal(await fs.readFile(path.join(folder, extra), 'utf8'), 'personal');
        assert.equal(await fs.readFile(path.join(folder, '.omnianime'), 'utf8'), '{"slug":"anime"}');
      } else {
        await assert.rejects(fs.stat(folder), { code: 'ENOENT' });
      }
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
}

test('los recursos preexistentes o modificados no se consideran basura propia', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'omni-folder-existing-'));
  const folder = path.join(root, 'Anime');
  const cleanup = new LibraryFolderCleanupService({ getAllowedBaseDirs: () => [root] });
  try {
    await fs.mkdir(folder);
    await fs.writeFile(path.join(folder, '.poster.jpg'), 'imagen personal');
    const before = await cleanup.snapshot(folder);
    await fs.writeFile(path.join(folder, '.omnianime'), '{}');
    await cleanup.record(folder, before);
    assert.equal(await cleanup.removeIfEmpty(folder), 'preserved');
    await fs.unlink(path.join(folder, '.poster.jpg'));
    await fs.writeFile(path.join(folder, '.omnianime'), '{"cambiado":true}');
    assert.equal(await cleanup.removeIfEmpty(folder), 'preserved');
    assert.equal(await fs.readFile(path.join(folder, '.omnianime'), 'utf8'), '{"cambiado":true}');
    await assert.rejects(cleanup.removeIfEmpty(root), /segura/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('la limpieza no sigue junctions ni borra entradas aparecidas al retirar la carpeta', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'omni-folder-race-'));
  const folder = path.join(root, 'Anime');
  const elsewhere = path.join(root, 'Personal');
  const cleanup = new LibraryFolderCleanupService({ getAllowedBaseDirs: () => [root] });
  try {
    await fs.mkdir(folder);
    await fs.mkdir(elsewhere);
    await fs.writeFile(path.join(elsewhere, 'nota.txt'), 'conservar');
    await fs.symlink(elsewhere, path.join(folder, '.cache'), 'junction');
    assert.equal(await cleanup.removeIfEmpty(folder), 'preserved');
    assert.equal(await fs.readFile(path.join(elsewhere, 'nota.txt'), 'utf8'), 'conservar');
    await fs.unlink(path.join(folder, '.cache'));
    const rmdir = fsNative.rmdirSync;
    t.mock.method(fsNative, 'rmdirSync', (target: fsNative.PathLike) => {
      if (target === folder) fsNative.writeFileSync(path.join(folder, 'nuevo.txt'), 'nuevo');
      return rmdir(target);
    });
    assert.equal(await cleanup.removeIfEmpty(folder), 'preserved');
    assert.equal(await fs.readFile(path.join(folder, 'nuevo.txt'), 'utf8'), 'nuevo');
  } finally {
    t.mock.restoreAll();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('los cambios de atributos no invalidan recursos propios, pero sí cambia su contenido con igual tamaño y fecha', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'omni-folder-content-'));
  const cleanup = new LibraryFolderCleanupService({ getAllowedBaseDirs: () => [root] });
  try {
    for (const changed of [false, true]) {
      const folder = path.join(root, changed ? 'Modificada' : 'Propia');
      const before = await cleanup.snapshot(folder);
      await fs.mkdir(folder);
      const marker = path.join(folder, '.omnianime');
      await fs.writeFile(marker, 'original');
      await cleanup.record(folder, before);
      const stat = await fs.stat(marker);
      if (changed) await fs.writeFile(marker, 'personal');
      await fs.utimes(marker, stat.atime, stat.mtime);
      assert.equal(await cleanup.removeIfEmpty(folder), changed ? 'preserved' : 'removed');
      if (changed) assert.equal(await fs.readFile(marker, 'utf8'), 'personal');
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
